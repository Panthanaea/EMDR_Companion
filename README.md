# EMDR Companion — Setup Guide

This is a Progressive Web App (PWA). It runs entirely in the browser — there's
no backend to pay for or maintain. All your data (notes, safe place images/
sounds, skill logs) lives in **your own Google Drive**, in files this app
creates. Nothing is stored permanently on your phone.

## Step 1 — Host the files (free, ~2 minutes)

**Easiest option: Netlify Drop**
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page.
3. You'll get a live URL like `https://random-name-123.netlify.app`.
4. (Optional but recommended) Create a free Netlify account first, so the
   site is permanent and you can update it later by dragging the folder again.

**Alternative: GitHub Pages**
1. Create a free GitHub account and a new repository.
2. Upload this folder's contents to the repo (drag-and-drop works in GitHub's
   web UI — no command line needed).
3. In the repo, go to Settings → Pages → set source to your main branch.
4. GitHub gives you a URL like `https://yourname.github.io/repo-name/`.

Either way, note down your app's exact URL — you'll need it in Step 2.

## Step 2 — Create a free Google OAuth Client ID

This lets the app ask *your* permission to create/read its own files in
*your* Drive. It costs nothing and only takes a few minutes.

1. Go to https://console.cloud.google.com/ and create a new project (any name,
   e.g. "EMDR Companion").
2. In the left menu: **APIs & Services → OAuth consent screen**.
   - User type: External. Fill in an app name and your email. You can leave
     it in "Testing" mode and add your own Google account under **Test users**
     — this avoids any Google review process, since you're the only user.
3. In the left menu: **APIs & Services → Library** → search for
   **Google Drive API** → click **Enable**.
4. In the left menu: **APIs & Services → Credentials** → **Create Credentials
   → OAuth client ID**.
   - Application type: **Web application**
   - Under **Authorized JavaScript origins**, add your exact site URL from
     Step 1 (e.g. `https://random-name-123.netlify.app` — no trailing slash,
     no path).
5. Copy the generated **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).

## Step 3 — Connect the app

1. Open your site's URL on your Android phone.
2. Go to the **Settings** tab, paste the Client ID, tap **Save Client ID**.
3. Tap **Connect Google Drive** and sign in with the same Google account you
   added as a test user.
4. Set your container's name, then explore the other tabs.

## Step 4 — Install it like an app

In Chrome on Android: tap the **⋮** menu → **Add to Home screen** / **Install
app**. It'll appear on your home screen and open full-screen like a native app.

## Notes

- If you ever change hosts or URLs, add the new URL to **Authorized
  JavaScript origins** in the Google Cloud Console (Step 2.4).
- The weekly summary reminder only fires while you have the app open on or
  after your chosen day — true background push notifications would require a
  paid server component, which this intentionally avoids.
- To edit the coping-skill instructions to match exactly what your therapist
  taught you, use the **Settings** tab.
