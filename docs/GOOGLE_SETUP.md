# GOOGLE_SETUP — Apps Script, Sheets, Drive

This guide walks you through everything that lives on Google's side: the
Spreadsheet, the Drive folder, the Apps Script project, the deployment, and
the daily trigger.

It assumes you've already created the empty Sheet and Drive folder (Steps 1
and 2 of [SETUP.md](SETUP.md)) and have the two IDs ready.

---

## 1 · Create the Apps Script project

1. Open [script.google.com](https://script.google.com).
2. Click **New project** (top-left).
3. Rename the project to `VMS Backend` (click the title).

> 📸 _Screenshot placeholder — Apps Script project overview_

---

## 2 · Paste in all six `.gs` files

The Apps Script editor starts with one file called `Code.gs`. You need six
files total, matching the names in this repo's `apps-script/` folder:

| Add this file | What it does |
|---------------|--------------|
| `Code.gs`     | Already exists — replace its contents |
| `Auth.gs`     | Login + token signing |
| `Users.gs`    | User CRUD |
| `Upload.gs`   | Chunked upload pipeline |
| `Logs.gs`     | Log row read/write + stats |
| `Cleanup.gs`  | Retention + storage stats |

For each new file: click the **+** beside "Files" in the left rail → **Script**
→ name it (without the `.gs` extension; the editor adds that automatically) →
paste in the file contents.

Save with `Ctrl/Cmd + S`. The editor will complain about syntax until you've
pasted **all** files, because they reference each other — that's expected.

> 📸 _Screenshot placeholder — Files panel with all six scripts_

---

## 3 · Set the four Script Properties

These are the only secrets the backend needs.

1. In the Apps Script editor, click the gear icon ⚙ **Project Settings** in
   the left rail.
2. Scroll to **Script Properties** → **Edit script properties**.
3. Add these four rows:

| Property | Value |
|----------|-------|
| `SHEET_ID` | The ID from your `VMS — Logs` spreadsheet URL |
| `DRIVE_ROOT_ID` | The ID from your `VMS Recordings` Drive folder URL |
| `TOKEN_SECRET` | Any long random string — e.g. paste from a password generator |
| `RETENTION_DAYS` | `90` (or whatever you want — 30, 180, 365…) |

4. **Save script properties.**

> ⚠️ **Treat `TOKEN_SECRET` like a password.** Anyone who learns it can mint
> valid session tokens for any user. If you ever suspect it's leaked, rotate
> it — every existing session will be invalidated.

> 📸 _Screenshot placeholder — Script Properties filled in_

---

## 4 · Deploy as a Web App

1. Top-right → **Deploy** → **New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Fill the dialog:
   - **Description**: `VMS v1`
   - **Execute as**: **Me** (the script runs as you, which is required to
     access your own Sheet and Drive)
   - **Who has access**: **Anyone**
     - This sounds scary but it's correct. The script does its own user
       authentication via the `Users` sheet. Google's own access control,
       if enabled, would require Google sign-in for every operator — usually
       you don't want that for warehouse staff.
4. Click **Deploy**.
5. Google will ask for permissions the first time — review and **Allow**.
   The scopes are: Sheets (your spreadsheet), Drive (your folder), and
   trigger management.
6. Copy the **Web app URL**. It looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
   This goes into `js/config.js` → `APPS_SCRIPT_URL`.

> 📸 _Screenshot placeholder — deployment success dialog_

> 🔁 **Every time you change the `.gs` code, you must redeploy** — either
> create a new deployment (gets a new URL) or click **Manage deployments**
> → pencil icon → **Version**: New version → **Deploy**. The latter keeps
> the same URL, which is what you almost always want.

---

## 5 · Seed the first admin user

1. In the editor, open the **function picker** dropdown at the top (next to
   the Debug button).
2. Pick `seedDefaultAdmin`.
3. Click **Run**.
4. Authorize again if prompted.
5. Check the spreadsheet — there's now a `Users` tab with one row:
   ```
   admin | <hash> | Admin | Active | 2026-05-26...
   ```

You can now log in as `admin / admin123`.

> ⚠️ **Change this password immediately** after your first login (Admin →
> click `admin` → Reset password).

---

## 6 · Install the daily cleanup trigger

1. In the editor, pick `installTrigger` from the function dropdown.
2. Click **Run**.
3. Open **Triggers** (clock icon in the left rail) → you should see
   `Cleanup_dailyTrigger` scheduled "Day timer" at 3 AM (script timezone).

The first cleanup will fire at 3 AM the next day. To run it manually any
time, the Admin panel has a **Run Cleanup Now** button.

> 📸 _Screenshot placeholder — triggers list_

---

## 7 · Verify everything works

1. Hit your Web App URL in a browser:
   ```
   https://script.google.com/macros/s/.../exec
   ```
   You should see a JSON liveness payload:
   ```json
   {"ok":true,"data":{"service":"VMS","version":"1.0","time":"..."}}
   ```
2. Open the deployed (or local) frontend → log in as `admin / admin123`.
3. Go to **Settings** → click **Test Backend**. You should see a green check
   and the backend version.

If the smoke test passes, you're done with Google. Go finish step 6 onward
in [SETUP.md](SETUP.md).

---

## Maintenance tasks (later)

| Task | How |
|------|-----|
| Rotate `TOKEN_SECRET` | Project Settings → edit the property → Save. All sessions die. |
| Change retention | Edit `RETENTION_DAYS` script property. Effect is immediate. |
| Deploy a code update | Manage deployments → pencil → Version: New version → Deploy |
| See cleanup history | Apps Script editor → **Executions** (left rail) → filter on `Cleanup_dailyTrigger` |
| Bulk-edit users | Edit the `Users` sheet directly. The `Status` column accepts `Active` or `Disabled`. |
