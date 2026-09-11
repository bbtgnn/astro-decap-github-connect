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

`bun run dev` → fixture Astro + local Decap session (`decap-server`). Config keeps `local_backend: true` (Decap default proxy on **8081**). No OAuth routes.

Fixture pins Astro port **4321**; if busy, Astro takes the next free port — open `/admin` on that port. Proxy requires **8081**; if busy and not owned by our session, fail (no free-port pick, no YAML URL rewrite). `decap-server@3.11.0` is a dependency of `zod-decap-local`; Decap CMS browser build is **vendored** (`vendor/decap-cms.js`, same pin) and copied into app `public/` beside `config.yml`. Missing server pin fails with a reinstall hint. `watchSchemas: true` + `schemaOwnerHint` regenerates YAML on schema edits.

## Do not

- Build YAML→Zod or bidirectional sync
- Add a Content Layer loader “for Decap”
- Reintroduce GitHub OAuth / SSR adapter for local editorial
- Import or publish shared packages with `astro-dev-cms-gui` / `@cms/*`
- Expand widget parity beyond the boring subset without an explicit ask

## Prove the loop

`bun run dev` → edit in `/admin` → file changes under `packages/fixture/src/content/` → site shows content via `glob()`.

CI can publish fixture `dist/` to GitHub Pages; editorial remains local-only.
