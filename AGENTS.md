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

`bun run dev` → fixture Astro + local Decap session (`decap-server`). Config keeps `local_backend` (with `url` when the proxy port ≠ default). No OAuth routes.

Fixture pins Astro port **4321**; if busy, Astro takes the next free port — open `/admin` on that port. Proxy prefers **8081**; if busy and not owned, session picks a free port and aligns `local_backend.url` before spawn. `decap-server@3.11.0` is a dependency of `zod-decap-local`; missing pin fails with a reinstall hint. `watchSchemas: true` + `schemaOwnerHint` regenerates YAML on schema edits (keeps the session port).

## Do not

- Build YAML→Zod or bidirectional sync
- Add a Content Layer loader “for Decap”
- Reintroduce GitHub OAuth / SSR adapter for this stopgap
- Import or publish shared packages with `astro-dev-cms-gui` / `@cms/*`
- Expand widget parity beyond the boring subset without an explicit ask

## Prove the loop

`bun run dev` → edit in `/admin` → file changes under `packages/fixture/src/content/` → site shows content via `glob()`.

CI can publish fixture `dist/` to GitHub Pages; editorial remains local-only.
