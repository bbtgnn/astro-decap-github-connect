# CONTEXT — Local Decap + Astro

Local-first editorial integration for Astro apps: Zod owns schemas, Decap edits the working tree, Content Layer loads files. Separate from `@cms/*`.

## Language

**Schema owner**:
Zod collection schemas in the consumer app (fixture: `src/lib/schemas.ts`), with FieldUi (`widget`, `label`, `options`) on `.meta()` via `zod-decap-local` helpers.
_Avoid_: treating `config.yml` as source of truth

**Decap editor**:
Admin UI at `/admin` injected by `zodDecap`. `publishAdmin` syncs the pinned `decap-cms` browser build from `node_modules` beside `config.yml` and binds final config/script hrefs (Astro `base` already applied). Writes the working tree through `local_backend` + the local Decap session.
_Avoid_: GitHub OAuth, CMS server, CDN script tags, path/env round-trips in the shell, shared core with `@cms/*`; bundling Decap into the site app graph

**Codegen**:
One-way Zod → `public/admin/config.yml` inside `zod-decap-local` (`buildDecapConfig` / `writeDecapConfig`).
_Avoid_: bidirectional sync, hand-maintained YAML

**Astro integration**:
`zodDecap({ collections })` writes config, injects `/admin`, drives the local Decap session in `astro dev`, optional `watchSchemas` regen.
_Avoid_: fat CMS platform features; embedding proxy lifecycle in the integration hook

**Local Decap session**:
Package-private lifecycle for the pinned `decap-server` proxy: ensure / reuse / stop / ready at the app working-tree `cwd` (binary resolved from the library). Requires proxy port **8081** (Decap default); if that port is busy and not owned by our session, fail — no free-port pick, no soft-adopt, no YAML URL rewrite. Exposes `alignedLocalBackendUrl()` (fixed `:8081` API when the session is up, else not-ready).
_Avoid_: soft-adopting a stranger on the port; picking alternate ports; rewriting `local_backend.url` for non-8081; public start/stop for apps; absorbing pin resolve into this term

**Content contract**:
Files under `src/content/**` loaded with Astro Content Layer `glob()` / `file()`.
_Avoid_: custom Decap content adapter / remote loader

**Write-back**:
Decap → local Decap session (`decap-server`) → local files → refresh / rebuild.
_Avoid_: remote Git commits; treating static hosting as an editorial environment

## Closed decisions

- Zod → Decap YAML only
- Local Decap only (`local_backend`); no GitHub OAuth
- Editorial runs in `astro dev` next to the working tree; static deploy may serve the site, not write-back
- Local Decap session requires proxy port 8081; busy stranger → fail (no free-port align)
- Default emitted config uses `local_backend: true` (Decap default proxy); adapter does not drive alternate URLs
- Monorepo: `zod-decap-local` package + `fixture` app (Bun + Biome)
- Media: `public/images` ↔ `/images`
- Widget subset: string, number, boolean, datetime, select, object, list, markdown, image, relation
- Decap CMS browser build from npm `decap-cms@3.11.0` (same pin generation as `decap-server`; synced into app `public/` at publish)
- Not shared packages / architecture with `@cms/*`

## Out of scope

- GitHub OAuth / remote Decap backends
- YAML→Zod, dual hand-edited schemas
- Full Decap widget / i18n / blocks parity
- Shared packages with `@cms/*`
- Editorial workflow / Decap Turbo
