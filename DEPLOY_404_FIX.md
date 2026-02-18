# Fix 404 on /api/password-reset and /api/hello

Defendu Mobile is a **mobile app** (iOS/Android). The API is deployed on Vercel so the app can call it (e.g. forgot password). There is **only one** `vercel.json` and **one** `api/` folder in this project.

---

## 1. Set Root Directory to `defendu-mobile`

Vercel must use the **defendu-mobile** folder as the project root so it sees `vercel.json` and `api/`.

- **Vercel** → your project → **Settings** → **Git**.
- Find **Root Directory** (or “Repository root”).
- If you don’t see it on the Git page, try **Settings** → **General** and scroll, or when you first imported the project it may have asked for a root.
- If you see **"The specified Root Directory 'defendu-mobile' does not exist"**: your repo root **is** the app — **clear** Root Directory (leave empty or set to `.`) and Save. Only set it to `defendu-mobile` if that subfolder exists in your repo.

---

## 2. Set Framework Preset to “Other”

- **Vercel** → **Settings** → **General**.
- Find **Framework Preset** (or “Build & Development Settings”).
- Set it to **Other**.  
  If it’s Expo / Vite / etc., Vercel may not deploy the `api/` folder.
- Save.

---

## 3. Override build settings (if needed)

In **Settings** → **General**, under **Build & Development Settings**, set:

- **Build Command:** `npx expo export -p web`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

(These match `defendu-mobile/vercel.json`.)

---

## 4. Redeploy

- Go to **Deployments**.
- Open the **⋯** menu on the latest deployment → **Redeploy**.
- Wait for the build to finish.

---

## 5. Test

- **https://defendu-mobile.vercel.app/api/hello**  
  You should see: `{"ok":true,"message":"API is working"}`.  
  If you get 404, Root Directory or Framework is still wrong — repeat steps 1–2 and redeploy again.

- **Forgot password** in the app should then work (no 404 on `/api/password-reset`).

---

## Build error: "npx expo export -p web" exited with 1

The project is set up to fix common causes:

1. **Build command** – Vercel now runs `npm run build`, which runs `CI=1 npx expo export -p web` so the process exits correctly in CI.
2. **Web deps** – `react-dom` and `react-native-web` are in `package.json` so the web export has what it needs.
3. **Node** – `engines.node": ">=18"` is set so Vercel uses Node 18+.

If the build still fails:

- In Vercel, open the failed deployment → **Building** and check the **full log** for the first red error (e.g. "Module not found", "Cannot find module").
- Run the same export locally: in the `defendu-mobile` folder run `npm run build` (or `npx expo export -p web`) and fix any error you see.
- In Vercel → **Settings** → **General**, set **Node.js Version** to **18.x** or **20.x** if it’s different.

---

## 6. 404 when you click the reset link in the email

If you get **404 NOT_FOUND** (or “Code: NOT_FOUND”) when clicking “Reset password” in the email:

1. **Check the link URL**  
   In the email, long-press the reset button/link and see which URL it opens (e.g. `https://defendu-mobile.vercel.app/api/reset-redirect?token=...` or a different domain). That host must be the same Vercel project where your `api/` is deployed.

2. **Set `API_BASE_URL` in Vercel**  
   So the link in the email points to the correct deployment:
   - **Vercel** → your project → **Settings** → **Environment Variables**.
   - Add **`API_BASE_URL`** = your exact deployment URL, e.g. `https://defendu-mobile.vercel.app` or `https://your-project-xxx.vercel.app` (no trailing slash).
   - Redeploy so the password-reset API uses this URL when building the link.

3. **Confirm the API is deployed**  
   Open in a browser: **`https://YOUR_VERCEL_URL/api/reset-redirect?token=test`**  
   You should see an “Invalid Reset Link” or “Opening Defendu…” page, **not** 404. If you get 404, the API is not deployed on that URL — fix **Root Directory** and **Framework Preset** (steps 1–2 above), then redeploy.

4. **Redeploy** after any Root Directory, Framework, or env change.

---

## Summary

- **Single source:** Everything is in **defendu-mobile** (`vercel.json` + `api/` + app). No `vercel.json` or `api/` at the repo root.
- **In Vercel:** Root Directory = **`defendu-mobile`** (or empty if repo root is defendu-mobile), Framework = **Other**, then **Redeploy**.
- **Reset link 404:** Set **API_BASE_URL** to your real deployment URL and ensure `/api/reset-redirect` returns a page, not 404.
