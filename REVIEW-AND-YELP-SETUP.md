# Uniform Review Cards and Live Yelp Rating

Upload:
- `index.html`
- `data/testimonials.json`
- `data/yelp.json`
- `scripts/update-yelp.mjs`
- `.github/workflows/update-yelp.yml`

## Reviews
- Cards are equal height and open the full review when clicked.
- Duplicate reviews are removed first by `id`, otherwise by normalized name and review text.
- The phrase "Approved website testimonial" was removed.
- Yelp review text is not imported, so a Yelp review cannot duplicate a website card.

## Add a review
Add one unique object to `data/testimonials.json` with `id`, `rating`, `name`, `relationship`, `detail`, and `text`. Never publish the reviewer's email.

## Enable Yelp
1. Create a Yelp Places API application.
2. In GitHub repository Settings, add an Actions secret named `YELP_API_KEY`.
3. Run Actions → Update Yelp Rating → Run workflow.
4. If commits fail, enable Read and write workflow permissions.

The action refreshes the Yelp average and review count every six hours. Yelp written reviews remain on Yelp.

Yelp listing: https://www.yelp.com/biz/jerry-marotta-aviation-alcoa
Yelp review form: https://www.yelp.com/writeareview/biz/jerry-marotta-aviation-alcoa
