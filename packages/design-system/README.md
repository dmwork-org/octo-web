# @octo/design-system

Zero-framework visual foundations shared by Octo Client and static renderer artifacts.

The package exports CSS entry points rather than React components:

- `@octo/design-system/client.css` — Client semantic aliases (`--octo-*`)
- `@octo/design-system/web.css` — Web/Artifact semantic aliases (`--wk-*`)
- `@octo/design-system/tokens.css` — canonical `--ds-*` values
- `@octo/design-system/base.css` — font, form and focus foundations
- `@octo/design-system/primitives.css` — framework-neutral controls
- `@octo/design-system/layout.css` — reusable shell geometry
- `@octo/design-system/tokens.json` — machine-readable contract

Product-specific page geometry and component behavior remain owned by the consumer.
