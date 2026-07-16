import fs from 'node:fs/promises';
import path from 'node:path';
const API_KEY=process.env.YELP_API_KEY;
const BUSINESS_ALIAS='jerry-marotta-aviation-alcoa';
const OUTPUT_PATH=path.resolve('data/yelp.json');
if(!API_KEY) throw new Error('Missing YELP_API_KEY repository secret.');
const response=await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(BUSINESS_ALIAS)}`,{headers:{Authorization:`Bearer ${API_KEY}`,Accept:'application/json'}});
if(!response.ok){const body=await response.text();throw new Error(`Yelp request failed: ${response.status} ${response.statusText}\n${body}`);}
const business=await response.json();
const output={status:'ok',business_alias:BUSINESS_ALIAS,name:business.name||'Jerry Marotta Aviation',rating:business.rating??null,review_count:business.review_count??null,url:business.url||'https://www.yelp.com/biz/jerry-marotta-aviation-alcoa',updated_at:new Date().toISOString()};
await fs.mkdir(path.dirname(OUTPUT_PATH),{recursive:true});
await fs.writeFile(OUTPUT_PATH,JSON.stringify(output,null,2)+'\n','utf8');
console.log(`Updated Yelp rating: ${output.rating??'unavailable'} from ${output.review_count??'unknown'} reviews.`);
