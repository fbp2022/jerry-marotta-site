const JERRY_NUMBER = '8657247251';
const JERRY_EMAIL = 'jerry.marotta@hotmail.com';

const TESTIMONIALS_DATA_URL = '/data/testimonials.json';
const YELP_LIVE_DATA_URL = '/data/yelp.json';
const ROUTES = {home:'/', about:'/about/', training:'/training/', chronicles:'/chronicles/', article:'/chronicles/the-day-fear-took-the-controls/', book:'/book/', contact:'/contact/'};

const mobileSheet = document.getElementById('mobile-sheet');
const mobileSheetBackdrop = document.getElementById('mobile-sheet-backdrop');
const mobileMoreButton = document.getElementById('mobile-more-btn');
const mobileSheetClose = document.getElementById('mobile-sheet-close');
let currentBookingStep = 1;

function isMobileViewport() {
  return window.matchMedia('(max-width: 1000px)').matches;
}

function setMobileSheet(open) {
  if (!mobileSheet || !mobileSheetBackdrop || !mobileMoreButton) return;
  mobileSheet.classList.toggle('open', open);
  mobileSheetBackdrop.classList.toggle('open', open);
  mobileSheet.setAttribute('aria-hidden', String(!open));
  mobileMoreButton.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeMobileSheet() {
  setMobileSheet(false);
}

if (mobileMoreButton) mobileMoreButton.addEventListener('click', () => setMobileSheet(true));
if (mobileSheetClose) mobileSheetClose.addEventListener('click', closeMobileSheet);
if (mobileSheetBackdrop) mobileSheetBackdrop.addEventListener('click', closeMobileSheet);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMobileSheet();
});

function isMobileDevice() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    return navigator.userAgentData.mobile;
  }
  const ua = navigator.userAgent || '';
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || isIPadOS;
}

function isIOSDevice() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function value(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : '';
}

function getSessionType() {
  const selected = value('session-type');
  return selected === 'other' ? value('other-session') : selected;
}

function getMeetLocation() {
  const selected = value('meet-airport');
  return selected === 'other' ? value('other-airport') : selected;
}

