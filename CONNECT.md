# Connect your phone to the dev server

## Why LAN sometimes doesn’t connect

Two things have to be right:

1. **What the phone uses** – The URL/QR code must point to your PC’s IP (e.g. `192.168.254.108`).  
   `REACT_NATIVE_PACKAGER_HOSTNAME=192.168.254.108` does that.

2. **What the PC accepts** – The dev server must listen on the network, not only on `localhost`.  
   `metro.config.js` is set so the server uses `host: '0.0.0.0'` and accepts connections from your phone.

If it still doesn’t connect, the router may be blocking device-to-device traffic (AP/client isolation). Use tunnel (Option 1) in that case.

---

## Option 1: Use tunnel (default – works on your network)

From the project folder:

```bash
npm start
```

Scan the QR code with Expo Go. Your phone connects over the internet, so it works even when Wi‑Fi/LAN is blocked. (Same as `npm run dev`.)

---

## Option 2: Try LAN again (same Wi‑Fi)

1. **On PC** (in `D:\DEFENDU-MOB\defendu-mobile`):
   ```bash
   npm run start:lan
   ```

2. **On phone (Expo Go):**  
   - Either scan the QR code, or  
   - Tap “Enter URL manually” and type: `exp://192.168.254.108:8081`

3. If it still doesn’t connect, your router may have **AP isolation** (client isolation) enabled. Check the router settings and turn it off so devices on the same Wi‑Fi can talk to each other.

---

## Quick reference

| Command        | Use when                          |
|----------------|-----------------------------------|
| `npm run dev`  | You want a connection that works  |
| `npm run start:lan` | You want to try Wi‑Fi (same network) |
