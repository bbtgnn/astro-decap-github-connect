# Vendored Decap CMS

`decap-cms.js` is the browser build from npm **`decap-cms@3.11.0`** (`dist/decap-cms.js`).

- Pin: `DECAP_CMS_PIN` in `src/pins.ts` (keep in lockstep with `DECAP_SERVER_PIN` unless deliberately diverging)
- License: MIT — see `LICENSE` and `decap-cms.js.LICENSE.txt`
- Do not load from unpkg/CDN; the Astro integration copies this file into the app `public/` next to `config.yml`

To refresh after a pin bump:

```bash
# from repo root
TMP=$(mktemp -d)
curl -fsSL "https://registry.npmjs.org/decap-cms/-/decap-cms-<PIN>.tgz" | tar -xz -C "$TMP"
cp "$TMP/package/dist/decap-cms.js" packages/zod-decap-local/vendor/
cp "$TMP/package/dist/decap-cms.js.LICENSE.txt" packages/zod-decap-local/vendor/
rm -rf "$TMP"
```
