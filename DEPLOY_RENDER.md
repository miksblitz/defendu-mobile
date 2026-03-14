# Deploy pose-service to Render

1. **Push the repo** that contains both `defendu-mobile` and the root `render.yaml` (i.e. the parent repo, e.g. DEFENDU-MOB). If your Render repo is only the `defendu-mobile` folder, see “Repo is only defendu-mobile” below.

2. **Connect to Render**
   - Go to [dashboard.render.com](https://dashboard.render.com) → **Blueprints** → **New Blueprint Instance**.
   - Connect your Git provider and select the repo that has `render.yaml` at its root.
   - Render will detect `render.yaml` and create the **defendu-pose-service** web service.

3. **Set environment variables** (in the new service → **Environment**):
   - **FIREBASE_DATABASE_URL**  
     Your Realtime Database URL, e.g.  
     `https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app`
   - **FIREBASE_SERVICE_ACCOUNT_JSON**  
     The **entire** JSON from your Firebase service account key (one line or pasted as-is).  
     (Firebase Console → Project settings → Service accounts → Generate new private key.)

4. **Deploy**  
   Render will build and deploy. The service URL will be like  
   `https://defendu-pose-service.onrender.com`.  
   Test: `GET https://your-service.onrender.com/health` → `{"status":"ok"}`.

---

**If your repo is only the `defendu-mobile` folder** (no parent with `render.yaml`):

- In Render, create a **Web Service** manually (not via Blueprint).
- **Root directory:** leave empty (or `.`).
- **Build command:** `pip install -r pose-service/requirements.txt`
- **Start command:** `gunicorn -w 1 -b 0.0.0.0:$PORT --timeout 300 pose-service.app:app`
- Set **FIREBASE_DATABASE_URL** and **FIREBASE_SERVICE_ACCOUNT_JSON** as above.
