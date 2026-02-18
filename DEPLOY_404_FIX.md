# Fix 404 on /api/password-reset and /api/hello

There is **only one** `vercel.json` and **one** `api/` folder — both are inside **defendu-mobile**. The root folder no longer has any Vercel or API files.

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

## Summary

- **Single source:** Everything is in **defendu-mobile** (`vercel.json` + `api/` + app). No `vercel.json` or `api/` at the repo root.
- **In Vercel:** Root Directory = **`defendu-mobile`**, Framework = **Other**, then **Redeploy**.
