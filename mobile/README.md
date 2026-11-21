# Mobile app

Expo (React Native) app that turns a phone into a motion alarm: it reads the accelerometer, and while **armed** it sends a reading whenever the phone moves (plus a heartbeat every 30 s) so the server can tell when it's picked up.

## What you need
- **Node 26 LTS** (`nvm use` picks it up from `.nvmrc`)
- A **real phone** (iPhone or Android). Simulators have no accelerometer.
- The **Expo Go** app on the phone (App Store / Play Store)
- A free **Expo account** (sign up at expo.dev/signup or with `npx expo register`)
- Python 3 if you want to use the dummy server (Windows: install from python.org and tick "Add python.exe to PATH")

Commands below are for Windows (PowerShell or cmd).

## 1. Install
```bash
cd mobile
npm install
```

## 2. Sign in to Expo (laptop **and** phone)
Expo Go only opens the project if you're signed in to the **same Expo account** on both:

```bash
npx expo login      # asks for your username and password
npx expo whoami     # check it worked
```
Then open **Expo Go** on the phone → profile / **Log in** → same account.

Without this, the phone shows: *"You need to be signed in to Expo Go and Expo CLI to open your project."*

## 3. Put the phone and the laptop on the same network
The phone loads the app straight from your laptop, so **both must be on the same WiFi**, and that WiFi must let devices talk to each other.
Venue/guest WiFi often blocks this. The reliable option is the **phone's hotspot**: turn on Personal Hotspot on the phone and connect the laptop to it.

**Windows:** a phone hotspot usually joins as a **Public** network, and Windows Firewall blocks incoming connections on Public networks.
Set it to Private: Settings → Network & internet → Wi-Fi → (your network) → **Private network**.

## 4. Start the dummy server and set up `mobile/.env`
From the repo root:
```bash
python mobile/dev-server/server.py      # or: py mobile/dev-server/server.py
```
It finds your laptop's IP and tells you what to do with `mobile/.env` (gitignored): `mobile/.env OK`, or the exact command and line to create or update it.
Do what it says, then (re)start Expo. After that it prints every reading it receives.
When Windows Firewall asks, click **Allow access**, and tick **Public** too if you're on a hotspot.
See [`dev-server/README.md`](dev-server/README.md).

Skip this step to run the app in **mock mode**: nothing is sent, and a "Simulate server error" switch lets you test the retries.

## 5. Run it on the phone
```bash
cd mobile
npx expo start
```
Check the address under the QR code uses the same IP the dummy server printed (`exp://<that IP>:8081`), then scan the QR code (iPhone: Camera app; Android: Expo Go).
On iPhone, allow **Local Network** access for Expo Go when asked.

You should see live x/y/z values. The badge at the top shows **MOCK MODE** or **LIVE: <url>**.

- **Send reading** (under **Developer**, with the raw sensor values): sends one reading. The app shows `Sent ✓ id …` and the dummy server prints it.
- **Arm:** the first time, set a 4-digit **PIN**: it's the only way to disarm. Then put the phone down (face down works).
  It shows **PUT IT DOWN** and arms only once it has been lying still for 2 seconds (at least 5 seconds after the tap),
  so the resting position is where it lies, not where you held it.
- **Stealth (on by default):** as soon as it arms, the screen goes **pitch black** at minimum brightness, so it looks dead ("PUT IT DOWN" shows "Tap + PIN to disarm" beforehand).
  It looks the same before and after an alert. Tap the screen to show the dim PIN pad; the right PIN disarms, a wrong one just clears.
  After disarming, the main screen says what happened while you were away.
  Turn **Stealth** off to see the **GUARDING** screen (timer, sent/failed) and the red **MOVED** screen while testing; Disarm still asks for the PIN.
- **What it sends while armed:** one reading right away, then a reading only when the phone turns more than 2° (at most one per second),
  plus a heartbeat every 30 s. The dummy server prints `== ARMED` and how far each reading has turned from the resting position.
  Pick the phone up: the server prints `!! ALERT picked_up …`. From then on the phone sends a reading whenever its location changes (every 10 m or so),
  with the live GPS location (`gps=…` on the server; "Now at …" on the MOVED screen). The alarm stays on until you disarm.
  Mock mode never raises an alert: alerts need the dummy server.
- **Keep the app open while armed:** phones pause apps in the background, so locking the phone or leaving the app stops the readings. The guarding screen keeps the phone from locking by itself.
  Tip: turn on Do Not Disturb, so notifications don't light up the black screen.
  In Expo Go, its gear button (top right) stays on the black screen: Expo Go can't hide it. A development or release build doesn't have it.

## Troubleshooting
| Problem | Fix |
|---|---|
| Expo Go: *"Could not connect to the server"* | Phone and laptop aren't on the same network, or the network blocks device-to-device traffic → use the phone's hotspot. Quick test: in the phone's browser open the dummy server's address with port `8081` and `/status` (e.g. `http://172.20.10.7:8081/status`); it should say `packager-status:running`. |
| Worked before, fails after switching network | The QR code keeps the IP from when Expo started. Restart the dummy server (it tells you if `.env` has an old IP) and `npx expo start`. |
| iPhone can't reach the laptop at all | Settings → Privacy & Security → **Local Network** → Expo Go on. |
| Phone browser can't open the laptop's URL | Set the Wi-Fi/hotspot network to **Private** (see step 3), or allow Node.js and Python in Windows Defender Firewall → "Allow an app through firewall" for Public too. |
| *"You need to be signed in to Expo Go and Expo CLI"* | Step 2: same Expo account on laptop and phone. |
| Send says `failed: no connection to server` | The dummy server isn't running, or `.env` is out of date: restart the server and follow what it prints. Then open its address + `/health` in the phone's browser. |
| Readings stop while armed | The phone was locked or the app left the screen. Open it again and it carries on. Keep it open on the guarding screen. |
| Forgot the PIN | Close the app (swipe it away) and open it again, then **Change PIN** on the main screen. |
| Screen stays dark after closing the app while armed (iPhone) | iOS keeps the app's brightness until the phone locks. Lock and unlock it, or raise the brightness. |
| *"Accelerometer not available"* | You're on a simulator. Use a real phone. |

## Files
| Path | What |
|---|---|
| `App.tsx` | Main screen: what sets off the alarm, Arm, dashboard code, settings (name, PIN, Stealth, Delete my data), Developer section |
| `src/GuardScreen.tsx` | Shown while armed: PUT IT DOWN, then the black stealth screen (or GUARDING / MOVED with Stealth off); keeps the screen awake |
| `src/PinPad.tsx`, `src/pin.ts` | The PIN pad, and the PIN saved on the phone |
| `src/useGuard.ts` | Arm/disarm and what gets sent while armed (on movement, heartbeat, location after an alert) |
| `src/theme.ts` | Colours and typeface: the same as the dashboard (`codelap-dashboard/src/index.css`) |
| `src/sensor.ts` | Accelerometer hook (x/y/z/magnitude in g, ~10 per second) |
| `src/location.ts` | GPS hook (`expo-location`, while the app is open); sent with Arm, with Send reading, and with every reading after an alert |
| `src/api.ts` | `POST /api/events`, arm and disarm, with timeout, retries and mock mode |
| `src/deviceId.ts` | Creates `phone-xxxxxxxx` once and keeps it |
| `dev-server/` | Dummy API for testing the app on its own + 189 captured real readings |
