# Cloudflare migration and secure content management

## Current routing

The committed static site supports `/`, `/about/`, `/training/`,
`/chronicles/`, `/chronicles/the-day-fear-took-the-controls/`, `/book/`, and
`/contact/`. These are ordinary static directories, so GitHub Pages can serve
them without rewrite rules. The shared client code uses the pathname rather
than hash navigation.

## Target architecture

Use Cloudflare Pages for the public static site, a Pages Function or Worker for
`/api/*`, D1 for structured editable content, and R2 only for future uploaded
images/documents. Protect `/admin/*` and `/api/admin/*` with Cloudflare Access.
Create two individually named Access identities (the owner and Jerry), require
MFA through the selected identity provider, and use least-privilege roles.

The public app must read only published content through a public read endpoint;
all writes, drafts, publishing, and media uploads must require Access and a
server-side role check. Never place Cloudflare API tokens, D1 credentials, or
admin credentials in this repository or browser JavaScript.

## Initial content model

`site_settings` stores phone, email, home copy, hero statistics, About copy,
and training copy. `chronicles` stores slug, title, summary, body, status, and
publication dates. `testimonials` stores first-party direct testimonials with
separate `reviewer_name`, `attribution_label`, `text`, optional `rating`, and
publication status fields. The reviewer name may remain blank until Jerry knows
who supplied it. Keep Yelp synchronized separately: its public JSON remains
read-only browser data and is not combined with first-party testimonials.

## Deployment steps requiring an owner

1. Create the Cloudflare account/project and connect this repository.
2. Configure Pages with no secret-bearing client build variables.
3. Create D1 and apply an audited migration; create an R2 bucket only when
   uploads are needed.
4. Configure Cloudflare Access policies for the two named admin accounts.
5. Add the production custom domain and DNS only after preview validation.
6. Replace the temporary `/admin/` footer destination with the Access-protected
   admin application after it exists.

## Repository deployment foundation

`wrangler.toml` and `migrations/0001_content.sql` are ready for a Pages/D1
deployment. Before any deploy, replace the placeholder D1 database ID, apply
the migration, and configure Access to require the two named MFA identities on
both `/admin/*` and `/api/admin/*`. The Worker/API must validate the Access JWT
server-side before it reads or writes D1; do not deploy a write API beforehand.
