# StayPut

API details: [`API_CONTRACT.md`](API_CONTRACT.md).

**An old phone that guards your stuff.**
Put it on your laptop or in your bag, tap **Start guarding**, walk away. If anyone moves it, the dashboard shows an alert within seconds.

*Lay it on your laptop to know if it's taken. Hide it in your bag to know where it goes.*

---

## The problem
- You need to step away from your laptop or bag in a café, library or coworking space.
- Today you either pack everything up, ask a stranger, or hope for the best.
- Most people have an old phone in a drawer that could do the job.

## How it works
1. **Pair:** the phone shows a 6-digit code; enter it on the dashboard (your laptop, or another phone's browser). Only that
   dashboard sees this phone, and the phone can't start guarding without one.
2. **Start guarding:** tap it and put the phone on your stuff (face down works). It starts once it lies still.
3. **Guard:** the screen goes **pitch black**, so the phone looks dead. It only sends when it moves, plus a heartbeat every 30 s.
4. **Alert:** someone moves it → the dashboard turns **red**: *"14:02 picked up"*. The phone stays black, and from then on also sends where it is.
5. **Stop guarding:** back at your table, tap the black screen and enter your **PIN**. The phone tells you what happened while you were away.

---

## Why this idea
- **Real use:** a common situation, free, no extra hardware.
- **Demo anywhere:** everything happens on one table. No driving; GPS is a bonus, not needed.
- **Builds on what works:** sending readings already works; we have 189 real readings.
- **Real processing:** the server turns readings into decisions and alerts, not just storage.
- **Privacy that matters:** my phone, my data. Only your paired dashboard sees your phone, and **Delete my data** removes everything.

**Not chosen:**
- Stand-up reminder: smartwatches already do it.
- Vehicle GPS tracking: can't drive indoors.
- Shipment monitoring: for companies, not people.

---

## Detection (from our real data)
When it starts guarding, the phone's **direction of gravity** where it lies is saved. Each new reading is compared with it:

| Alert | Rule | Real data |
|---|---|---|
| **Picked up** | direction changes > **6°** | still on a table: 0.2–0.6° · writing on the table: ≤ 4.5° · held level or carried: past 6° within 1–2 s · picked up: **25–57°** |

- **Direction, not magnitude:** a resting phone reads 0.92–0.98 g, so magnitude jitters; direction barely moves.
- **Starts only once it lies still:** otherwise putting it down would count as "picked up".
- **The alarm stays on** until you stop guarding.
- **Sends only what matters:** a phone lying still sends ~120 readings an hour instead of 3,600, so the database isn't flooded.

**Stealth:** a thief shouldn't know it's an alarm. While guarding the screen is black at minimum brightness (on AMOLED it looks switched off),
it looks the same before and after an alert, and only the PIN stops it. A thief can still close the app, but by then the alert has fired.

**Location (optional):** saved once when it starts guarding, then a fresh position every 5 s after an alert.
It only helps when the phone travels with your stuff (in a bag, a car). On a laptop, a thief can take the laptop and leave the phone, so motion is the alarm and GPS is the bonus.
Indoors it's rough (±10–50 m), and the app works without it.

---

## Architecture
```
Phone (Start guarding, PIN) ──readings──▶   Backend (detects, alerts) ◀──▶ Database
                                                   ▲
                                                   └── paired Dashboard: safe / guarding / alert
```

| Part | Builds |
|---|---|
| **Mobile** | pairing code, Start guarding, PIN to stop, black stealth screen, send on movement + heartbeat, location after an alert, Delete my data |
| **Backend** | tokens and pairing, guarding state, detection, alerts, what to keep |
| **Dashboard** | status with a 3D phone (where it lay, where it is now), where it is on a map, activity; sensor data on demand |

## Roadmap
| | Adds | Status |
|---|---|---|
| **v0** | send, store, show readings | done |
| **v1** | start/stop guarding, start once still, auto-send, "picked up" alert, alarm stays on, optional location | done |
| **v1.1** | stealth black screen, PIN-only stop, send on movement + 30 s heartbeat | done |
| **v2** | more alert types (shaken, tipped over), detect turning flat, entry delay; sound on the phone, browser notification | not built (skipped for v3) |
| **v3** | pairing code, one dashboard per phone, tokens; Delete my data; can't guard without a dashboard | done |

## Demo (2 min)
1. Pair: show the code on the phone, enter it on the dashboard. Phone online, not guarding.
2. Tap Start guarding, put the phone face down on a laptop → **guarding**; the phone goes black.
3. A judge picks it up: the phone still looks dead, the dashboard turns **red: picked up**. Walk off with it: the location follows.
4. Enter the PIN on the phone → guarding stops, "While you were away" on the phone; show the activity on the dashboard.

## Open questions
- How to notify the owner beyond the dashboard (browser notification, sound)?
- Do we need more alert types? Decide after more real testing.
- Lifting level is caught by 6° within 1–2 s; turning flat on the table isn't. Worth a gyroscope check?
