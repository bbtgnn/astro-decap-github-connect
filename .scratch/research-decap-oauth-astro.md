# Astro + Decap CMS + GitHub OAuth (no Netlify Identity)

Primary-source notes for a stopgap CMS. Researched 2026-09-09.

## Verdict (actionable)

1. Put Decap admin under `public/admin/` (Astro static) + load CMS JS; content commits go to GitHub via `backend: github`.
2. For non-Netlify auth, Astro docs require **on-demand OAuth routes + an SSR adapter** — not pure static-only hosting for those routes.
3. Astro currently points to template **`astro-decap-starter-ssr`**; package **`astro-decap-cms-oauth`** is the integration that injects `/admin` + `/oauth` + `/oauth/callback`.
4. **GitHub Pages** is fine for a *static* Astro site build, but **cannot run OAuth callbacks**. Either host OAuth on an SSR/edge proxy (`base_url`) or deploy the app somewhere with an adapter (Node/Vercel/Netlify/Cloudflare).

---

## 1. Astro Decap guide

Source: https://docs.astro.build/en/guides/cms/decap-cms/

| Fact | Detail |
|------|--------|
| Install | `npm install decap-cms-app` **or** CDN `https://unpkg.com/decap-cms@^3.1.2/dist/decap-cms.js` |
| Static admin | `public/admin/config.yml` |
| Admin page | Example: `src/pages/admin.html` with `<link href="config.yml" type="text/yaml" rel="cms-config-url" />` + Decap script |
| Media | `media_folder` / `public_folder` (example: both `src/assets/images`) |
| UI URL | `yoursite.com/admin/` |
| Netlify Identity | First-class when on Netlify |
| External OAuth | “you must create your own OAuth routes” via **on-demand rendered routes** with an **adapter enabled** |
| Community templates | Netlify Identity: `astro-decap-ssg-netlify`; OAuth: **`astro-decap-starter-ssr`** |
| OAuth client list | Points to Decap OAuth docs |

---

## 2. Decap install / config

### Install layout

Source: https://decapcms.org/docs/install-decap-cms/

- Astro static files live in `/public` → use `public/admin/`.
- Files: `admin/index.html` + `admin/config.yml` (or Astro page + `config.yml` as above).
- CDN: `https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js` (alt: jsDelivr).
- npm: `decap-cms-app` → `import CMS from "decap-cms-app"; CMS.init();`

### Required / common top-level config

Source: https://decapcms.org/docs/configuration-options/

- `backend` — required
- `media_folder` — required (repo-relative upload path)
- `public_folder` — URL/path prefix for media fields (defaults from `media_folder`)
- `collections` — schemas / widgets
- Optional: `publish_mode: editorial_workflow`, `site_url`, `media_processing`, etc.

---

## 3. GitHub backend + external OAuth

### Minimal GitHub backend (Netlify-facilitated auth default)

Source: https://decapcms.org/docs/github-backend/

```yaml
backend:
  name: github
  repo: owner-name/repo-name
  # branch: main   # optional; docs say default is master
```

- All CMS users need **push access** to the repo.
- Optional: `preview_context`, `use_graphql: true`.
- Git LFS **not** supported.

### Shared `backend.*` keys (external OAuth)

Source: https://decapcms.org/docs/backends-overview/

| Key | Default (GitHub) | Role |
|-----|------------------|------|
| `name` | — | `github` |
| `repo` | none | `owner/repo` (required) |
| `branch` | `master` | publish / CMS commit branch |
| `api_root` | `https://api.github.com` | Enterprise override |
| `site_domain` | `location.hostname` | `site_id` query param; often needed for local/non-Netlify |
| `base_url` | `https://api.netlify.com` | **OAuth client hostname (no path)** — set to your OAuth host |
| `auth_endpoint` | `auth` | Path appended to `base_url` |
| `cms_label_prefix` | `decap-cms/` | Editorial workflow PR labels |

### OAuth proxy path convention (Decap generic)

Same page: proxy should serve:

1. `{base_url}/{auth_endpoint}` — start GitHub authorize (default path segment `auth`)
2. `{base_url}/callback` — exchange code; `postMessage` token back to Decap popup

Astro community packages **override** this to `/oauth` + `/oauth/callback` via `auth_endpoint: oauth` (see below).

### Community OAuth clients list

Source: https://decapcms.org/docs/external-oauth-clients/

