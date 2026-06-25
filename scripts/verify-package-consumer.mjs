import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join } from "node:path"

const packDir = process.argv[2]
if (!packDir) throw new Error("Usage: node scripts/verify-package-consumer.mjs <pack-dir>")

const files = readdirSync(packDir)
const corePack = files.find((file) => /^omni-ui-core-.*\.tgz$/.test(file))
const reactPack = files.find((file) => /^omni-ui-react-.*\.tgz$/.test(file))

if (!corePack) throw new Error("Missing @omni-ui/core tarball.")
if (!reactPack) throw new Error("Missing @omni-ui/react tarball.")

assertTarball(join(packDir, corePack), [
  "package/dist/index.d.ts",
  "package/dist/index.js",
  "package/dist/advanced.d.ts",
  "package/dist/protocol.d.ts",
  "package/dist/server.d.ts",
  "package/dist/testing.d.ts",
  "package/package.json",
])
assertTarball(join(packDir, reactPack), [
  "package/dist/index.d.ts",
  "package/dist/index.js",
  "package/dist/advanced.d.ts",
  "package/dist/devtools.d.ts",
  "package/dist/server.d.ts",
  "package/dist/testing.d.ts",
  "package/dist/styles.css",
  "package/package.json",
])

function assertTarball(tarball, expectedEntries) {
  const entries = execFileSync("tar", ["-tf", tarball], { encoding: "utf8" }).trim().split(/\r?\n/)
  for (const expected of expectedEntries) {
    if (!entries.includes(expected)) {
      throw new Error(`${tarball} is missing ${expected}`)
    }
  }
  const packageJson = execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
    encoding: "utf8",
  })
  const parsed = JSON.parse(packageJson)
  if (!parsed.exports?.["."]) throw new Error(`${parsed.name} is missing root export`)
  if (parsed.name === "@omni-ui/react") {
    if (!parsed.exports["./styles"]) throw new Error("@omni-ui/react is missing ./styles export")
    if (!parsed.exports["./devtools"]) throw new Error("@omni-ui/react is missing ./devtools export")
    if (!parsed.peerDependencies?.react || !parsed.peerDependencies?.["react-dom"]) {
      throw new Error("@omni-ui/react peerDependencies are incomplete")
    }
  }
}
