# SETUP — first-time installation

This is the **complete** setup walkthrough. If you've never used Apps Script
before, follow this start-to-finish and you'll have a working VMS in
about 20 minutes.

You will need:

- A Google account (personal or Workspace)
- A web browser
- A text editor (VS Code recommended)

---

## Step 1 · Create the spreadsheet

1. Open [sheets.google.com](https://sheets.google.com) → **Blank**.
2. Name it `VMS — Logs` (or anything you like).
3. Copy its **Sheet ID** from the URL. It's the long string between `/d/` and
   `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQ.../edit
                                          └─── this part ───┘
   ```
   You'll paste this into `config.js` later.

You don't need to add any sheets manually — the backend creates the `Users`,
`Logs`, and `Settings` tabs automatically on first call.

---

## Step 2 · Create the Drive root folder

1. Open [drive.google.com](https://drive.google.com) → **New** → **Folder**.
2. Name it `VMS Recordings` (or anything).
3. Open the folder. Copy its **Folder ID** from the URL:
   ```
   https://drive.google.com/drive/folders/1XyZ123aBcDeFgHiJ...
                                          └────── this ──────┘
   ```

The backend will create the full `/<Marketplace>/<YYYY-MM-DD>/<OrderType>/`
tree under this root on demand.

---

## Step 3 · Deploy the Apps Script

Follow the dedicated guide: [GOOGLE_SETUP.md](GOOGLE_SETUP.md). When you're
done you should have:

- An Apps Script project with all six `.gs` files pasted in.
- Script Properties set: `SHEET_ID`, `DRIVE_ROOT_ID`, `TOKEN_SECRET`, `RETENTION_DAYS`.
- A Web App deployment URL ending in `/exec`.
- `seedDefaultAdmin()` run once to create the first admin user.
- `installTrigger()` run once to schedule the daily cleanup.

---

## Step 4 · Configure the frontend

Open `js/config.js`. There are exactly **three** values you need to fill in
at the top of the file:

```js
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfy.../exec',
SHEET_ID:        '1AbCdEfGhIjKlMnOpQ...',
DRIVE_ROOT_FOLDER_ID: '1XyZ123aBcDeFgHiJ...',
```

Save the file. The rest of `config.js` (marketplace list, courier list,
retention days, idle timeout) can be customised later or left as-is.

---

## Step 5 · Smoke test locally

Open `index.html` directly in a browser. You should see the login page.

> **Camera note** — `MediaRecorder` requires a secure context. `file://` works
> for the login page but **not** for the record page, because `getUserMedia`
> only runs on `https://` or `http://localhost`. For local testing, serve the
> folder with a tiny static server:
> ```bash
> # Python 3
> python3 -m http.server 8000
> # OR Node
> npx serve .
> ```
> Then open `http://localhost:8000/`.

Log in with `admin / admin123`. Go to **Settings** → click "Test Backend".
A green check confirms the frontend can reach Apps Script.

---

## Step 6 · Change the default admin password

1. Log in as `admin`.
2. Go to **Admin** → click **admin** in the user list → **Reset password**.
3. Pick a strong password.

This is the only time you'll ever interact with passwords manually — from
here on, the admin manages all users through the UI.

---

## Step 7 · Record your first video

1. Go to **Record**.
2. Pick a tab: **Forward**, **Return**, or **D2C**.
3. Fill the required fields. Note that the marketplace and order ID burn into
   the overlay live.
4. Click **Start camera** → grant permission → **Start recording**.
5. Stop when done. The upload runs automatically; a progress bar shows
   chunk-by-chunk progress.
6. On success you'll see a toast with a link to the Drive file.

Open the **History** page — your new row is there. Open the Google Sheet —
same row, same data.

---

## Step 8 · Deploy publicly

See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub Pages, Netlify, and Vercel.

---

## Common first-run problems

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "Auth required" toast on every page | `TOKEN_SECRET` not set or changed mid-session | Set it in Script Properties; clear browser localStorage |
| "SHEET_ID script property not set" | You forgot the Script Properties step | Project Settings → Script Properties → add the four keys |
| Camera button does nothing | Page served over `file://` | Use `localhost` or HTTPS |
| Upload stuck at 0% | Apps Script URL wrong, or deployment isn't "Anyone" access | Re-check `config.js` and the deployment dialog |
| "Admin only" error in the user panel | You're logged in as a non-admin user | Log in as `admin`, or promote your user via the Sheet |

If something else breaks, open the browser DevTools console — every API
error is logged there with the action name.
