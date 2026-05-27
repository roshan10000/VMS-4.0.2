# DEPLOYMENT

Because VMS is plain HTML/CSS/JS with no build step, any static host works.
Three popular options, in order of "I just want it live right now":

1. [Netlify drop](#1-netlify-drop) — drag and drop, 30 seconds
2. [GitHub Pages](#2-github-pages) — free, version-controlled
3. [Vercel](#3-vercel) — GitHub-connected, instant rollbacks

Before deploying, make sure `js/config.js` has your three IDs filled in —
see [SETUP.md](SETUP.md) step 4.

---

## 1 · Netlify drop

Easiest possible deploy. No account needed for a one-off, account makes it
permanent.

1. Open [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the **entire `vms/` folder** onto the page.
3. Wait ~10 seconds. Netlify gives you a URL like
   `https://wonderful-otter-1a2b3c.netlify.app`.
4. Share that URL with operators. Done.

To use a custom domain or your own subdomain: sign in, claim the site, then
**Domain settings** → **Add custom domain**.

> Netlify serves HTTPS automatically, which is required for the camera to
> work. No extra config.

---

## 2 · GitHub Pages

Free, integrates with `git`, and gives you a stable URL.

### 2a · Push to GitHub

```bash
cd vms
git init
git add .
git commit -m "Initial VMS deployment"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

### 2b · Enable Pages

1. On GitHub, open your repo → **Settings** → **Pages**.
2. **Source**: Deploy from a branch.
3. **Branch**: `main` · **Folder**: `/ (root)`.
4. **Save**.
5. Wait ~1 minute. The page reloads with your live URL:
   `https://<your-user>.github.io/<your-repo>/`

### 2c · Verify

Open the URL in an incognito window. Check that the login page loads and the
favicon/network requests have no 404s.

> ⚠️ **Don't commit `js/config.js` if the repo is public.** That file contains
> your Apps Script URL — anyone who learns it can hit your backend (the
> backend still requires a valid login, but you've leaked the attack surface).
> Either keep the repo private, or move config into a non-committed file
> served separately.

---

## 3 · Vercel

Best for teams that want preview deployments per branch.

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository**.
2. Select your VMS repo.
3. Framework preset: **Other** (Vercel auto-detects static sites).
4. **Build & Output Settings**:
   - Build Command: _(leave empty)_
   - Output Directory: `.`
5. **Deploy**.

You'll get a `https://<project>.vercel.app` URL. Every push to `main`
auto-deploys; every PR gets a preview URL.

---

## Custom domain

Whichever host you pick, the steps are similar:

1. Buy a domain (Namecheap, Cloudflare Registrar, etc.).
2. In the host's dashboard, add the domain to the site.
3. The host gives you a CNAME or A record — paste it into your registrar's
   DNS settings.
4. Wait for DNS propagation (usually < 1 hour).

All three providers above issue free Let's Encrypt certificates automatically.

---

## Updating after deploy

| Host | How updates work |
|------|------------------|
| Netlify drop | Re-drag the folder; it makes a new deploy |
| Netlify (Git) | `git push` — auto-deploys |
| GitHub Pages | `git push` — Pages rebuilds in ~1 min |
| Vercel | `git push` — auto-deploys |

**Remember**: if you change anything in `apps-script/`, that's a separate
deployment in the Apps Script editor — see [GOOGLE_SETUP.md](GOOGLE_SETUP.md)
section 4.

---

## Pre-flight checklist

Before sharing the URL with real operators:

- [ ] `js/config.js` filled with real IDs (not the placeholders)
- [ ] Default `admin / admin123` password changed
- [ ] At least one non-admin user created and tested
- [ ] HTTPS confirmed (lock icon in the address bar)
- [ ] Camera permission flow tested on an actual operator's device
- [ ] One end-to-end recording uploaded and visible in the Drive folder
- [ ] One row visible in the Sheet `Logs` tab
- [ ] **Settings → Test Backend** shows green
- [ ] Daily cleanup trigger installed (Apps Script → Triggers)
