# Security notes for this project

This is a fully static, client-side calculator: no backend, no database,
no user accounts, no cookies, no analytics, and no network requests other
than loading two Google Fonts files. Everything a visitor types (subjects,
marks) stays in that browser tab's memory and disappears on refresh.

The exceptions are two single, non-sensitive `localStorage` keys:
`pctcalc-theme` remembers whether you last chose the light or dark theme,
and `pctcalc-mode` remembers whether the board mark-sheet calculator or
the everyday quick calculator was open last — so neither resets every
visit. Each holds only a short fixed string (`"light"`/`"dark"` or
`"board"`/`"quick"`) — no marks, names, or other personal data — and
every read/write is wrapped in `try/catch` so the app still works if
storage is blocked (private browsing, locked-down browser settings, etc.).

## What's already hardened in the code

- **Strict Content-Security-Policy** (`index.html`, `<meta http-equiv>`):
  scripts and styles may only load from this site itself (plus Google
  Fonts for style/font files); no inline `<script>`, no `eval`, no framing
  by other sites, no form submissions, no other network connections.
  `manifest-src 'self'` was added so the browser can load
  `manifest.webmanifest` (needed for "Add to Home Screen"); everything
  else about the policy is unchanged.
- **Favicon / home-screen icon.** `favicon.ico`, `favicon-16/32/48.png`,
  `apple-touch-icon.png` and `icon-192/512.png` are plain static images
  served from this site (covered by the existing `img-src 'self'`), and
  `manifest.webmanifest` just points to them plus an app name/theme
  color — no code, no network calls, no data collection.
- **No inline event handlers.** Every `onclick=`/`oninput=` was removed in
  favor of `addEventListener` in `script.js`, so the CSP above does not
  need to allow `'unsafe-inline'` for scripts.
- **No `innerHTML` with user data.** Subject rows are built with
  `document.createElement` / `textContent`, so anything a user types is
  always treated as plain text, never as HTML or executable code.
- **Input sanitization.** Marks fields are coerced to finite numbers and
  clamped to a sane range (0–1000); subject-name length is capped.
- **`Referrer-Policy: no-referrer`** and a locked-down **Permissions-Policy**
  (camera, microphone, geolocation, payment, USB all disabled) are set via
  meta tags, since the page needs none of them.
- **HTTPS by default.** GitHub Pages serves every `github.io` site over
  HTTPS automatically and redirects HTTP to HTTPS.

## Limitations of GitHub Pages you should know about

GitHub Pages serves static files only — it does not let you set custom
HTTP response headers. A few protections are normally delivered as real
headers rather than `<meta>` tags, and browsers ignore the `<meta>`
equivalent for some of them:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (the CSP `frame-ancestors 'none'` above covers
  the same risk in modern browsers, but older ones only respect the header)
- `Strict-Transport-Security` (HSTS) — GitHub Pages already applies this
  at the `github.io` domain level for you
- A header-level `Content-Security-Policy` (stronger than the meta-tag
  version, since it also covers cases the meta tag can't, like blocked
  responses before any HTML is parsed)

If you want those specific headers, deploy the same three files (unchanged)
to a static host that supports custom headers, such as Cloudflare Pages or
Netlify, and add a small config file there (e.g. Netlify's `_headers` file
or Cloudflare's `_headers` file) — no code changes needed.

## Reporting an issue

This is a small personal-use tool with no user data collection, so there's
no dedicated disclosure program — if you spot something, open an issue on
this repository.
