# Jerry Marotta Gold Seal Flight Instructing

Website for Jerry Marotta, Gold Seal Flight Instructor, Knoxville TN.

Live site: https://jerrymarottaaviation.com

## Project structure

The site remains a dependency-free static site suitable for GitHub Pages and the
current deployment flow.

- `index.html` contains semantic page markup and references the external assets.
- `css/styles.css` contains the site styles.
- `js/app.js` contains booking, navigation, review, and Yelp-loading behavior.
- `data/` contains review and Yelp JSON consumed by the browser.
- `images/` and `scripts/` retain the existing public assets and operational scripts.

When changing a review or Yelp data source, preserve the relative paths in
`js/app.js`; GitHub Pages serves `data/yelp.json` from that location.
