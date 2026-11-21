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
1. **Arm:** tap Arm and put the phone on your stuff. It arms once it lies still.
2. **Guard:** it sends a reading every second; nothing happens while it lies still.
3. **Alert:** someone moves it → the dashboard turns **red**: *"14:02 picked up"*. From then on the phone also sends where it is.
4. **Disarm:** back at your table, see what happened while you were away.

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

**Location (optional):** saved once when it arms, then sent live with every reading after an alert.
It only helps when the phone travels with your stuff (in a bag, a car). On a laptop, a thief can take the laptop and leave the phone, so motion is the alarm and GPS is the bonus.
Indoors it's rough (±10–50 m), and the app works without it.

---

## Architecture
```
Phone (Arm/Disarm) ──readings──▶ Backend (detects, alerts) ◀──▶ Database
                                        ▲
                                        └── Dashboard: DISARMED / GUARDING / ALERT
```

| Part | Builds |
|---|---|
| **Mobile** | Arm/Disarm, send every second while armed, "GUARDING" screen |
| **Backend** | store readings, arm state, detection rules, alerts |
| **Dashboard** | big status, alert history, live chart, online/offline |

## Roadmap
| | Adds | Status |
|---|---|---|
| **v0** | send, store, show readings | mobile done |
| **v1** | Arm/Disarm, arm once still, auto-send, "picked up" alert, alarm stays on, optional location | mobile and backend done |
| **v2** | more alert types (shaken, tipped over) after testing; sound on the phone, browser notification | |
| **v3** | pairing code: only you see your alerts | |

## Demo (2 min)
1. Dashboard: phone online, **DISARMED**.
2. Tap Arm, put the phone on a laptop → **GUARDING**.
3. A judge picks it up → **red: picked up**. Walk off with it: the location follows.
4. Disarm → back to grey; show the alert history.

## Open questions
- Name?
- How to notify the owner beyond the dashboard?
- Which dashboard do we keep?
- Do we need more alert types? Decide after real testing.
- Does lifting without tilting (a bag carried level) need a second check?
