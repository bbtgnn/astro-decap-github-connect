# CONTEXT — Decap + Astro stopgap (local)

Temporary **local** editorial path while a separate authoring shell lands. **Not** shared architecture with `@cms/*`.

## Language

**Schema owner**:
Zod collection schemas in the consumer app (fixture: `src/lib/schemas.ts`), with FieldUi (`widget`, `label`, `options`) on `.meta()` via `zod-decap-local` helpers.
_Avoid_: treating `config.yml` as source of truth

**Decap editor**:
Temporary admin shell injected by `zodDecap`. `publishAdmin` syncs the vendored CMS beside `config.yml` and binds final config/script hrefs (Astro `base` already applied). Writes the working tree through `local_backend` + the local Decap session. Not gated on session-ready UI.
_Avoid_: GitHub OAuth, CMS server, CDN script tags, path/env round-trips in the shell, shared core with `@cms/*`; bundling Decap into the site app graph

**Codegen**:
One-way Zod → `public/admin/config.yml` inside `zod-decap-local` (`buildDecapConfig` / `writeDecapConfig`).
_Avoid_: bidirectional sync, hand-maintained YAML

**Astro integration**:
`zodDecap({ collections })` writes config, injects `/admin`, drives the local Decap session in `astro dev`, optional `watchSchemas` regen.
_Avoid_: fat CMS platform features; embedding proxy lifecycle in the integration hook

**Local Decap session**:
Package-private lifecycle for the pinned `decap-server` proxy: ensure / reuse / stop / ready at the app working-tree `cwd` (binary resolved from the library). Prefers proxy port 8081; if that port is busy and not owned, picks a free port and aligns `local_backend.url` before spawn. Exposes `alignedLocalBackendUrl()` (known or not-ready) so watch regen never invents `:8081`.
_Avoid_: soft-adopting a stranger on the port; spawning without aligning config to the chosen port; public start/stop for apps; absorbing pin resolve into this term; adapter-side default ports for YAML

**Content contract**:
Files under `src/content/**` loaded with Astro Content Layer `glob()` / `file()`.
_Avoid_: custom Decap content adapter / remote loader

**Write-back (stopgap sense)**:
Decap → local Decap session (`decap-server`) → local files → refresh / rebuild.
_Avoid_: conflating with authoring-shell FS write-back via `/_cms`, or remote Git commits

## Closed decisions

- Zod → Decap YAML only
- Local Decap only (`local_backend`); no GitHub OAuth in this stopgap
- Monorepo: `zod-decap-local` package + `fixture` app (Bun + Biome, `@cms` tooling style)
- Media: `public/images` ↔ `/images`
- Widget subset: string, number, boolean, datetime, select, object, list, markdown, image, relation
- Decap CMS browser build vendored at `decap-cms@3.11.0` (same pin generation as `decap-server`)
- Disposable when authoring shell replaces it

## Out of scope

- GitHub OAuth / remote Decap backends
- YAML→Zod, dual hand-edited schemas
- Full Decap widget / i18n / blocks parity
- Shared packages with `@cms/*`
- Editorial workflow / Decap Turbo