Table of GitHub OAuth proxies (Node, Go, CF Pages, Vercel, Firebase, etc.). No Astro-specific entry in that table; Astro docs instead recommend the SSR starter.

---

## 4. Community Astro packages / templates

### What Astro docs recommend

- Template: https://github.com/OliverSpeir/astro-decap-starter-ssr  
  Linked from https://docs.astro.build/en/guides/cms/decap-cms/ as “On-demand rendering OAuth Routes with Astro Template”.

### `astro-decap-cms-oauth` (integration)

Sources:

- https://github.com/dorukgezici/astro-decap-cms-oauth (README)
- https://www.npmjs.com/package/astro-decap-cms-oauth (v0.5.2; peer `astro` `^5 \|\| ^6`)

**Install**

```bash
npx astro add astro-decap-cms-oauth
# or
npm install astro-decap-cms-oauth
```

```js
import decapCmsOauth from "astro-decap-cms-oauth";
export default defineConfig({
  integrations: [decapCmsOauth()],
});
```

**Mounted routes (defaults)**

| Route | Purpose |
|-------|---------|
| `/admin` | CMS dashboard |
| `/oauth` | login / redirect to GitHub |
| `/oauth/callback` | GitHub callback |

Options: `adminRoute`, `oauthLoginRoute`, `oauthCallbackRoute`, `adminDisabled`, `oauthDisabled`, `decapCMSVersion`, `decapCMSSrcUrl`.

**`config.yml` backend block (from package README)**

```yaml
backend:
  name: github
  branch: main
  repo: owner/repo
  site_domain: your.domain.tld
  base_url: https://your.domain.tld
  auth_endpoint: oauth
```

**Env vars**

```bash
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=
# GitHub App only:
OAUTH_GITHUB_REPO_ID=
# optional:
PUBLIC_DECAP_CMS_SRC_URL=https://unpkg.com/decap-cms@^3.11.0/dist/decap-cms.js
PUBLIC_DECAP_CMS_VERSION=3.11.0
```

**GitHub OAuth App (package README)**

- Homepage URL = prod app URL  
- Authorization callback URL = `{prod URL}/oauth/callback`  
- Register at https://github.com/settings/applications/new  

**SSR claim:** README: deploy “anywhere that supports SSR”.

### `astro-decap-starter-ssr` (hand-rolled routes)

Sources:

- https://github.com/OliverSpeir/astro-decap-starter-ssr
- https://raw.githubusercontent.com/OliverSpeir/astro-decap-starter-ssr/main/README.md
- `public/admin/config.yml`, `astro.config.ts`, `src/pages/oauth/*.ts`, `.env.sample`, `package.json`

| Item | Value |
|------|--------|
| Adapter | `@astrojs/node` `{ mode: "standalone" }` |
| OAuth routes | `src/pages/oauth/index.ts`, `src/pages/oauth/callback.ts` with `export const prerender = false` |
| Env | `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET` via `astro:env` server secrets |
| GitHub authorize scope | `repo,user` |
| Callback | POST `https://github.com/login/oauth/access_token`; HTML that `postMessage`s `authorization:github:success:{token…}` |
| Site static? | README: endpoints are on-demand; “your site can remain static” (hybrid) |
| Config keys to change | `repo`, `site_domain` (README says “sitename”), `base_url` |
| Private repos | add CMS users as collaborators |
| Ack | credits `astro-decap-cms-oauth` |

**Starter `config.yml` (exact):**

```yaml
backend:
  name: github
  repo: username/repo-name
  branch: main
  site_domain: localhost:4321
  base_url: http://localhost:4321
  auth_endpoint: oauth

media_folder: src/assets/img
public_folder: src/assets/img
```

**Callback URL:** `{prod URL}/oauth/callback` (README also allows `localhost:4321` as Homepage during dev).

### Official GitHub OAuth App fields

Source: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app

- Homepage URL, Authorization callback URL (up to 10 callbacks).

---

## 5. Is an SSR adapter required?

| Source | Claim |
|--------|--------|
| Astro Decap guide | External OAuth → on-demand routes **with adapter enabled** |
| Astro on-demand docs | Any on-demand page/endpoint needs an **adapter** | https://docs.astro.build/en/guides/on-demand-rendering/ |
| Starter | Uses `@astrojs/node`; routes set `prerender = false` |
| `astro-decap-cms-oauth` | “deployed anywhere that supports SSR” |

