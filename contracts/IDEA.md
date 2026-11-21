# StayPut *(working title)*

API details: [`API_CONTRACT.md`](API_CONTRACT.md).

**An old phone that guards your stuff.**
Put it on your laptop or in your bag, tap **Arm**, walk away. If anyone moves it, the dashboard shows an alert within seconds.

*Lay it on your laptop to know if it's taken. Hide it in your bag to know where it goes.*

---

## The problem
- You need to step away from your laptop or bag in a café, library or coworking space.
- Today you either pack everything up, ask a stranger, or hope for the best.
- Most people have an old phone in a drawer that could do the job.

## How it works
1. **Arm:** tap Arm and put the phone on your stuff (face down works). It arms once it lies still.
2. **Guard:** the screen goes **pitch black**, so the phone looks dead. It only sends when it moves, plus a heartbeat every 30 s.
3. **Alert:** someone moves it → the dashboard turns **red**: *"14:02 picked up"*. The phone stays black, and from then on also sends where it is.
4. **Disarm:** back at your table, tap the black screen and enter your **PIN**. The phone tells you what happened while you were away.

---

## Why this idea
- **Real use:** a common situation, free, no extra hardware.
- **Demo anywhere:** everything happens on one table. No driving; GPS is a bonus, not needed.
- **Builds on what works:** sending readings already works; we have 189 real readings.
- **Real processing:** the server turns readings into decisions and alerts, not just storage.
- **Privacy that matters:** only you should see your alerts → pairing becomes a real feature.

**Not chosen:**
- Stand-up reminder: smartwatches already do it.
- Vehicle GPS tracking: can't drive indoors.
- Shipment monitoring: for companies, not people.

---

## Detection (from our real data)
When it arms, the phone's **direction of gravity** where it lies is saved. Each new reading is compared with it:

| Alert | Rule | Real data |
|---|---|---|
| **Picked up** | direction changes > **15°** | still on a table: 0.2–0.6° · picked up: **25–57°** |

- **Direction, not magnitude:** a resting phone reads 0.92–0.98 g, so magnitude jitters; direction barely moves.
- **Arms only once it lies still:** otherwise putting it down would count as "picked up".
- **The alarm stays on** until you disarm it.
- **Sends only what matters:** a phone lying still sends ~120 readings an hour instead of 3,600, so the database isn't flooded.

**Stealth:** a thief shouldn't know it's an alarm. While armed the screen is black at minimum brightness (on AMOLED it looks switched off),
it looks the same before and after an alert, and only the PIN disarms it. A thief can still close the app, but by then the alert has fired.

**Location (optional):** saved once when it arms, then sent live with every reading after an alert.
It only helps when the phone travels with your stuff (in a bag, a car). On a laptop, a thief can take the laptop and leave the phone, so motion is the alarm and GPS is the bonus.
Indoors it's rough (±10–50 m), and the app works without it.

---

## Architecture
```
Phone (Arm, PIN) ──readings──▶   Backend (detects, alerts) ◀──▶ Database
                                        ▲
                                        └── Dashboard: DISARMED / GUARDING / ALERT
```

| Part | Builds |
|---|---|
| **Mobile** | Arm, PIN disarm, black stealth screen, send on movement + heartbeat, location after an alert |
| **Backend** | store readings, arm state, detection rules, alerts |
| **Dashboard** | status with a 3D phone (where it lay, where it is now), where it is on a map, activity; sensor data on demand |

## Roadmap
| | Adds | Status |
|---|---|---|
| **v0** | send, store, show readings | mobile done |
| **v1** | Arm/Disarm, arm once still, auto-send, "picked up" alert, alarm stays on, optional location | mobile and backend done |
| **v1.1** | stealth black screen, PIN-only disarm, send on movement + 30 s heartbeat | mobile done |
| **v2** | more alert types (shaken, tipped over), detect lifting and turning, after testing; sound on the phone, browser notification | |
| **v3** | pairing code: only you see your alerts | |

## Demo (2 min)
1. Dashboard: phone online, **DISARMED**.
2. Tap Arm, put the phone face down on a laptop → **GUARDING**; the phone goes black.
3. A judge picks it up: the phone still looks dead, the dashboard turns **red: picked up**. Walk off with it: the location follows.
4. Enter the PIN on the phone → disarmed, back to grey; show the alert history.

## Open questions
- Name?
- How to notify the owner beyond the dashboard?
- Which dashboard do we keep?
- Do we need more alert types? Decide after real testing.
- Does lifting without tilting (a bag carried level) need a second check?
