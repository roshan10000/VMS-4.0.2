# VMS — Video Management System

A production-ready video management platform for warehouse and eCommerce
operations. Records packing / return / D2C shipment videos straight from the
browser, burns a live timestamp + order-ID overlay into each clip, and stores
everything in Google Drive with a searchable log in Google Sheets.

No Node. No React. No paid services. Just HTML, CSS, vanilla JavaScript, and
Google Apps Script as the backend.

---

## Why this exists

Marketplace warehouses (Amazon, Flipkart, Meesho, etc.) increasingly require
proof-of-packing videos for forward orders, return verification, and D2C
shipments. Most off-the-shelf solutions are SaaS subscriptions with per-seat
fees and vendor lock-in. This project gives you the same workflow on
infrastructure you already own — a Google account.

---

## Features

- **Browser-based recording** — `MediaRecorder` API, front/rear camera, live preview.
- **Burnt-in timestamp overlay** — date, time, marketplace, and order ID are drawn
  into every frame via canvas so the metadata can never be stripped from the file.
- **Three workflows** — Forward orders, Returns, and D2C, each with its own
  required-field schema.
- **Automatic Drive upload** — chunked, retried, with progress UI. Files land in
  `/VMS/<Marketplace>/<YYYY-MM-DD>/<Forward|Return|D2C>/`.
- **Searchable Sheet log** — every recording adds one row to the `Logs` tab with
  the Drive URL, file ID, duration, size, and full metadata.
- **Role-based auth** — Admin vs User, managed in the `Users` tab.
- **Admin panel** — add/edit/disable users, view storage usage, trigger manual cleanup.
- **Dashboard** — totals, today, last 7 days, top marketplaces, recent uploads.
- **History + CSV export** — filter by date, user, type, marketplace, order ID.
- **90-day auto-cleanup** — daily Apps Script trigger deletes expired Drive files
  and their log rows. Retention is configurable.
- **One config file** — paste three IDs into `js/config.js` and you're live.

---

## Tech stack

| Layer    | Tech                                           |
|----------|------------------------------------------------|
| Frontend | HTML5, CSS3, vanilla JS (no build step)        |
| Camera   | `MediaRecorder` + `canvas.captureStream()`     |
| Backend  | Google Apps Script Web App                     |
| Storage  | Google Drive (videos) + Google Sheets (logs)   |
| Auth     | HMAC-SHA256 signed tokens, salted SHA-256 hashes |
| Hosting  | GitHub Pages / Netlify / Vercel — anywhere static |

---

## Quick start

1. **Create the Google assets.** A new Spreadsheet for logs, a new Drive folder
   for videos. See [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).
2. **Deploy the Apps Script.** Copy everything under `apps-script/` into a new
   Apps Script project, set the Script Properties, deploy as a Web App. Full
   walkthrough in [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).
3. **Configure the frontend.** Open `js/config.js`, paste in your three IDs:
   ```js
   APPS_SCRIPT_URL: 'https://script.google.com/macros/s/.../exec',
   SHEET_ID:        '1AbC...',
   DRIVE_ROOT_FOLDER_ID: '1XyZ...',
   ```
4. **Seed the first admin.** In the Apps Script editor, run `seedDefaultAdmin()`
   once. Default credentials: `admin / admin123` — change immediately on first
   login.
5. **Host it.** Drag the folder into Netlify, push to GitHub Pages, or deploy
   to Vercel. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Project layout

```
vms/
├── index.html              login page
├── pages/                  dashboard, record, history, admin, settings
├── css/                    main.css + page-specific styles
├── js/
│   ├── config.js           ← the one file end-users edit
│   ├── api.js              Apps Script client
│   ├── auth.js             session + route guard
│   ├── recorder.js         MediaRecorder + canvas overlay
│   ├── uploader.js         chunked upload w/ retry
│   └── page-*.js           per-page controllers
├── apps-script/            paste these into script.google.com
│   ├── Code.gs             router + bootstrap
│   ├── Auth.gs             login + token signing
│   ├── Users.gs            user CRUD
│   ├── Upload.gs           chunked upload pipeline
│   ├── Logs.gs             read/write log rows + stats
│   └── Cleanup.gs          retention + storage stats
├── assets/                 logos & icons (drop your own)
└── docs/                   full documentation set
```

---

## Documentation

| File | What it covers |
|------|----------------|
| [docs/SETUP.md](docs/SETUP.md) | End-to-end first-time setup |
| [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) | Apps Script + Sheet + Drive walkthrough |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | GitHub Pages / Netlify / Vercel |
| [docs/SHEET_FORMAT.md](docs/SHEET_FORMAT.md) | Column reference for every tab |

---

## Security notes

- Passwords are stored as `SHA-256(password + 'vms.v1')` in the `Users` sheet
  (single fixed salt). This is fine for an internal warehouse tool but is
  **not** PBKDF2 — for a public-facing deployment, swap the hash in
  `Auth.gs → Auth_hash` for a slower KDF and consider per-user salts.
- Session tokens are JWT-ish (`header.payload.signature`, HMAC-SHA256) with a
  12-hour TTL. The signing secret lives in `TOKEN_SECRET` script property —
  set it to a long random string before deploying.
- The Apps Script Web App is deployed with "Anyone" access because the
  script does its own authentication. Do not enable Google's built-in access
  control unless you also wire login flows to it.
- Frontend → backend requests use `Content-Type: text/plain` to avoid a CORS
  preflight against the Apps Script endpoint. Payloads are JSON inside that
  text body.

---

## Browser support

Chrome / Edge / modern Firefox on desktop and Android. iOS Safari supports
`MediaRecorder` from version 14.5+ but only emits MP4; the recorder picks
the best available MIME type automatically.

---

## License

MIT. Use it, fork it, white-label it, sell it — just don't blame anyone if
your recordings go missing.
