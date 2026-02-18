# Deploy Defendu Mobile to Vercel

This repo is **mobile-first**. The API (password reset, etc.) lives **inside defendu-mobile** so you can remove the web version folder and deploy only this project. Forgot password and the email link → app flow work when this is deployed to Vercel.

## What gets deployed

- **Web build**: Same Expo app, runnable in the browser at `https://<your-project>.vercel.app`.
- **API routes** (same domain): `/api/password-reset`, `/api/validate-reset-token`, `/api/confirm-password-reset`, `/api/reset-redirect`.  
  So forgot-password works (no 404), and the link in the email points to your deployment.

## Deep link flow (email → app → new password)

1. User taps **Forgot password** in the app and enters email.
2. API sends an email with a link like `https://defendu-mobile.vercel.app/api/reset-redirect?token=...`.
3. User taps the link (e.g. on their phone). The redirect page opens and immediately tries to open the app via **defenduapp://resetpassword?token=...**.
4. The Defendu app opens (if installed) and shows the **Set new password** screen. User enters new password and submits.
5. API confirms the reset; user is taken back to login.

The app uses the **defenduapp** scheme (see `app.json`). Ensure your native build is configured with this scheme so the OS opens the app from the email link.

## Deploy steps

**Important:** There is only one `vercel.json` and one `api/` — both are inside **defendu-mobile**. The repo root has no Vercel or API files.

1. **Connect the repo** in Vercel. **Root Directory:** If your repo root already has `vercel.json` and `api/`, leave Root Directory **empty**. If Vercel says "Root Directory 'defendu-mobile' does not exist", clear it so the repo root is used. Only set it to `defendu-mobile` if that subfolder exists in your repo.
2. **Set Framework Preset** to **Other** (Settings → General). Then Vercel will deploy the `api/` folder.
3. **Build settings** (from `defendu-mobile/vercel.json`):
   - Build Command: `npx expo export -p web`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. **Environment variables** (Vercel → Project → Settings → Environment Variables):

   For each row, put the **Key** in the "Key" field and the **Value** in the "Value" field.

   **If you already deployed the web version (defendu-app) on Vercel:** open that project → Settings → Environment Variables, and copy the same **Key** + **Value** for each of the variables below into this (defendu-mobile) project. The names and values are the same.

   **Values from this repo / web version** (you can paste these exactly):

   | Key | Value | Required |
   |-----|--------|----------|
   | `FIREBASE_DATABASE_URL` | `https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app` | No (default) |
   | `FIREBASE_API_KEY` | `AIzaSyBKq8u_QrSt5jontBA338Fk9PEjnD4pmdA` | No (same as web app config) |
   | `MAILJET_FROM_EMAIL` | `noreply@defendu.com` | No |
   | `MAILJET_FROM_NAME` | `Defendu` | No |

   **Values you must get from Firebase / Mailjet (or copy from web version’s Vercel env):**

   | Key | Where to get the Value | Required |
   |-----|------------------------|----------|
   | `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64` | Firebase Console → Project **defendu-e7970** → Project settings (gear) → Service accounts → Generate new private key → download JSON. Then Base64-encode the whole JSON (e.g. [base64encode.org](https://www.base64encode.org/) or PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\key.json"))`). Paste the long Base64 string as Value. Or copy from web version’s Vercel env if already set. | Yes |
   | `MAILJET_API_KEY` | [Mailjet](https://app.mailjet.com/) → Account Settings → API keys (Rest API key). Or copy from web version’s Vercel env. | Yes |
   | `MAILJET_API_SECRET` | Same Mailjet page → Secret key. Or copy from web version’s Vercel env. | Yes |
   | `API_BASE_URL` | Leave unset so Vercel uses your deployment URL. Or set e.g. `https://defendu-mobile.vercel.app` if you use a custom domain later. | No |

4. Deploy. Your app + API will be at `https://<your-project>.vercel.app`.

## What to do now (after you’ve deployed)

1. **Note your live URL**  
   In Vercel → your project → Overview: copy the URL (e.g. `https://defendu-mobile.vercel.app` or `https://defendu-mobile-xxx.vercel.app`).

2. **Test in the browser**  
   Open that URL. You should see the Defendu app. Try **Forgot password** → enter an email that has an account → you should get “Password reset email sent” (no 404). Check that email for the reset link.

3. **Use the same URL in the native app**  
   The app is set to use `https://defendu-mobile.vercel.app` by default.  
   - If your Vercel URL is **different**, create a `.env` in the `defendu-mobile` folder and add:
     ```env
     EXPO_PUBLIC_API_BASE_URL=https://your-actual-url.vercel.app
     ```
     Replace with your real Vercel URL (no trailing slash). Then rebuild the app (`npx expo start`, or EAS Build if you use it).

4. **Test the full flow on your phone**  
   - In the app: **Forgot password** → enter your email → send.  
   - On your phone, open the reset email and **tap the link**.  
   - The link should open the Defendu app (if installed) and show **Set new password**.  
   - Enter a new password and submit → you should be taken back to login and able to sign in with the new password.

5. **If the app doesn’t open from the email link**  
   - Make sure the app was built with the **defenduapp** scheme (it’s in `app.json`).  
   - For a dev build: run the app from the same machine (e.g. `npx expo run:ios` or `run:android`) so the scheme is registered.  
   - For a production build (EAS Build / store): the scheme is included automatically.

6. **Redeploy after env changes**  
   If you add or change environment variables in Vercel, trigger a new deployment (Deployments → … on latest → Redeploy) so the API uses the new values.

## Native app (iOS/Android)

The app defaults to **https://defendu-mobile.vercel.app** for API calls. If your Vercel URL is different, set **EXPO_PUBLIC_API_BASE_URL** (e.g. in `.env` or EAS env) to that URL so forgot-password and reset flow hit the right API.

## 404 on /api/password-reset (forgot password “unavailable”)

This usually means Vercel is **not** building from the folder that contains the `api/` directory.

- Go to **Vercel** → your project → **Settings** → **General**.
- Find **Root Directory**. If it’s empty or points to the wrong folder, set it to the folder that has `vercel.json` and the `api/` folder (e.g. **`defendu-mobile`**).
- Save, then go to **Deployments** → open the **…** menu on the latest deployment → **Redeploy**.

After the redeploy, the API routes should be live and forgot password should work.

## Summary

- **API is in this repo** so you can delete the web version folder and keep one codebase.
- **Vercel** serves both the web build and the API on the same domain → no 404.
- **Email link** goes to `/api/reset-redirect` → opens app via `defenduapp://resetpassword?token=...` → app shows **Set new password** screen.
