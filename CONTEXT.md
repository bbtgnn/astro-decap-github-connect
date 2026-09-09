# CONTEXT — Decap + Astro stopgap (local)

Temporary **local** editorial path while a separate authoring shell lands. **Not** shared architecture with `@cms/*`.

## Language

**Schema owner**:
Zod collection schemas in the consumer app (fixture: `src/lib/schemas.ts`), with FieldUi (`widget`, `label`, `options`) on `.meta()` via `zod-decap-local` helpers.
_Avoid_: treating `config.yml` as source of truth

**Decap editor**:
Temporary React admin SPA at `/admin` (injected by `zodDecap`) writing the working tree through `local_backend` + `decap-server`.
_Avoid_: GitHub OAuth, CMS server, shared core with `@cms/*`

**Codegen**:
One-way Zod → `public/admin/config.yml` inside `zod-decap-local` (`buildDecapConfig` / `writeDecapConfig`).
_Avoid_: bidirectional sync, hand-maintained YAML

**Astro integration**:
`zodDecap({ collections })` writes config, injects `/admin`, resolves/spawns pinned `decap-server@3.11.0` in `astro dev`, optional `watchSchemas` regen.
_Avoid_: fat CMS platform features

**Content contract**:
Files under `src/content/**` loaded with Astro Content Layer `glob()` / `file()`.
_Avoid_: custom Decap content adapter / remote loader

**Write-back (stopgap sense)**:
Decap → `decap-server` → local files → refresh / rebuild.
_Avoid_: conflating with authoring-shell FS write-back via `/_cms`, or remote Git commits

## Closed decisions

- Zod → Decap YAML only
- Local Decap only (`local_backend`); no GitHub OAuth in this stopgap
- Monorepo: `zod-decap-local` package + `fixture` app (Bun + Biome, `@cms` tooling style)
- Media: `public/images` ↔ `/images`
- Widget subset: string, number, boolean, datetime, select, object, list, markdown, image, relation
- Disposable when authoring shell replaces it

## Out of scope

- GitHub OAuth / remote Decap backends
- YAML→Zod, dual hand-edited schemas
- Full Decap widget / i18n / blocks parity
- Shared packages with `@cms/*`
- Editorial workflow / Decap Turbo
