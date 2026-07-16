# Review moderation workflow

The public form submits to:

https://formspree.io/f/xykrkebj

Form notifications should go to:

tristanstuff@denjess.com

## What happens after someone submits

1. Formspree emails the submission to Tristan and stores it in the Formspree dashboard.
2. Nothing is published automatically.
3. Verify that the reviewer appears genuine and granted publication permission.
4. Edit `data/testimonials.json`.
5. Add one object inside the `reviews` array.
6. Commit the updated JSON file to GitHub.
7. The website automatically recalculates the approved-review count and average rating.

## Review object template

{
  "id": "unique-short-id",
  "rating": 5,
  "name": "Display Name",
  "relationship": "Private Pilot Student",
  "detail": "Student since 2024",
  "text": "The approved review text."
}

## Privacy rules

- Never copy the reviewer's email address into the public JSON file.
- Use only the display name the reviewer supplied.
- Publish only submissions with `permission_to_publish` set to `Yes`.
- Keep Yelp reviews and website testimonials labeled separately.
- Do not change a reviewer's star rating.
- Correct obvious spelling only when it does not change the reviewer's meaning.

## Yelp links

Yelp listing:
https://www.yelp.com/biz/jerry-marotta-aviation-alcoa

Write a Yelp review:
https://www.yelp.com/writeareview/biz/jerry-marotta-aviation-alcoa

The website does not combine Yelp's rating with the approved website-testimonial average.
