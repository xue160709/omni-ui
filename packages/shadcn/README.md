# @omni-ui/shadcn

Optional shadcn registry source for OmniUI.

Use `@omni-ui/react` directly when you are adding multimodal behavior to an existing React app. Use this registry when you want editable shadcn-style wrappers and starter recipes installed into your project.

The registry installs source files into `components/multimodal/*`. It does not replace or overwrite your existing `components/ui/*`.

## Install Registry Items

During local development of this monorepo, start the docs app first:

```bash
npm run dev
```

Then install one or more registry items with the shadcn CLI:

```bash
npx shadcn@latest add http://127.0.0.1:5173/r/multimodal-provider.json
npx shadcn@latest add http://127.0.0.1:5173/r/multimodal-button.json
npx shadcn@latest add http://127.0.0.1:5173/r/multimodal-assistant-panel.json
```

After the public registry is deployed, replace the localhost URL with the published registry URL.

## What It Installs

Low-level wrappers:

| Category | Registry items |
| --- | --- |
| Buttons and toggles | button, button-group, toggle, toggle-group |
| Text inputs | input, textarea, input-otp, input-group |
| Choice controls | checkbox, radio-group, switch, select, native-select, combobox |
| Navigation | tabs, breadcrumb, navigation-menu, menubar, pagination, sidebar |
| Overlays | dialog, alert-dialog, sheet, drawer, popover, tooltip, hover-card, context-menu, dropdown-menu |
| Data and layout | table, list-item, card, item, scroll-area, resizable, progress |
| Feedback and content | alert, empty, toast, sonner, calendar, date-picker, carousel |
| Command surfaces | command |

Starter recipes:

- `multimodal-assistant-panel`: chat/command panel with local actions before optional model fallback.
- `multimodal-form`: semantic form, section, and action groups.
- `multimodal-data-table`: data view with visible-order row semantics and row action buttons.

## Styling

Installed files are local source code. You can edit class names, markup, behavior, and theme usage directly.

The registry intentionally relies on the consumer app's shadcn components, Tailwind setup, and CSS variables instead of shipping a separate design system.

## Maintainer Commands

Generate local registry JSON for preview:

```bash
npm run registry:build
```

The generated files are written to `apps/docs/public/r`.

Run registry tests and rebuild the registry output:

```bash
npm run verify:registry
```
