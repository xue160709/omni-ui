import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const packageRoot = path.join(repoRoot, "packages/shadcn")
const registryRoot = path.join(packageRoot, "registry")
const outputRoot = path.join(repoRoot, "apps/docs/public/r")

const source = JSON.parse(await readFile(path.join(registryRoot, "registry.json"), "utf8"))

await mkdir(outputRoot, { recursive: true })

const index = {
  $schema: source.$schema,
  name: source.name,
  homepage: source.homepage,
  items: source.items.map(({ files: _files, ...item }) => item),
}

await writeFile(path.join(outputRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`)

for (const item of source.items) {
  const files = await Promise.all(
    item.files.map(async (file) => ({
      ...file,
      content: await readFile(path.join(packageRoot, file.path), "utf8"),
    }))
  )

  await writeFile(
    path.join(outputRoot, `${item.name}.json`),
    `${JSON.stringify({ ...item, files }, null, 2)}\n`
  )
}

console.log(`Built ${source.items.length} registry items in ${path.relative(repoRoot, outputRoot)}`)
