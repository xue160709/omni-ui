# Multimodal shadcn Registry

This package is an optional source-code registry for teams that want starter UI, not a required runtime dependency.

Use `@multimodal-ui/react` directly when you are adding multimodal behavior to an existing React app. Use this registry when you want editable shadcn-style components and recipes installed into your project.

## What It Installs

Registry items target `components/multimodal/*` and keep your existing `components/ui/*` intact.

The low-level wrappers cover common controls such as buttons, button groups, inputs, OTP inputs, input groups, checkboxes, radio groups, switches, toggles, tabs, accordions, collapsibles, select, native select, command, combobox, menus, navigation menus, breadcrumbs, sidebars, popovers, tooltips, hover cards, sheets, drawers, calendars, date pickers, carousels, dialogs, alert dialogs, alerts, empty states, fields, form fields, cards, items, scroll areas, progress, resizable panels, tables, pagination, toasts, and lists.

The starter recipes provide higher-level building blocks:

- `multimodal-assistant-panel`: a chat/command panel that tries local actions before optional model fallback.
- `multimodal-form`: semantic form, section, and action groups.
- `multimodal-data-table`: a data view with visible-order row semantics and row action buttons.

## Styling

Installed files are local source code. Developers can edit class names, markup, behavior, and theme usage directly.

The registry intentionally relies on the consumer app's shadcn components, Tailwind setup, and CSS variables instead of shipping a separate design system.

## Build

Generate the local registry output:

```bash
npm run registry:build
```

The generated files are written to `apps/docs/public/r` for local preview.