function friendlyDate(rawDate) {
  if (!rawDate) return 'Not specified';
  return new Date(rawDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function buildRequestText() {
  const first = value('fname');
  const last = value('lname');
  const fullName = [first, last].filter(Boolean).join(' ') || 'A prospective student';
  const phone = value('phone');
  const email = value('email');
  const sessionType = getSessionType() || 'Not specified';
  const dateText = friendlyDate(value('preferred-date'));
  const preferredTime = value('preferred-time') || 'Not specified';
  const meetLocation = getMeetLocation() || 'Not specified';
  const duration = value('duration') || '2';
  const experience = value('experience');
  const notes = value('message');

  let request = 'Hi Jerry,\n\n';
  request += 'I would like to request a flight training session.\n\n';
  request += 'SESSION REQUEST\n';
  request += '-------------------------\n';
  request += 'Name: ' + fullName + '\n';
  if (phone) request += 'Phone: ' + phone + '\n';
  if (email) request += 'Email: ' + email + '\n';
  request += '\nSession: ' + sessionType + '\n';
  request += 'Preferred Date: ' + dateText + '\n';
  request += 'Preferred Time: ' + preferredTime + '\n';
  request += 'Meet At: ' + meetLocation + '\n';
  request += 'Duration: ' + duration + ' hours\n';
  if (experience) request += 'Experience: ' + experience + '\n';
  if (notes) request += '\nAdditional Notes:\n' + notes + '\n';
  request += '-------------------------\n';
  request += 'Please reply to confirm or suggest another time.\n\nThank you!';
  return request;
}

function updateRequestPreview() {
  const preview = document.getElementById('request-preview-text');
  if (!preview) return;
  const hasContent = value('fname') || value('phone') || value('session-type') || value('preferred-date');
  preview.textContent = hasContent ? buildRequestText() : 'Fill in the form to preview the message Jerry will receive.';
}

function toggleConditionalFields() {
  const sessionOther = document.getElementById('other-session-field');
  const airportOther = document.getElementById('other-airport-field');
  sessionOther.classList.toggle('visible', value('session-type') === 'other');
  airportOther.classList.toggle('visible', value('meet-airport') === 'other');
  document.getElementById('other-session').required = value('session-type') === 'other';
  document.getElementById('other-airport').required = value('meet-airport') === 'other';
  updateRequestPreview();
}

function calendarTimeFor(date, preferredTime) {
  const timeMap = {
    'Early Morning (7-9 AM)': '07:00:00',
    'Morning (9 AM-12 PM)': '09:00:00',
    'Afternoon (12-4 PM)': '12:00:00',
    'Late Afternoon (4-7 PM)': '16:00:00',
    'Flexible': '09:00:00'
  };
  return new Date(date + 'T' + (timeMap[preferredTime] || '09:00:00'));
}

function pad(number) {
  return number < 10 ? '0' + number : String(number);
}

function formatICSDate(date) {
  return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
    'T' + pad(date.getHours()) + pad(date.getMinutes()) + '00';
}

function escapeICS(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildICS() {
  const first = value('fname');
  const last = value('lname');
  const fullName = [first, last].filter(Boolean).join(' ') || 'Client';
  const sessionType = getSessionType() || 'Training Session';
  const rawDate = value('preferred-date');
  const preferredTime = value('preferred-time');
  const duration = parseInt(value('duration'), 10) || 2;
  const meetLocation = getMeetLocation() || 'Knoxville, TN';
  const startDate = calendarTimeFor(rawDate, preferredTime);
  const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
  const now = new Date();
  const uid = formatICSDate(now) + '-' + Math.random().toString(36).slice(2) + '@jerrymarottaaviation.com';

  let description = 'Session: ' + sessionType + '\\nClient: ' + fullName;
  if (value('phone')) description += '\\nPhone: ' + value('phone');
  if (value('email')) description += '\\nEmail: ' + value('email');
  if (value('experience')) description += '\\nExperience: ' + value('experience');
  if (value('message')) description += '\\nNotes: ' + value('message');
  description += '\\n\\nTentative request. Jerry will confirm the final date, time, location, and training details.';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jerry Marotta Aviation//Flight Session//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTAMP:' + formatICSDate(now) + 'Z',
    'DTSTART:' + formatICSDate(startDate),
    'DTEND:' + formatICSDate(endDate),
    'SUMMARY:' + escapeICS(sessionType + ' with Jerry Marotta'),
    'DESCRIPTION:' + escapeICS(description),
    'LOCATION:' + escapeICS(meetLocation),
    'ORGANIZER;CN=Jerry Marotta:mailto:' + JERRY_EMAIL,
    'STATUS:TENTATIVE',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\\r\\n');
}

function downloadICS() {
  const blob = new Blob([buildICS()], {type: 'text/calendar;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jerry-marotta-session-request.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validateBookingStep(step) {
  const container = document.querySelector('.booking-step[data-step="' + step + '"]');
  if (!container) return true;

  const controls = Array.from(container.querySelectorAll('input,select,textarea'));
  for (const control of controls) {
    const conditionalParent = control.closest('.other-field');
    if (conditionalParent && !conditionalParent.classList.contains('visible')) continue;
    if (!control.checkValidity()) {
      control.reportValidity();
      control.focus();
      return false;
    }
  }

  if (step === 2 && value('session-type') === 'other' && !value('other-session')) {
    document.getElementById('other-session').focus();
    return false;
  }
  if (step === 2 && value('meet-airport') === 'other' && !value('other-airport')) {
    document.getElementById('other-airport').focus();
    return false;
  }
  return true;
}

function showBookingStep(step) {
  const clampedStep = Math.min(3, Math.max(1, Number(step) || 1));
  currentBookingStep = clampedStep;

  document.querySelectorAll('.booking-step').forEach(section => {
    section.classList.toggle('active', Number(section.dataset.step) === clampedStep);
  });

  document.querySelectorAll('.booking-progress-item').forEach(item => {
    const itemStep = Number(item.dataset.bookingStep);
    item.classList.toggle('active', itemStep === clampedStep);
    item.classList.toggle('complete', itemStep < clampedStep);
  });

  if (clampedStep === 3) updateRequestPreview();

  if (isMobileViewport()) {
    const form = document.getElementById('booking-form');
    if (form) {
      const top = form.getBoundingClientRect().top + window.scrollY - 82;
      window.scrollTo({top: Math.max(0, top), behavior: 'smooth'});
    }
  }
}

function validateBookingForm() {
  for (let step = 1; step <= 3; step += 1) {
    if (!validateBookingStep(step)) {
      if (isMobileViewport()) showBookingStep(step);
      return false;
    }
  }
  return true;
}

function submitBooking(event) {
  event.preventDefault();
  if (!validateBookingForm()) return;

  const status = document.getElementById('form-status');
  const requestText = buildRequestText();
  const fullName = [value('fname'), value('lname')].filter(Boolean).join(' ') || 'Prospective Student';
  const subject = 'Flight Training Request from ' + fullName;

  if (isMobileDevice()) {
    status.textContent = 'Opening your Messages app now. Review the request, then tap Send.';
    const separator = isIOSDevice() ? '&' : '?';

    // Do not attempt an .ics download on mobile Safari. Triggering a Blob
    // download and an SMS handoff from the same tap causes Safari to report
    // that the calendar file cannot be downloaded.
    window.location.href = 'sms:' + JERRY_NUMBER + separator + 'body=' + encodeURIComponent(requestText);
  } else {
    downloadICS();
    status.textContent = 'Calendar invite downloaded. Opening your default email application now.';

    setTimeout(() => {
      window.location.href = 'mailto:' + JERRY_EMAIL +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(requestText);
    }, 350);
  }
}

async function copyRequest() {
  const status = document.getElementById('form-status');
  const text = buildRequestText();
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Request copied to your clipboard.';
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    status.textContent = 'Request copied to your clipboard.';
  }
}

function normalizeTestimonial(review) {
  const suppliedRating = Number(review.rating);
  const rating = Number.isFinite(suppliedRating) && suppliedRating > 0 ? Math.max(1, Math.min(5, Math.round(suppliedRating))) : null;
  return {id:String(review.id || '').trim(),rating,name:String(review.name || 'Anonymous student').trim(),relationship:String(review.relationship || 'Aviation student').trim(),detail:String(review.detail || '').trim(),text:String(review.text || '').trim()};
}
function testimonialFingerprint(review) {
  const normalize = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return review.id ? 'id:' + normalize(review.id) : 'content:' + normalize(review.name) + '|' + normalize(review.text);
}
function deduplicateTestimonials(reviews) {
  const seen = new Set();
  return reviews.map(normalizeTestimonial).filter(review => review.text).filter(review => {const key=testimonialFingerprint(review);if(seen.has(key)) return false;seen.add(key);return true;});
}

function calculateTestimonialAverage(reviews) {
  const ratedReviews = reviews.filter(review => review.rating !== null);
  if (!ratedReviews.length) return 0;
  return ratedReviews.reduce((sum, review) => sum + review.rating, 0) / ratedReviews.length;
}

let approvedTestimonials = [];
function createTestimonialCard(review) {
  const button=document.createElement('button');button.type='button';button.className='testimonial-card';button.dataset.testimonialId=review.id;button.setAttribute('aria-label','Read the full review from '+review.name);
  const stars=document.createElement('div');stars.className='testimonial-stars';if(review.rating !== null){stars.textContent='★'.repeat(review.rating)+'☆'.repeat(5-review.rating);stars.setAttribute('aria-label',review.rating+' out of 5 stars');}
  const text=document.createElement('p');text.className='testimonial-text';text.textContent=review.text;
  const footer=document.createElement('div');footer.className='testimonial-footer';const name=document.createElement('strong');name.textContent=review.name;const relationship=document.createElement('span');relationship.textContent=review.detail?review.relationship+'\n'+review.detail:review.relationship;relationship.style.whiteSpace='pre-line';footer.append(name,relationship);button.append(stars,text,footer);button.addEventListener('click',()=>openReviewDialog(review));return button;
}

function renderTestimonials(reviews) {
  const normalized = deduplicateTestimonials(reviews);
  if (!normalized.length) return;

  approvedTestimonials = normalized;
  const average = calculateTestimonialAverage(normalized);
  const ratingPercent = Math.max(0, Math.min(100, (average / 5) * 100));

  document.querySelectorAll('[data-review-average]').forEach(element => {
    element.textContent = average.toFixed(1);
  });

  document.querySelectorAll('[data-review-stars]').forEach(element => {
    element.style.setProperty('--rating-pct', ratingPercent + '%');
    element.setAttribute('aria-label', average.toFixed(1) + ' out of 5 stars from website reviews');
  });

  document.querySelectorAll('[data-review-count]').forEach(element => {
    element.textContent = normalized.length === 1
      ? '1 website review'
      : normalized.length + ' website reviews';
  });

  document.querySelectorAll('[data-testimonial-list]').forEach(container => {
    container.replaceChildren();
    normalized.forEach(review => container.append(createTestimonialCard(review)));
  });
}

const reviewDialog=document.getElementById('review-dialog');
const reviewDialogClose=document.getElementById('review-dialog-close');
function openReviewDialog(review){if(!reviewDialog)return;const stars=document.getElementById('review-dialog-stars');stars.textContent=review.rating !== null?'★'.repeat(review.rating)+'☆'.repeat(5-review.rating):'';document.getElementById('review-dialog-name').textContent=review.name;document.getElementById('review-dialog-relationship').textContent=review.detail?review.relationship+' · '+review.detail:review.relationship;document.getElementById('review-dialog-text').textContent=review.text;const dialogLink=document.getElementById('review-dialog-link');if(dialogLink){if(review.url){dialogLink.href=review.url;dialogLink.style.display='inline-flex';}else{dialogLink.removeAttribute('href');dialogLink.style.display='none';}}if(typeof reviewDialog.showModal==='function')reviewDialog.showModal();else reviewDialog.setAttribute('open','');}
function closeReviewDialog(){if(!reviewDialog)return;if(typeof reviewDialog.close==='function')reviewDialog.close();else reviewDialog.removeAttribute('open');}
if(reviewDialogClose)reviewDialogClose.addEventListener('click',closeReviewDialog);
if(reviewDialog)reviewDialog.addEventListener('click',event=>{if(event.target===reviewDialog)closeReviewDialog();});
function normalizeReviewerName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeReviewText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDuplicateYelpExcerpt(yelpReview) {
  const yelpName = normalizeReviewerName(yelpReview.user_name);
  const yelpText = normalizeReviewText(yelpReview.text);

  return approvedTestimonials.some(siteReview => {
    const siteName = normalizeReviewerName(siteReview.name);
    const siteText = normalizeReviewText(siteReview.text);
    const namesMatch = yelpName && siteName && (yelpName === siteName || yelpName.startsWith(siteName) || siteName.startsWith(yelpName));
    const textOverlap = yelpText && siteText && (
      siteText.includes(yelpText) ||
      yelpText.includes(siteText) ||
      siteText.slice(0, 120) === yelpText.slice(0, 120)
    );
    return namesMatch && textOverlap;
  });
}

function createYelpExcerptCard(review) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'yelp-excerpt-card';
  button.setAttribute('aria-label', 'Read Yelp excerpt from ' + (review.user_name || 'Yelp reviewer'));

  const rating = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 5)));
  const stars = document.createElement('div');
  stars.className = 'yelp-excerpt-stars';
  stars.textContent = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  const text = document.createElement('p');
  text.className = 'yelp-excerpt-text';
  text.textContent = review.text || 'Read this review on Yelp.';

  const footer = document.createElement('div');
  footer.className = 'yelp-excerpt-footer';
  const name = document.createElement('strong');
  name.textContent = review.user_name || 'Yelp reviewer';
  const source = document.createElement('span');
  source.textContent = 'Yelp review excerpt';
  footer.append(name, source);

  button.append(stars, text, footer);
  button.addEventListener('click', () => openReviewDialog({
    rating,
    name: review.user_name || 'Yelp reviewer',
    relationship: 'Yelp review excerpt',
    detail: '',
    text: review.text || 'Read this review on Yelp.',
    url: review.url || ''
  }));
  return button;
}

