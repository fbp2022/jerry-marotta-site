# ✈️ Jerry Marotta — Gold Seal Flight Instructing

Mobile-first website for Jerry Marotta, Gold Seal Flight Instructor, Knoxville TN.
Features a **100% free native SMS booking system** — no monthly fees, no accounts, works forever.

---

## 📁 Repo Structure

```
jerry-marotta-site/
├── index.html              ← The entire website (one file)
├── images/                 ← All of Jerry's photos
│   ├── jerry-with-plane.jpg
│   ├── flight-simulator.jpg
│   └── gallery-01.jpg … gallery-13.jpeg
├── download-images.sh      ← Run this once to download all photos
└── README.md               ← This file
```

---

## 🖼️ Step 1 — Get the Images

The images folder needs to be populated before uploading to GitHub.
Run the download script once on your computer:

**Mac / Linux — open Terminal:**
```bash
bash download-images.sh
```
**Windows — open Git Bash:**
```bash
bash download-images.sh
```
All 15 photos will download into the `images/` folder automatically.

---

## 🐙 Step 2 — Create YOUR GitHub Repo

### A. Make the repo

1. Go to **[github.com](https://github.com)** and sign in
2. Click **"+"** (top-right) → **"New repository"**
3. Fill in:
   - **Repository name:** `jerry-marotta-site`
   - **Visibility:** ✅ Public *(required for free GitHub Pages)*
4. Click **"Create repository"**

### B. Upload the files

1. On the new empty repo page, click **"uploading an existing file"**
2. Drag and drop ALL of these onto the upload area:
   - `index.html`
   - The entire `images/` folder
   - `download-images.sh`
   - `README.md`
3. Scroll down → type a commit message (e.g. `Initial upload`) → click **"Commit changes"**

### C. Turn on free hosting (GitHub Pages)

1. In your repo, click the **Settings** tab
2. In the left sidebar, click **Pages**
3. Under **"Source"**, select **"Deploy from a branch"**
4. Set Branch: **main** / folder: **/ (root)** → click **Save**
5. Wait 2–3 minutes

Your site will go live at:
```
https://YOUR-GITHUB-USERNAME.github.io/jerry-marotta-site/
```

---

## 🤝 Step 3 — Jerry Gets His Own Copy

When Jerry is ready to own his website:

### A. Jerry creates a GitHub account
1. Go to **[github.com/signup](https://github.com/signup)**
2. Enter his email, choose a password, pick a username (e.g. `jerrymarotta`)
3. Verify his email

### B. Jerry forks your repo
1. Jerry goes to YOUR repo page
2. Clicks **"Fork"** (top-right corner)
3. Clicks **"Create fork"**
4. He now has his own full copy at `github.com/jerrymarotta/jerry-marotta-site`

### C. Jerry enables Pages on his fork
Same as Step 2C above — Settings → Pages → main → Save

Jerry's site goes live at:
```
https://jerrymarotta.github.io/jerry-marotta-site/
```

---

## 🌐 Step 4 — Custom Domain (Optional, ~$12/year)

If Jerry ever wants **jerrymarotta.com** instead of the github.io address:

1. Buy the domain at **[Namecheap.com](https://namecheap.com)** or **[Porkbun.com](https://porkbun.com)** (~$10–12/year)
2. In his GitHub repo → **Settings → Pages → Custom domain** → type `jerrymarotta.com` → Save
3. Follow the DNS instructions GitHub shows (copy 4 IP addresses into Namecheap's DNS panel)
4. Done — site moves to `jerrymarotta.com`, still $0/month hosting

---

## 🔧 Switching from Test Number to Jerry's Number

The booking SMS currently goes to the **test number**.
When ready to go live, open `index.html`, find this line (~line 992):

```javascript
const JERRY_NUMBER = '8655995260';
```

Change it to Jerry's real number:

```javascript
const JERRY_NUMBER = '8657247251';
```

Save, re-upload `index.html` to GitHub → done.

---

## 📱 How Booking Works (for reference)

1. Client fills out the form on the website
2. Taps **"Send Request via Text"**
3. Their phone's native Messages app opens — Jerry's number pre-filled, message pre-filled
4. Client taps **Send**
5. Jerry gets a normal text:

```
Hi Jerry! Hope you're doing well. Jane Smith is hoping to schedule
a session with you and wanted to check if the following day works for you:

📋 SESSION REQUEST
──────────────────
Name: Jane Smith
Phone: (865) 555-0100
Session: Discovery / Intro Flight
Preferred Date: Friday, April 4, 2025
Preferred Time: Morning (9 AM–12 PM)
Experience: No prior flight experience
──────────────────
Please reply to confirm or suggest a different time. Thank you!
```

**Cost: $0 forever.** No API, no accounts, no monthly fees.

---

## ✏️ Making Changes Later

Everything is in `index.html`. Search for what you want to change:

| What to change | Search for |
|---|---|
| Jerry's phone number | `8657247251` |
| Jerry's email | `jerry.marotta@hotmail.com` |
| Business address | `Knoxville, TN, USA` |
| Gallery photos | `gallery-` in the Gallery section |
| About text | `<!-- ABOUT -->` |
| Services | `<!-- SERVICES -->` |

---

*Built with plain HTML / CSS / JavaScript — no frameworks, no build tools.*
*Hosted free forever on GitHub Pages.*
