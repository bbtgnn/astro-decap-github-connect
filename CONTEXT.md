# CONTEXT — Decap + Astro stopgap (local)

Temporary **local** editorial path while a separate authoring shell lands. **Not** shared architecture with `@cms/*`.

## Language

**Content config**:
Astro’s `src/content.config.ts` and its `export const collections` — the registry that names collections and wires loaders to Zod schemas.
_Avoid_: `collectionSchemas`, a parallel Decap-only registry

**Schema owner**:
Plain Zod schemas used by Content Layer (often co-located or imported into the content config), with optional Decap chrome via `.meta(fieldOptions(…))` / `.meta(collectionOptions(…))`.
_Avoid_: FieldUi helper constructors (`text()`, `relation()`, …) as the app-facing style; treating `config.yml` as source of truth

**Field options**:
Discriminated editorial meta (`widget`, `label`, relation targets, …) applied with `fieldOptions` and read when emitting Decap config.
_Avoid_: Decap snake_case keys in app source; untyped option bags as the primary path

**Collection options**:
Optional collection-level meta (`label`, `folder`, `format`, …) when the loader stamp is missing or must be overridden.
_Avoid_: duplicating folder paths only for Decap when the Astro loader already defines them

**Loader stamp**:
Passthrough record of Astro loader inputs (`glob` / `file` base, pattern, …) visible to Decap emit without changing Content Layer behaviour.
_Avoid_: parsing loader closures or `.astro` data-store as source of truth

**Astro content proxy**:
Shared stamp helpers (relation / image meta, loader stamps) with thin boot and emit adapters — boot wraps live `astro:content` / aliases `astro/loaders`; emit rewrites both to shims — preserving Astro validation while adding stamps/meta for emit.
_Avoid_: replacing Astro validators with Decap-only fakes in the app graph; forcing one runtime path for boot and emit

**Decap emit**:
One-way walk from content-config collections → `public/admin/config.yml` (load + build + write/check).
_Avoid_: bidirectional sync, hand-maintained YAML, exporting Zod walkers as the package face

**Decap editor**:
Temporary React admin SPA at `/admin` (injected by `zodDecap`) writing the working tree through `local_backend` + `decap-server`.
_Avoid_: GitHub OAuth, CMS server, shared core with `@cms/*`

**Editorial session**:
Local Decap runtime owned by `session/`: emit via compiled CLI, schema-watch regen, and `decap-server` resolve/spawn/reuse/port.
_Avoid_: burying that lifecycle inside Astro hook bodies; treating the session as a public package export

**Astro integration**:
Thin `zodDecap` adapter: resolve paths, content-proxy Vite wiring, inject `/admin`, call the editorial session from Astro hooks.
_Avoid_: fat CMS platform features; passing a static `collections` array into the integration; owning emit/server lifecycle in the adapter

**Content contract**:
Files under `src/content/**` (or loader bases) loaded with Astro Content Layer.
_Avoid_: custom Decap content adapter / remote loader

**Image bridge**:
Decap edits public path strings; apps usually use `z.string()` + `fieldOptions({ widget: "image" })`. Astro function-schema `image()` is an object (`src`/`width`/`height`/`format`); emit flattens that shape to a Decap `image` widget internally.
_Avoid_: full asset-pipeline parity with import ids / `_astro` URLs; advertising image-bridge helpers as public API

**Write-back (stopgap sense)**:
Decap → `decap-server` → local files → refresh / rebuild.
_Avoid_: conflating with authoring-shell FS write-back via `/_cms`, or remote Git commits

## Closed decisions

- Zod → Decap YAML only; registry is Astro `collections`, not a side list
- Plain Zod + optional `fieldOptions` / `collectionOptions`; derive widgets aggressively; hard-fail mismatched meta at emit
- Local Decap only (`local_backend`); no GitHub OAuth in this stopgap
- Astro content proxy: shared stamps + boot/emit adapters (passthrough + stamp); CLI shares emit shims
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
- Full bidirectional Astro image asset pipeline
