# Defendu Mobile

Minimal mobile app to **test the connection from your phone to your server** (e.g. defendu-app running on your PC). No UI or backend work yet—just connectivity.

---

## How to see errors from your phone on your PC

When the app runs on your phone (Expo Go), errors and logs are sent to the **same terminal where you started the app** on your PC.

1. **Start the app on the PC** (and keep this terminal open):
   ```bash
   cd defendu-mobile
   npm start
   ```
   Or: `npx expo start` / `npm run start:lan` if you prefer.

2. **Connect your phone** (scan QR code with Expo Go). Once the app loads on the phone, it talks to this Metro bundler on your PC.

3. **Watch the Metro terminal on the PC**  
   - Red-screen errors and stack traces from the phone usually appear here.  
   - `console.log`, `console.error`, and `console.warn` from your code also show here.

4. **If nothing appears in the terminal**  
   - Shake your phone (or press `Ctrl+M` on Android emulator / `Cmd+D` on iOS simulator) to open the **developer menu**.  
   - Tap **"Open React Devtools"** or **"Debug Remote JS"** (depending on Expo/React Native version) to open a browser tab; the **Console** tab there will show logs and errors.

5. **From the Expo terminal (PC)** you can also press:
   - **`j`** – open debugger (browser with console)
   - **`m`** – open more options

### Open the debugger (when "Open Debugger" on the phone shows "cannot reach the site" on PC)

If you tap **"Open Debugger"** (or **"Open DevTools"**) on the phone and a browser popup on your PC says **"cannot reach the site"**, the dev server is opening your PC's LAN address (e.g. `http://192.168.x.x:8081/...`) instead of `localhost`. Your browser often can't load that, so the tab fails.

**Do this instead — open the debugger from the PC:**

1. **Best:** In the **same terminal where `npm start` is running**, press **`j`**. That opens React Native DevTools in your browser and connects correctly.
2. **Or** open the debugger in the browser **first**, then connect from the phone:
   - Double-click **`open-debugger.bat`** in the `defendu-mobile` folder (or run `.\open-debugger.bat` in a terminal there).
   - Or open in Chrome: **http://localhost:8081/debugger-ui** (if Metro is on **8082**, use **http://localhost:8082/debugger-ui**).
3. **On your phone:** Shake the device → developer menu → tap **"Open Debugger"** or **"Open DevTools"**.  
   The app will connect to the debugger tab you opened on the PC.

So: **keep the `npm start` terminal visible on your PC**; that’s where phone errors and logs show up, and pressing **`j`** is the most reliable way to open the debugger.

---

## Run on your phone

