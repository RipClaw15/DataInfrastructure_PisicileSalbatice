# Mobile app

Expo (React Native) app that reads the phone's accelerometer, shows the values live and sends a reading to the API when you tap **Send reading**.

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

You should see live x/y/z values. Tap **Send reading**: the app shows `Sent ✓ id …` and the dummy server prints the reading.
The badge at the top shows **MOCK MODE** or **LIVE: <url>**.

## Troubleshooting
| Problem | Fix |
|---|---|
| Expo Go: *"Could not connect to the server"* | Phone and laptop aren't on the same network, or the network blocks device-to-device traffic → use the phone's hotspot. Quick test: in the phone's browser open the dummy server's address with port `8081` and `/status` (e.g. `http://172.20.10.7:8081/status`); it should say `packager-status:running`. |
| Worked before, fails after switching network | The QR code keeps the IP from when Expo started. Restart the dummy server (it tells you if `.env` has an old IP) and `npx expo start`. |
| iPhone can't reach the laptop at all | Settings → Privacy & Security → **Local Network** → Expo Go on. |
| Phone browser can't open the laptop's URL | Set the Wi-Fi/hotspot network to **Private** (see step 3), or allow Node.js and Python in Windows Defender Firewall → "Allow an app through firewall" for Public too. |
| *"You need to be signed in to Expo Go and Expo CLI"* | Step 2: same Expo account on laptop and phone. |
| Send says `failed: no connection to server` | The dummy server isn't running, or `.env` is out of date: restart the server and follow what it prints. Then open its address + `/health` in the phone's browser. |
| *"Accelerometer not available"* | You're on a simulator. Use a real phone. |

## Files
| Path | What |
|---|---|
| `App.tsx` | The screen: live readings, Send button, status, last payload |
| `src/sensor.ts` | Accelerometer hook (x/y/z/magnitude in g, ~10 per second) |
| `src/api.ts` | `POST /api/events` with timeout, retries and mock mode |
| `src/deviceId.ts` | Creates `phone-xxxxxxxx` once and keeps it |
| `dev-server/` | Dummy API for testing the app on its own + 189 captured real readings |