**Practical stopgap:**

- **Public site static** + **OAuth SSR** on same host (hybrid / adapter) — starter model.  
- **OR** static site on GitHub Pages + **separate** OAuth proxy domain in `backend.base_url` (Decap backends-overview / Cloudflare Worker pattern).  
- **NOT** OAuth routes on GitHub Pages alone (Pages workflow is static HTML only).

---

## 6. Widgets — minimal reliable subset

Sources:

- Astro guide collection example: https://docs.astro.build/en/guides/cms/decap-cms/
- Full widget list: https://decapcms.org/docs/widgets/
- Starter blog fields: starter `config.yml`

**Astro docs example fields:** `hidden`, `string`, `datetime`, `image`, `number`, `markdown`.

**Starter blog fields:** `string`, `datetime`, `image`, `markdown`.

**Built-in widget names (docs):** `boolean`, `code`, `color`, `datetime`, `file`, `hidden`, `image`, `list`, `map`, `richtext` (beta), `markdown` (**deprecated** in widgets docs — prefer `richtext`), `number`, `object`, `relation`, `select`, `string`, `text`.

**Stopgap mapping note:** For a blog/content-collection stopgap, stick to Astro’s documented set (`string` / `datetime` / `image` / `markdown` / `hidden` / `number`). Be aware Decap now marks `markdown` deprecated in favor of `richtext`; Astro’s current guide still shows `markdown`.

---

## 7. GitHub Actions → Astro → GitHub Pages

Source: https://docs.astro.build/en/guides/deploy/github/

**Recommended:** official `withastro/action@v6` + `actions/deploy-pages@v5`.

Workflow sketch (from docs):

- Trigger: `push` to `main` + `workflow_dispatch`
- Permissions: `contents: read`, `pages: write`, `id-token: write`
- Job `build`: `actions/checkout@v7` → `withastro/action@v6`
- Job `deploy`: `actions/deploy-pages@v5` (environment `github-pages`)
- Repo Settings → Pages → Source: **GitHub Actions**
- `astro.config`: set `site` to `https://<user>.github.io` (and `base: '/<repo>'` unless `*.github.io` user site)
- Custom domain: `public/CNAME` + update `site`; remove `base`

This deploys a **static, prerendered** site. It does **not** satisfy Decap GitHub OAuth route hosting.

---

## Implementation checklist (stopgap)

1. `public/admin/config.yml` with `backend.name: github`, `repo`, `branch`, `base_url`, `auth_endpoint: oauth`, `site_domain`, `media_folder`, `public_folder`, collections.
2. Admin UI: integration (`astro-decap-cms-oauth`) **or** `admin.html` / `public/admin/index.html` + CDN/npm CMS.
3. Create GitHub OAuth App; callback `{origin}/oauth/callback`; set `OAUTH_GITHUB_CLIENT_ID` / `OAUTH_GITHUB_CLIENT_SECRET`.
4. Add adapter; mark OAuth endpoints `prerender = false` (or use the integration).
5. Ensure CMS users have repo push access.
6. If marketing site must stay on GitHub Pages: host only OAuth on SSR/edge and point `base_url` there; keep Pages for static HTML via Astro’s Pages Action.

---

## Source index

| Topic | URL |
|-------|-----|
| Astro Decap CMS | https://docs.astro.build/en/guides/cms/decap-cms/ |
| Astro on-demand / adapters | https://docs.astro.build/en/guides/on-demand-rendering/ |
| Astro GitHub Pages deploy | https://docs.astro.build/en/guides/deploy/github/ |
| Decap install | https://decapcms.org/docs/install-decap-cms/ |
| Decap configuration | https://decapcms.org/docs/configuration-options/ |
| Decap backends overview | https://decapcms.org/docs/backends-overview/ |
| Decap GitHub backend | https://decapcms.org/docs/github-backend/ |
| Decap external OAuth clients | https://decapcms.org/docs/external-oauth-clients/ |
| Decap widgets | https://decapcms.org/docs/widgets/ |
| `astro-decap-cms-oauth` README | https://github.com/dorukgezici/astro-decap-cms-oauth |
| npm package | https://www.npmjs.com/package/astro-decap-cms-oauth |
| `astro-decap-starter-ssr` | https://github.com/OliverSpeir/astro-decap-starter-ssr |
| Create GitHub OAuth App | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app |
