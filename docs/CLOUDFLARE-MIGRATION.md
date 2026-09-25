# Cloudflare hosting and website admin

## What runs where

- **Cloudflare Pages** project jerry-marotta-aviation builds this repository.
  main is production (jerry-marotta-aviation.pages.dev); every other branch
  gets a preview URL.
- **Cloudflare D1** database jerry-marotta-content (binding DB, see
  wrangler.toml) stores admin-managed content.
- **Cloudflare Access** application "Jerry Marotta Website Admin" protects
  /admin and /api/admin on the pages.dev hostname and its preview subdomains.
  Login method is One-time PIN (a code emailed to the admin). Only the two
  allowed admin emails pass the policy.
- The public site is still served from GitHub Pages at jerrymarottaaviation.com
  until DNS is moved to Cloudflare. The public site works in both places; the
  admin and content API only work on Cloudflare.

## Pages secrets (set in the dashboard, never in this repository)

| Name | Purpose |
| --- | --- |
| ACCESS_TEAM_DOMAIN | Zero Trust team domain used to verify Access tokens |
| ACCESS_AUD | Audience tag of the Access application |
| ADMIN_EMAILS | Comma-separated allowlist checked after Access |

If any of these are missing, /api/admin/* refuses every request.

## Code layout

- functions/_lib/access.js verifies the Cf-Access-Jwt-Assertion token
  (signature, audience, issuer, expiry, allowlisted email).
- functions/api/admin/[[path]].js is the admin API. Writes must be same-origin
  JSON; rich text is sanitized server-side; every change is written to
  audit_log.
- functions/api/content.js is the public read-only feed of published content.
- functions/chronicles/[[path]].js renders published D1 Chronicles with the
  site's article layout and falls through to static files otherwise.
- js/cms.js applies saved page text and key facts on top of the static HTML.
  The static HTML is always the fallback.
- admin/ is the admin application.

## Editable content model

- Page text: site_settings rows keyed text:<hash>, where the hash is taken from
  the element's original wording (js/cms.js collect()). If the static wording
  changes in the HTML, the old edit simply stops applying.
- Key facts: site_settings rows fact:flight_hours, fact:years,
  fact:phone_display, fact:phone_digits, fact:email.
- Testimonials and Chronicles: their own tables, with draft/published status.

## Migrations

Applied to the remote database and recorded in d1_migrations:
0001_content.sql and 0002_admin.sql. Apply future migrations with
wrangler d1 migrations apply jerry-marotta-content --remote.

## Yelp

Yelp's API trial expired, and its terms do not allow scraping, so the site
shows Yelp as links only (read reviews and write a review). The
update-yelp.yml workflow is disabled. If Jerry claims the listing, Yelp's
official review badge can be embedded instead.

## Remaining step

Move jerrymarottaaviation.com DNS to Cloudflare, attach it to the Pages
project as a custom domain, and add the custom domain's /admin and /api/admin
paths to the Access application.
