# Connect your phone to the dev server

## Option 1: Use tunnel (recommended – works when LAN doesn’t)

From the project folder:

```bash
npm run dev
```

Scan the QR code with Expo Go. Your phone connects over the internet, so it works even if Wi‑Fi/LAN is blocked.

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
