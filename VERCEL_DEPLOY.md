# Deploy Defendu Mobile to Vercel

**This is a mobile app** (iOS/Android via Expo). The main product is the native app; Vercel is used to host the **backend API** (and optionally a web build) so the app can call it.

- **Primary:** Native app on device → calls the API at your Vercel URL (forgot password, reset flow, etc.).
- **API:** Password reset and related routes live in this repo and are deployed as serverless functions on Vercel.
- **Web build:** Optional — Expo can export a browser version; useful for testing or “open in browser,” but the app is **mobile-first**.

## What gets deployed

- **API routes** (main reason for deploy): `/api/password-reset`, `/api/validate-reset-token`, `/api/confirm-password-reset`, `/api/reset-redirect`. The mobile app calls these so forgot-password works (no 404).
- **Web build** (optional): Same Expo app, runnable in the browser at `https://<your-project>.vercel.app`.

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
   | `ANDROID_PACKAGE_ID` | Your Android app package (e.g. `com.defendu.mobile` from `app.json`). Set this so the reset link page can open the app on Android via an intent. | No (recommended for Android) |

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

5. **If you’re stuck on a URL and the app doesn’t open**  
   When you tap the reset link in the email, a page opens that should open the Defendu app. If you stay on that page:
   - **Tap the “Open Defendu App” button** on the page (user tap is required in many in-app browsers).
   - If you’re inside **Gmail** or another in-app browser: tap the menu (⋮) → **Open in Chrome** or **Open in Safari**, then tap the button again.
   - **Expo Go:** the **defenduapp** scheme is only registered in a **standalone** or **development** build, not in Expo Go. Use `npx expo run:ios` / `run:android` or an EAS build so the link can open your app.
   - **Android:** set **ANDROID_PACKAGE_ID** in Vercel to your app’s package (e.g. `com.defendu.mobile`) and redeploy so the reset page can open the app via an intent.

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

## Forgot password email not arriving

If the app says “Password reset email sent” but you never receive the email, or you see “Email service is not configured” / “Could not send password reset email”:

1. **Set Mailjet env vars in Vercel**  
   The API sends the reset email via [Mailjet](https://www.mailjet.com/). In Vercel → your project → **Settings** → **Environment Variables**, add:
   - `MAILJET_API_KEY` – from [Mailjet → Account Settings → API keys](https://app.mailjet.com/account/api_keys) (REST API key).
   - `MAILJET_API_SECRET` – same page, Secret key.  
   Optional: `MAILJET_FROM_EMAIL` (e.g. `noreply@defendu.com`), `MAILJET_FROM_NAME` (e.g. `Defendu`).  
   Then **Redeploy** (Deployments → … → Redeploy) so the API picks up the new variables.

2. **Verify sender in Mailjet**  
   In Mailjet, the “From” address (`MAILJET_FROM_EMAIL` or default `noreply@defendu.com`) must be verified (domain or single sender). Unverified senders can cause silent failures or bounces.

3. **Check spam / promotions**  
   Ask the user to check spam and “Promotions” (Gmail). The first reset email can be filtered.

4. **Confirm the account exists**  
   The API only sends an email if the address exists in Firebase Auth. Use an email that is already registered in the app.

5. **Check Vercel logs**  
   In Vercel → your project → **Deployments** → select a deployment → **Functions** → open the `password-reset` function → **Logs**. Trigger forgot password, then look for:
   - `[password-reset] User found, sending via Mailjet. From: ... To:***@...` → API is calling Mailjet.
   - `[password-reset] Mailjet response: 200 {...}` → Mailjet accepted the message (delivery is then on Mailjet’s side).
   - `Mailjet send failed` or non-200 status → see the response body for Mailjet’s error (e.g. unverified sender).

6. **Check Mailjet dashboard**  
   If logs show Mailjet **200** but the user still doesn’t get the email: go to [Mailjet](https://app.mailjet.com/) → **Statistics** / **Message history** and look for the send. Check for bounces, “blocked”, or “spam”. Ensure the **sender** (`MAILJET_FROM_EMAIL`, e.g. `noreply@defendu.com`) is **verified** (Mailjet → Senders & Domains); unverified senders often get dropped or filtered.

## Summary

- **API is in this repo** so you can delete the web version folder and keep one codebase.
- **Vercel** serves both the web build and the API on the same domain → no 404.
- **Email link** goes to `/api/reset-redirect` → opens app via `defenduapp://resetpassword?token=...` → app shows **Set new password** screen.