1. **Install Expo Go** on your phone ( [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) | [iOS](https://apps.apple.com/app/expo-go/id982107779) ).

2. **Start the app** (from this folder):
   ```bash
   cd defendu-mobile
   npm start
   ```
   If you get **"Failed to download remote update"** on the phone, the phone can't reach your PC. Use tunnel mode instead:
   ```bash
   npm run start:tunnel
   ```
   (First time may install `@expo/ngrok`. Scan the new QR code; the app loads over the internet so firewall/Wi‑Fi don't block it.)

3. **Open on your phone**
   - Ensure your phone and PC are on the **same Wi‑Fi** (or use `npm run start:tunnel` to avoid that).
   - Android: scan the QR code from the terminal with Expo Go.
   - iOS: scan the QR code with the Camera app, then open in Expo Go.

### Phone not connecting? (app won’t load / “Failed to download”)

1. **Use tunnel mode** so the phone doesn’t need to reach your PC on the local network:
   ```bash
   cd defendu-mobile
   npm run start:tunnel
   ```
   Scan the **new** QR code shown (tunnel URL). The first time may install `@expo/ngrok`.

2. **Start from the app folder** so Metro uses the right `node_modules`:
   ```bash
   cd d:\DEFENDU-MOB\defendu-mobile
   npx expo start --clear
   ```

3. **Same Wi‑Fi** – If not using tunnel, phone and PC must be on the same Wi‑Fi. Mobile data won’t reach your PC.

4. **Firewall** – If using LAN (no tunnel), allow Node/Expo through Windows Firewall (see “Test connection” section below for firewall steps).

5. **Test connection to your server**
   - In the app, set **Server URL** to your PC’s address, e.g. `http://192.168.1.5:8081`.
   - To get your PC’s IP:
     - **Windows:** `ipconfig` → look for “IPv4 Address” under your Wi‑Fi adapter.
     - **Mac:** System Settings → Wi‑Fi → your network → IP address.
   - Use the **port** where your server runs (e.g. **8081** for Expo / defendu-app).
   - Tap **Test connection**.
   - If the server is running and reachable, you’ll see **Success**. Otherwise you’ll see the error (e.g. connection refused, timeout).

## Test against defendu-app (web)

1. Start the web app:
   ```bash
   cd DEFENDU/defendu-app
   npm start
   ```
2. Note the URL (e.g. `exp://192.168.1.5:8081` or the LAN URL shown).
3. In Defendu Mobile, set Server URL to `http://YOUR_PC_IP:8081` (same IP and port as in the Expo output).
4. On your phone, open Defendu Mobile (Expo Go) and tap **Test connection**.

Once this works, your phone can talk to the server; you can then add UI and backend as needed.

---

## "Test connection" shows "Network request failed"

The phone must be able to reach your PC on the chosen port. Do this:

### 1. Run the test server on your PC

In a **second terminal** on your PC (keep the app running with `npm run start:tunnel` in the first):

```bash
cd D:\DEFENDU-MOB\defendu-mobile
node test-server.js
```

Leave it running. The app is already set to use port **8082** (this server). On your phone, tap **Test connection** again.

### 2. If it still fails: allow Node through Windows Firewall

Windows often blocks incoming connections from your phone.

1. Press **Win**, type **Windows Defender Firewall**, open **Allow an app or feature through Windows Defender Firewall**.
2. Click **Change settings**, then **Allow another app**.
3. Click **Browse** and add your **Node.js** executable (e.g. `C:\Program Files\nodejs\node.exe`).
4. Tick **Private** (and **Public** only if you need it), then OK.
5. Try **Test connection** on the phone again.

Alternatively, when you run `node test-server.js`, if Windows shows a **Firewall** popup, choose **Allow access** (Private networks).

### 2b. Node is already allowed but it still fails: open the port explicitly

The "Node.js" exception might not allow **inbound** on the right port. Add an explicit rule:

1. **Run PowerShell as Administrator** (right‑click PowerShell → Run as administrator).
2. Run:
   ```powershell
   cd D:\DEFENDU-MOB\defendu-mobile
   .\allow-port-firewall.ps1
   ```
   If you get "script execution is disabled", run once: `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` then run the script again. Or add the rule by hand: **Windows Security** → **Firewall** → **Advanced settings** → **Inbound Rules** → **New Rule** → Port → TCP, 8082 → Allow → Private.
3. Run `node test-server.js` again and try **Test connection** on the phone.

To remove the rules later: Windows Security → Firewall → Advanced settings → Inbound Rules → delete "Defendu Mobile Test - Port 8082" (and 8081 if you added it).

### 3. Same Wi‑Fi and no client isolation

Phone and PC must be on the **same Wi‑Fi** (same subnet, e.g. 192.168.254.x). Mobile data on the phone won’t reach your PC.

Some routers have **client/AP isolation** (devices on Wi‑Fi can’t talk to each other). If you have that, turn it off for testing, or connect the PC with Ethernet to the same router so the phone (Wi‑Fi) and PC (Ethernet) can see each other.

---

## Browser on phone shows "Site cannot be reached"

Your router or network is blocking the phone from reaching the PC. **Use a tunnel** so the phone connects over the internet. No extra downloads—just Node (and optionally SSH).

### Option A: localtunnel (no download, no signup)

1. On your PC, **two terminals** (no download needed): - **Terminal 1:** `node test-server.js` (leave running)
   - **Terminal 2:** `npx localtunnel --port 8082` (or: `npm run tunnel`)

3. In the ngrok terminal you’ll see a line like:
   ```text
   Forwarding   https://abc123.ngrok-free.app -> http://localhost:8082
   ```
   Copy that **https://** URL (e.g. `https://abc123.ngrok-free.app`).

4. In the Defendu Mobile app on your phone, **clear the Server URL and paste that https URL**, then tap **Test connection**.  
   The phone will reach your PC over the internet; you should see **Success**.

### Option B: localhost.run (no download if you have OpenSSH)

With `node test-server.js` running in another terminal, run:

```bash
ssh -R 80:localhost:8082 nokey@localhost.run
```

It will print a **https://** URL. Use that URL in the app as **Server URL** and tap **Test connection**. No signup (OpenSSH is built into Windows 10/11).


POWERSHELL CHANGE PORT COMMAND CHANGE NUMBER TO PHONE IP ADDRESS
setx /M REACT_NATIVE_PACKAGER_HOSTNAME 192.168.254.102

---

## Running in dev mode (pose estimation, native features)

Some features (e.g. **“Try with pose”** / pose estimation) use **native modules** and **do not work in Expo Go**. Use a **dev build** on a physical device or emulator.

### 1. Prerequisites

- **Android:** Android Studio installed, device in developer mode with USB debugging, or an Android emulator.
- **iOS (Mac only):** Xcode, device or simulator.
- From the project folder: `npm install` (or `yarn`) already done.

### 2. Run a dev build

**Android (device or emulator):**

```bash
cd defendu-mobile
npx expo run:android
```

With a device connected via USB: `npx expo run:android --device`.  
The first run builds and installs the app; later runs are faster.

**iOS (Mac only):**

```bash
cd defendu-mobile
npx expo run:ios
```

Use `--device` for a physical device, or omit it to use the simulator.

### 3. Start Metro (for live reload / dev)

In a terminal on your PC:

```bash
cd defendu-mobile
npx expo start
```

Keep this running. The dev build on the phone will use this Metro bundler for JS updates. Shake the device (or use the dev menu) for reload, debugger, etc.

### 4. Pose estimation (“Try with pose”)

- **Expo Go:** Not supported (native camera/pose libraries are not in Expo Go).
- **Dev build:** Supported. Install the app with `npx expo run:android` (or `run:ios`), then open a module that has **“Try with pose”** and allow camera when prompted.
- For more detail (reference poses, practice mode, rep count), see **docs/POSE_ESTIMATION_IMPLEMENTATION.md**.