function renderYelpExcerpts(data) {
  const reviews = Array.isArray(data.reviews)
    ? data.reviews
        .filter(review => review && review.text && !isDuplicateYelpExcerpt(review))
        .slice(0, 3)
    : [];

  document.querySelectorAll('[data-yelp-excerpt-list]').forEach(container => {
    const section = container.closest(
      '.yelp-excerpts-section, .mobile-yelp-excerpts'
    );

    if (!reviews.length) {
      container.replaceChildren();
      if (section) section.hidden = true;
      return;
    }

    if (section) section.hidden = false;
    container.replaceChildren();

    reviews.forEach(review => {
      container.append(createYelpExcerptCard(review));
    });
  });
}

function renderYelpLiveRating(data) {
  const rating = Number(data.rating);
  const count = Number(data.review_count);
  const hasRating = Number.isFinite(rating) && rating > 0;
  const percentage = hasRating ? Math.max(0, Math.min(100, rating / 5 * 100)) : 0;

  document.querySelectorAll('[data-yelp-live-rating]').forEach(element => {
    element.textContent = hasRating ? rating.toFixed(1) : '—';
  });

  document.querySelectorAll('[data-yelp-live-stars]').forEach(element => {
    element.style.setProperty('--yelp-rating-pct', percentage + '%');
    element.setAttribute(
      'aria-label',
      hasRating ? rating.toFixed(1) + ' out of 5 stars on Yelp' : 'Yelp rating unavailable'
    );
  });

  document.querySelectorAll('[data-yelp-live-count]').forEach(element => {
    element.textContent = hasRating && Number.isFinite(count)
      ? (count === 1 ? '1 Yelp review' : count + ' Yelp reviews')
      : 'View Yelp for the current rating';
  });

  document.querySelectorAll('[data-yelp-live-updated]').forEach(element => {
    if (!data.updated_at) {
      element.textContent = 'The public Yelp listing is always available below.';
      return;
    }
    const date = new Date(data.updated_at);
    element.textContent = Number.isNaN(date.getTime())
      ? 'Synchronized with Yelp'
      : 'Synchronized ' + date.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'});
  });

  renderYelpExcerpts(data);
}

