import fs from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.YELP_API_KEY;
const BUSINESS_ALIAS = 'jerry-marotta-alcoa';
const BUSINESS_URL = 'https://www.yelp.com/biz/jerry-marotta-alcoa';
const OUTPUT_PATH = path.resolve('data/yelp.json');

if (!API_KEY) throw new Error('Missing YELP_API_KEY repository secret.');

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: 'application/json'
};

async function getJson(url) {
  const response = await fetch(url, {headers});
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Yelp request failed: ${response.status} ${response.statusText}\n${body}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

const business = await getJson(
  `https://api.yelp.com/v3/businesses/${encodeURIComponent(BUSINESS_ALIAS)}`
);

let reviews = [];
let reviewsStatus = 'ok';

try {
  const reviewResponse = await getJson(
    `https://api.yelp.com/v3/businesses/${encodeURIComponent(BUSINESS_ALIAS)}/reviews?limit=3&sort_by=yelp_sort`
  );

  reviews = (reviewResponse.reviews || []).slice(0, 3).map(review => ({
    id: review.id,
    rating: review.rating,
    text: review.text,
    time_created: review.time_created,
    url: review.url,
    user_name: review.user?.name || 'Yelp reviewer'
  }));
} catch (error) {
  if (error.status === 401 || error.status === 403) {
    reviewsStatus = 'plan_required';
    console.warn('The Yelp plan does not allow review excerpts. Rating and review count will still update.');
  } else {
    reviewsStatus = 'temporarily_unavailable';
    console.warn(error.message);
  }
}

const output = {
  status: 'ok',
  business_alias: BUSINESS_ALIAS,
  name: business.name || 'Jerry Marotta Aviation',
  rating: business.rating ?? null,
  review_count: business.review_count ?? null,
  reviews_status: reviewsStatus,
  reviews,
  url: business.url || BUSINESS_URL,
  updated_at: new Date().toISOString()
};

await fs.mkdir(path.dirname(OUTPUT_PATH), {recursive:true});
await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(
  `Updated Yelp: ${output.rating ?? 'unavailable'} stars, ` +
  `${output.review_count ?? 'unknown'} reviews, ${reviews.length} excerpts.`
);
