# Agent notes

## Monorepo

- **Package:** `packages/zod-decap-local` — FieldUi helpers, Zod→Decap codegen, Astro integration, CLI
- **Fixture:** `packages/fixture` — Astro dogfood site (owns schemas + content)
- **Tooling:** Bun workspaces + catalog, Biome (tabs). Mirror `astro-dev-cms-gui` style.
- **Never hand-edit** `packages/fixture/public/admin/config.yml`. CI runs `codegen:check`.

## Source of truth (per app)

- **Edit schemas:** `packages/fixture/src/lib/schemas.ts` (or consumer app)
- **Generate:** `zodDecap` integration on `astro dev` / `astro build`, or CLI `--from`
- Schema owner stays in the app — not inside `zod-decap-local`

## Local editorial

`bun run dev` → fixture Astro + integration-spawned `decap-server`. Config must keep `local_backend: true`. No OAuth routes.

## Do not

- Build YAML→Zod or bidirectional sync
- Add a Content Layer loader “for Decap”
- Reintroduce GitHub OAuth / SSR adapter for this stopgap
- Import or publish shared packages with `astro-dev-cms-gui` / `@cms/*`
- Expand widget parity beyond the boring subset without an explicit ask

## Prove the loop

`bun run dev` → edit in `/admin` → file changes under `packages/fixture/src/content/` → site shows content via `glob()`.