async function loadYelpLiveRating() {
  try {
    const response = await fetch(YELP_LIVE_DATA_URL + '?v=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw new Error('Yelp live data could not be loaded.');
    renderYelpLiveRating(await response.json());
  } catch (error) {
    renderYelpLiveRating({reviews:[], reviews_status:'unavailable'});
    console.warn(error.message);
  }
}

async function loadTestimonials() {
  try {
    const response = await fetch(TESTIMONIALS_DATA_URL + '?v=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw new Error('Approved testimonial data could not be loaded.');
    const data = await response.json();
    if (Array.isArray(data.reviews)) renderTestimonials(data.reviews);
  } catch (error) {
    // The initial website review is server-rendered in the page, so the
    // section remains complete even if the optional JSON file is unavailable.
    console.warn(error.message);
  }
}


function updateReadingProgress() {
  const progressWrap = document.getElementById('reading-progress');
  const progressBar = progressWrap ? progressWrap.querySelector('span') : null;
  const articleView = document.getElementById('view-article');
  const article = articleView ? articleView.querySelector('.article') : null;

  if (!progressWrap || !progressBar || !article || !articleView.classList.contains('active') || !isMobileViewport()) {
    if (progressBar) progressBar.style.width = '0%';
    return;
  }

  const articleTop = article.offsetTop;
  const articleHeight = article.offsetHeight;
  const viewportHeight = window.innerHeight;
  const scrollable = Math.max(1, articleHeight - viewportHeight + 80);
  const progress = Math.min(1, Math.max(0, (window.scrollY - articleTop + 80) / scrollable));
  progressBar.style.width = (progress * 100).toFixed(1) + '%';
}

window.addEventListener('scroll', updateReadingProgress, {passive:true});
window.addEventListener('resize', () => {
  updateDeviceFlow();
  updateReadingProgress();
});

function updateDeviceFlow() {
  const mobile = isMobileDevice();
  const heading = document.getElementById('device-flow-heading');
  const copy = document.getElementById('device-flow-copy');
  const submit = document.getElementById('booking-submit');

  if (mobile) {
    heading.textContent = 'Mobile booking';
    copy.textContent = 'The form opens your native Messages app with the request ready to send. No calendar file is downloaded on mobile.';
    submit.textContent = 'Send Request via Text';
  } else {
    heading.textContent = 'Desktop booking';
    copy.textContent = 'The form downloads a tentative calendar invite, then opens your default email application with the request ready to send.';
    submit.textContent = 'Send Request via Email';
  }
}

function selectTrainingAndOpenBooking(trainingValue) {
  const sessionSelect = document.getElementById('session-type');
  if (sessionSelect && trainingValue) {
    sessionSelect.value = trainingValue;
    toggleConditionalFields();
    updateRequestPreview();
  }

  currentBookingStep = 1;
  window.location.href = ROUTES.book;

  if (isMobileViewport()) {
    showBookingStep(1);
  }

  const status = document.getElementById('form-status');
  if (status && trainingValue) {
    status.textContent = trainingValue + ' has been selected. Complete the request details below.';
  }
}

document.querySelectorAll('.training-request').forEach(button => {
  button.addEventListener('click', () => {
    selectTrainingAndOpenBooking(button.dataset.trainingValue || '');
  });
});

// Keep the mobile training page compact: opening one section closes the others.
document.querySelectorAll('.mobile-training-card').forEach(card => {
  card.addEventListener('toggle', () => {
    if (!card.open) return;
    document.querySelectorAll('.mobile-training-card').forEach(otherCard => {
      if (otherCard !== card) otherCard.open = false;
    });
  });
});

document.querySelectorAll('[data-booking-next]').forEach(button => {
  button.addEventListener('click', () => {
    const nextStep = Number(button.dataset.bookingNext);
    if (validateBookingStep(currentBookingStep)) showBookingStep(nextStep);
  });
});

document.querySelectorAll('[data-booking-back]').forEach(button => {
  button.addEventListener('click', () => showBookingStep(Number(button.dataset.bookingBack)));
});

document.querySelectorAll('.booking-progress-item').forEach(button => {
  button.addEventListener('click', () => {
    const requestedStep = Number(button.dataset.bookingStep);
    if (requestedStep < currentBookingStep) showBookingStep(requestedStep);
  });
});

const bookingForm = document.getElementById('booking-form');
bookingForm.addEventListener('submit', submitBooking);
document.getElementById('copy-request').addEventListener('click', copyRequest);
document.getElementById('session-type').addEventListener('change', toggleConditionalFields);
document.getElementById('meet-airport').addEventListener('change', toggleConditionalFields);

document.querySelectorAll('#booking-form input, #booking-form select, #booking-form textarea').forEach(element => {
  element.addEventListener('input', updateRequestPreview);
  element.addEventListener('change', updateRequestPreview);
});

const dateInput = document.getElementById('preferred-date');
dateInput.min = new Date().toISOString().split('T')[0];

updateDeviceFlow();
toggleConditionalFields();
showBookingStep(1);
updateReadingProgress();
loadTestimonials().finally(loadYelpLiveRating);
