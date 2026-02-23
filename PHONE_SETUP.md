# Run the app on your phone

## 1. Install Expo Go on your phone
- **Android:** [Google Play – Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)
- **iOS:** [App Store – Expo Go](https://apps.apple.com/app/expo-go/id982107779)

## 2. Start the app (use LAN if tunnel fails)

### Option A: LAN mode (same Wi‑Fi) – use this if tunnel fails
**Phone and PC must be on the same Wi‑Fi.**

```bash
cd defendu-mobile
npx expo start
```

When Windows Firewall asks, **allow** Node/Metro. Wait for the QR code, then open it in Expo Go.

### Option B: Tunnel (when you’re not on same Wi‑Fi)
If LAN isn’t possible, try tunnel. It can fail with "failed to start tunnel" or "remote gone away" (ngrok/network issue).

```bash
npx expo start --tunnel
```

If you see **CommandError: failed to start tunnel**, use **Option A** (LAN) and connect your phone to the **same Wi‑Fi** as your PC.

## 3. Open the project on your phone
- **Android:** In Expo Go, tap **“Scan QR code”** and scan the QR code from the terminal.
- **iOS:** Open the **Camera** app, point it at the QR code, then tap the banner to open in Expo Go.

If no QR code works, in Expo Go choose **“Enter URL manually”** and paste the `exp://...` URL from the terminal.

## 4. If it still doesn’t run

### Tunnel not starting
- First time can take 1–2 minutes.
- If it says **“ngrok”** or **“tunnel”** failed, run again; sometimes the tunnel service is slow.

### Phone and PC on same Wi‑Fi (no tunnel)
```bash
npx expo start
```
Then:
- **Windows:** Allow Node/Metro through Windows Firewall when prompted.
- Make sure the phone is on the **same Wi‑Fi** as the PC (not mobile data).

### My phone doesn’t connect on LAN (same Wi‑Fi)

Do these in order:

**Step 1 – Allow Metro through Windows Firewall**
1. Press **Win**, type **Windows Defender Firewall**, open **Allow an app through firewall** (or **Advanced settings** → Inbound Rules).
2. Click **Allow another app** → **Browse** → go to your **Node.js** install (e.g. `C:\Program Files\nodejs\node.exe`) → Add. Ensure both **Private** and **Public** are checked.
3. Or add a rule for the **port**: Inbound Rule → New Rule → Port → TCP → **8081** and **8082** → Allow → Name it “Expo Metro”.

**Step 2 – Use your PC’s IP so the phone can reach it**
1. In PowerShell or CMD run: `ipconfig`
2. Note your **IPv4 Address** for the Wi‑Fi adapter (e.g. `192.168.1.100`).
3. In the **defendu-mobile** folder run (use your IP and port if different):
   ```powershell
   $env:REACT_NATIVE_PACKAGER_HOST="192.168.1.100"
   npx expo start
   ```
   Replace `192.168.1.100` with your real IPv4 address. If Metro uses port 8082, the URL will use 8082.

**Step 3 – Connect from the phone**
- In Expo Go, choose **“Enter URL manually”** and type: `exp://YOUR_PC_IP:8081` (e.g. `exp://192.168.1.100:8081`). If Expo said it’s using port 8082, use `8082` instead of `8081`.

**Step 4 – If it still fails**
- Turn off **VPN** on the PC and phone.
- Some routers have **AP isolation** / **client isolation** (phones can’t talk to PCs). Try a **mobile hotspot**: turn on hotspot on your phone, connect the **PC** to that hotspot, then run `npx expo start` and connect with the PC’s new IP (check with `ipconfig` again).
- Or try the other device as hotspot (e.g. PC’s hotspot and phone connected to it).

### “Unable to connect” / “Network response timed out”
- Use **tunnel** (step 2) if you can’t get LAN working.
- Disable VPN on phone and PC and try again.
- Try another Wi‑Fi or mobile hotspot (see “My phone doesn’t connect on LAN” above).

### App opens then goes blank or “Something went wrong”
- In the terminal press **`r`** to reload.
- Shake the device (or press `Ctrl+M` in Android emulator) and choose **Reload**.

### “Expo Go” not installed
- You must use the **Expo Go** app to run the project in development. The phone’s normal camera app only opens the link; Expo Go loads the JavaScript bundle.


setx /M REACT_NATIVE_PACKAGER_HOSTNAME 192.168.254.100