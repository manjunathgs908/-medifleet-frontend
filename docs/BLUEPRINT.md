# SaveLife Ambulance Ecosystem — Master Blueprint v1.0

**Prepared for:** Manjunath G S, Founder — SaveLife Health Services, Bengaluru
**Scope:** Product, engineering, operations, and business architecture for a pan-India emergency + non-emergency medical transport platform
**Target scale:** 10,00,000 (10 lakh) bookings/month
**Date:** July 2026

---

## 0. How to read this document

This is written against **what you already have** — `medifleet-backend` (Node/Express on Render), MongoDB Atlas ("medifleet"), `savelife-web` (Next.js), `savelife-app` (customer RN), `medifleet-app` (driver Expo), and the CRM at `crm.savelife.health`. Nothing here asks you to throw that away. Every section marks:

- 🟢 **HAVE** — already built, keep
- 🟡 **EXTEND** — exists, needs work
- 🔴 **NEW** — does not exist yet
- ⏳ **SCALE-ONLY** — do not build until you cross ~50,000 bookings/month

The single biggest mistake you can make is building all 8 surfaces at once. Section 20 gives the build order. **Read Section 20 before Section 4.**

---

## 1. Strategic positioning

### 1.1 What SaveLife actually is

You are not "Uber for ambulances." That framing has killed multiple Indian startups (Ziqitza struggled with it, Dial4242 stayed regional, StanPlus/Red.Health pivoted hard into hospital B2B for exactly this reason).

The truth of this market:

| Assumption from ride-hailing | Reality in Indian ambulance |
|---|---|
| Demand is high-frequency per user | A person books an ambulance ~0–2 times in a lifetime. **Zero retention on B2C emergency.** |
| Marketplace liquidity wins | Supply is licensed, capital-heavy, and driver-owner controlled. You can't flood the market. |
| Price competition drives share | Emergency buyers are price-insensitive at the moment of need but scream about it after. Reputation risk is asymmetric. |
| CAC is recoverable over lifetime | Emergency CAC is a **one-shot cost**. Your Google Ads ₹/call must be recovered in that single trip or from B2B. |

**Therefore SaveLife's real business is:**

> **A medical-transport operating system that earns its money from institutions (hospitals, corporates, insurers, government), while B2C emergency serves as brand, trust, and demand-density fuel.**

The consumer app is your *front door and moat signal*. The revenue engine is B2B contracts and, eventually, licensing the MediFleet platform itself to other operators (Section 17.2). This is the Red.Health lesson and the Zomato lesson combined: the consumer surface creates the brand; the enterprise/SaaS surface pays the bills.

### 1.2 The four things you must be world-class at

Everything else is commodity. Be obsessive about exactly these:

1. **Time-to-dispatch (TTD)** — booking confirmed → driver accepted. Target: **< 45 seconds, p95.** This is your only real product metric in emergency.
2. **Location truth** — pickup accuracy in Indian addresses (no house numbers, landmark-driven). This is where Google Maps thinking matters more than Uber thinking.
3. **Price integrity** — a published, auditable, non-negotiable rate card. The #1 complaint against Indian ambulances is on-the-spot extortion. Being the operator that *cannot* overcharge is a defensible brand position.
4. **Clinical handoff** — the patient's condition, vitals, and destination bed status travelling ahead of the vehicle. This is what hospitals pay for and what nobody in India does well.

### 1.3 Non-negotiable design principles

- **Emergency never surges.** Non-emergency and scheduled transport may surge. Publish this. It's both an ethical position and a regulatory shield.
- **The app must work at 2G, one-handed, in panic, in the dark.** Every emergency screen: max 1 decision, thumb-reachable, high contrast, no scroll to act.
- **Voice-first fallback everywhere.** A caller who can't use the app must reach a human in ≤ 2 rings. Your Google Ads call campaign already proves calls dominate.
- **Never make a clinical claim.** The platform *routes and records*. It does not diagnose, triage medically, or advise treatment. All AI output is labelled as operational assistance and reviewed by a licensed human before clinical use. (Legal survival depends on this line.)
- **Every rupee and every state transition is auditable.** Immutable event log, no exceptions.

---

## 2. Ecosystem map

```
                        ┌───────────────────────────────────────┐
                        │        SAVELIFE PLATFORM CORE          │
                        │  Identity · Dispatch · Pricing ·        │
                        │  Trip State Machine · Ledger · Events   │
                        └───────────────────────────────────────┘
                                        ▲
        ┌──────────────┬──────────────┬──┴───────────┬──────────────┬─────────────┐
        │              │              │              │              │             │
 ┌──────┴─────┐ ┌──────┴─────┐ ┌──────┴─────┐ ┌──────┴─────┐ ┌─────┴──────┐ ┌────┴─────┐
 │ CUSTOMER   │ │  DRIVER    │ │   ADMIN    │ │   FLEET    │ │  HOSPITAL  │ │ CORPORATE│
 │ App + Web  │ │ App (+EMT) │ │ CRM/Dispatch│ │   OWNER    │ │  Dashboard │ │Dashboard │
 │ 🟢 HAVE    │ │ 🟢 HAVE    │ │ 🟢 HAVE    │ │ 🔴 NEW     │ │ 🔴 NEW     │ │ 🔴 NEW   │
 └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────┘
                                        │
                        ┌───────────────┴───────────────┐
                  ┌─────┴──────┐                 ┌──────┴──────┐
                  │ INSURANCE  │                 │ GOVERNMENT  │
                  │ Dashboard  │                 │  Dashboard  │
                  │ ⏳ LATER   │                 │ ⏳ LATER    │
                  └────────────┘                 └─────────────┘

  EXTERNAL: Google Maps/Places · MSG91 (SMS/OTP) · Razorpay/PhonePe · Exotel/Ola-IVR
            ABDM/ABHA · 108-112 handoff · GSTN · Vahan/Sarathi · FASTag · Telematics
```

**Surface count discipline:** 8 dashboards is 8 codebases in the naive design. It is **3 codebases** in the correct design:

- `savelife-app` — customer (RN)
- `medifleet-app` — driver/EMT (Expo)
- `medifleet-console` — **one** React app that renders Admin, Fleet Owner, Hospital, Corporate, Insurance, and Government views from the *same* component library, gated by role and tenant. Different navigation trees, shared tables/maps/charts.

Build one console. Not six portals. This single decision saves you roughly 18 engineer-months.

---

## 3. Personas, roles and tenancy

### 3.1 Tenancy model

Three-level hierarchy. Get this right in the data model on day one — retrofitting tenancy is the most expensive migration in SaaS.

```
Platform (SaveLife)
 └── Org  (fleet_owner | hospital | corporate | insurer | govt_body | savelife_internal)
      └── Branch/Site (a hospital's second campus, a corporate's Pune office)
           └── User (with one or more Roles scoped to Org/Branch)
```

Every domain document carries `orgId` and optional `branchId`. Every query is filtered by tenant at the data-access layer, **not** in the controller. One shared middleware, no exceptions — this is how you avoid a cross-tenant data leak, which in health data under the DPDP Act 2023 is company-ending.

### 3.2 Personas

| # | Persona | Surface | Primary job-to-be-done | Emotional state |
|---|---|---|---|---|
| P1 | Panicked bystander/family | Customer app / call | "Get a vehicle here NOW" | Terror, tunnel vision |
| P2 | Planner (dialysis, discharge, chemo) | Customer app | "Book reliable transport for Tue 9am" | Routine, price-sensitive |
| P3 | Ambulance driver | Driver app | "Earn more, drive less empty, get paid on time" | Fatigue, distrust of platforms |
| P4 | EMT / Paramedic | Driver app (EMT mode) | "Record care, hand off cleanly" | Clinical focus |
| P5 | SaveLife dispatcher | Admin console | "Never let a call go unassigned" | High-tempo, multi-tasking |
| P6 | Ops manager | Admin console | "Utilisation, SLA, complaints" | Analytical |
| P7 | Fleet owner (partner) | Fleet portal | "Is my vehicle earning? When do I get paid?" | Suspicious, cash-flow driven |
| P8 | Hospital transport coordinator | Hospital dashboard | "Discharge this patient, free the bed" | Throughput pressure |
| P9 | Hospital ED charge nurse | Hospital dashboard | "What's arriving, how bad, when" | Preparation |
| P10 | Corporate EHS/HR manager | Corporate dashboard | "Employee cover, event standby, compliance proof" | Audit-driven |
| P11 | Insurer / TPA claims officer | Insurance dashboard | "Was this trip real, medically necessary, correctly priced" | Fraud-suspicious |
| P12 | Govt health officer | Govt dashboard | "Coverage, response times, public accountability" | Reporting-driven |

### 3.3 Role catalogue

| Role | Org type | Notes |
|---|---|---|
| `customer` | — | Retail user |
| `driver` | fleet_owner / savelife | Device-bound |
| `emt` | fleet_owner / savelife | Clinical record access |
| `fleet_owner_admin` | fleet_owner | Sees only own vehicles/earnings |
| `fleet_owner_staff` | fleet_owner | No payouts visibility |
| `dispatcher` | savelife | Live board, assign, override |
| `ops_manager` | savelife | Dispatch + SLA + refunds up to limit |
| `finance` | savelife | Ledger, payouts, invoices, GST |
| `support_agent` | savelife | Trip lookup, no PII export, no pricing edit |
| `platform_admin` | savelife | Everything except break-glass |
| `super_admin` | savelife | Break-glass, 2-person rule |
| `hospital_coordinator` | hospital | Book, track, own-patients only |
| `hospital_clinician` | hospital | Inbound clinical view, vitals |
| `hospital_admin` | hospital | Contract, invoices, users |
| `corp_admin` | corporate | Policy, budget, users |
| `corp_employee` | corporate | Book under company cover |
| `insurer_claims` | insurer | Claim review, doc access |
| `insurer_admin` | insurer | Network rates, users |
| `govt_viewer` | govt_body | **Aggregated + de-identified only** |
| `govt_auditor` | govt_body | Case-level with warrant flag + audit trail |

---

## 4. Customer App — complete screen design

**Stack:** React Native (`savelife-app`) + Next.js web (`savelife-web`) sharing the same booking API and quote engine.

### 4.1 Screen inventory (42 screens)

```
ONBOARDING            HOME/BOOK              TRIP LIVE            POST-TRIP
 01 Splash             08 Home (map)          20 Searching         30 Trip Summary
 02 Language Select    09 Service Grid        21 Driver Assigned   31 Payment
 03 Permissions        10 Pickup Picker       22 Arriving          32 Rate & Tip
 04 Phone + OTP        11 Drop Picker         23 Verify OTP        33 Invoice/Receipt
 05 Profile Basics     12 Vehicle Select      24 Patient Onboard   34 Complaint
 06 Medical Profile    13 Add-ons/Staffing    25 En Route          35 Insurance Claim
 07 Emergency Contacts 14 Schedule/Now        26 Hospital Reached  36 Share Report
                       15 Fare Breakdown      27 Live Share
 ACCOUNT               16 Patient Details     28 SOS               EMPTY/EDGE
 37 Profile            17 Payer Select        29 Chat/Call         40 No Network
 38 Trip History       18 Review & Confirm                          41 No Vehicle
 39 Saved Places       19 Cancel Sheet                              42 Service Down
```

### 4.2 The Home screen — the most important screen you own

Uber puts "Where to?" first. **You must not.** In a cardiac arrest the user has ~8 seconds of usable attention.

```
┌─────────────────────────────────┐
│  ☰            SaveLife      🔔  │
│                                 │
│   [ LIVE MAP — user's GPS dot,  │
│     nearby ambulance pins,      │
│     "3 ambulances near you"  ]  │
│                                 │
│  ╔═══════════════════════════╗  │  ← 56px tall, red #E8192C,
│  ║   🚨  EMERGENCY AMBULANCE ║  │    always above the fold,
│  ║       Tap once. We call.  ║  │    NEVER moves position
│  ╚═══════════════════════════╝  │
│                                 │
│  📞 Call 24×7  ·  1800-XXX-XXXX │  ← always visible, tel: link
│  ─────────────────────────────  │
│  Plan a transport                │
│  ┌────┐┌────┐┌────┐              │
│  │ 🏥 ││ ✈️ ││ ❄️ │  … 9 services │
│  └────┘└────┘└────┘              │
│  ─────────────────────────────  │
│  Recent: Manipal → Home  [Rebook]│
└─────────────────────────────────┘
```

**Emergency one-tap flow — the entire product in 4 taps:**

```
TAP 1: "EMERGENCY AMBULANCE"
   → Instantly: reverse-geocode GPS, create DRAFT trip, start dispatch pre-warm
   → Screen shows detected address in huge text + "Confirm" / "Change"
TAP 2: "Confirm pickup"
   → Vehicle auto-selected as BLS (safest default); shows "Need ICU/Ventilator? →"
TAP 3: "CONFIRM — Send Ambulance"
   → Booking created. Dispatch fires. Simultaneously: auto-call placed to your
     control room so a human is on the line while the app searches.
TAP 4: (only if needed) "Answer driver call"
```

Drop location is **not required** to dispatch. This is the single highest-leverage UX decision in the whole product. Ask for the hospital *after* the vehicle is moving, on the Arriving screen. Uber can't do this. You can, because the vehicle's job is to reach the patient, not to know the destination.

**Panic-mode rules (applies to screens 08, 20–29):**
- Minimum font 18sp, primary actions 20sp bold
- One primary action per screen, ≥56dp height, bottom 25% of screen
- No modals, no carousels, no onboarding tooltips
- Haptic + audible confirmation on every state change
- Screen stays awake; brightness boosted
- All copy at Grade-5 reading level, in the chosen language

### 4.3 Location capture (the Indian address problem) 🟡 EXTEND

You already have `AddressInput` + `FullScreenMapPicker`. Extend to a 4-layer resolver, tried in order:

1. **GPS + reverse geocode** → present as editable
2. **Landmark search** — Places Autocomplete biased to 5km radius, weighted toward hospitals, temples, schools, bus stops (Indians navigate by landmark, not address)
3. **Draggable pin** with satellite toggle and "pin on the gate, not the building"
4. **Live location link** — customer sends a WhatsApp/SMS link that opens a lightweight PWA which streams their GPS to the driver for 30 minutes. Solves the "I'm on a flyover / inside a slum lane / in a village with no address" case, which is ~15% of emergency calls.

Also capture, once, per saved place: **floor number, lift availability, stretcher access, gate/tower name**. Store on `SavedPlace`. Drivers lose 4–7 minutes per trip on exactly this. Recovering it is worth more than any dispatch optimisation you will ever write.

### 4.4 Vehicle selection screen

Never show medical jargon alone. Every option is *symptom-anchored*:

| Card | Sub-label (the actual copy) | Price display |
|---|---|---|
| **Basic (BLS)** | Stable patient, needs transport | ₹1,200 est. · 6 min |
| **Advanced (ALS)** | Breathing difficulty, chest pain, unstable | ₹2,400 est. · 9 min |
| **ICU / Ventilator** | On ventilator, critical shifting | ₹4,500 est. · 14 min |
| **Neonatal** | Newborn, incubator needed | ₹5,000 est. · 22 min |
| **Mortuary / Freezer** | Deceased transport | ₹2,000 est. · 15 min |
| **Air Ambulance** | Inter-city critical | Quote on call |

Below: **"Not sure? Tap here — we'll pick"** → sends BLS + flags dispatcher to upgrade after driver's first visual assessment. Auto-upgrade is charged at the ALS rate only with recorded customer consent (in-app or IVR-recorded).

Add-ons row: Oxygen · Paramedic ₹800 · Doctor ₹2,500 · Stretcher bearer ₹300 · CPR-trained EMT.

### 4.5 Fare transparency screen — your competitive weapon

```
┌─────────────────────────────────┐
│  Estimated fare        ₹1,480   │
│  ─────────────────────────────  │
│  Base (up to 10 km)      ₹1,000 │
│  Distance 4.2 km × ₹30     ₹126 │
│  Oxygen support            ₹200 │
│  Night charge (10pm-6am)   ₹154 │
│  ─────────────────────────────  │
│  Waiting (if any)               │
│   • First 10 min at pickup  FREE│
│   • After that          ₹5/min  │
│   • Traffic waiting     ₹3/min  │
│  ─────────────────────────────  │
│  Tolls & parking: actuals, with  │
│  photo receipt in your bill      │
│  ─────────────────────────────  │
│  ✓ NO SURGE ON EMERGENCY. EVER.  │
│  ✓ Final bill cannot exceed this │
│    estimate by more than 15%     │
│    unless route changes.         │
└─────────────────────────────────┘
```

That 15% cap is a product promise, enforced in code (Section 15.6), and it is worth more in trust than any marketing spend.

### 4.6 Live trip screens (20–29)

**20 Searching** — full-bleed map, expanding radar ring, `"Searching 12 ambulances near you…"` with a live count that actually decrements as offers go out. Timer visible. At 45s: `"Taking longer than usual — our team is calling you now"` and the control-room call fires automatically. At 90s: offer "Nearest partner vehicle at ₹X, 18 min" or "Call 108 (free govt ambulance)" — **yes, actually offer 108.** Recommending the free public option when you can't serve is the most trust-generative thing your product can do, and it costs you a trip you were going to lose anyway.

**21 Driver Assigned** — driver photo, name, badge/licence number, vehicle number in large monospace, ETA, big Call and Chat buttons, "Share live location" one-tap to WhatsApp.

**23 Verify OTP** 🟢 HAVE — 4-digit pickup OTP. Keep. Add: allow driver-side bypass with dispatcher approval when patient is unconscious and alone (logged as an exception event).

**24 Patient Onboard** — now, and only now, ask: **"Which hospital?"** with (a) nearest suitable hospitals ranked by drive time and capability, (b) hospitals with live bed availability if integrated, (c) free search. Sends a pre-arrival alert to the hospital if they're on the network.

**25 En Route** — map with vehicle, ETA to hospital, "Hospital notified ✓", inline vitals card if an EMT is aboard, `Add family to live tracking` button.

**27 Live Share** — public read-only tracking page at `savelife.health/t/<shortcode>`, no login, expires 6h after trip end. Shows vehicle position, ETA, hospital name, driver contact. This is your organic growth loop: every emergency generates 5–15 family members who see your brand at their most emotionally charged moment. Put a soft "Save SaveLife number" CTA on it. Nothing else.

**28 SOS** — persistent floating button during trip. Options: Police 112 · Call SaveLife control · Report route deviation · Share to all emergency contacts. Triggers a P0 alert on the dispatcher board.

### 4.7 Post-trip

- **30 Summary** — timeline (booked → assigned → reached → onboard → hospital), distance, duration, wait minutes with the exact clock windows shown, driver, vehicle.
- **31 Payment** — UPI, card, netbanking, cash, corporate account, insurance-cashless. Support **deferred payment** for emergencies: never gate a dying patient behind a payment screen. Bill after. Recovery rate is high; the goodwill is priceless.
- **33 Invoice** — GST-compliant PDF, downloadable, auto-emailed and WhatsApped.
- **35 Insurance Claim** — one tap generates the claim packet: invoice, trip GPS log, timestamps, vehicle registration, driver licence, medical necessity note if EMT aboard. Emails to insurer or files directly if the insurer is on the network. **This is a genuine differentiator** — ambulance reimbursement in India fails mostly on documentation.

### 4.8 Trust features to build early 🔴

- **SaveLife Verified badge** on every driver: licence verified, police verification date, training certification, vehicle fitness expiry.
- **Rate card always visible** from the hamburger menu, city-wise, before booking.
- **"Report overcharging"** as a first-class menu item, with a 24-hour resolution SLA. Publish the resolution stats.

---

## 5. Driver App — complete screen design

**Stack:** Expo (`medifleet-app`). 🟢 You have onboarding, duty toggle, trip accept/reject, navigation, device binding.

### 5.1 Screen inventory (38 screens)

```
AUTH/ONBOARD          DUTY/HOME              TRIP EXECUTION        EARNINGS
 01 Splash             09 Dashboard           16 Offer Card         28 Today
 02 Language           10 Vehicle Checklist   17 Nav to Pickup      29 Weekly Statement
 03 Login (ID+PIN)     11 Shift Start         18 Reached Pickup 🟡  30 Incentive Tracker
 04 Device Verify      12 Duty Toggle         19 Wait Timer 🟡      31 Payout History
 05 Permissions        13 Break Mode          20 Verify OTP         32 Deductions/Fines
 06 Battery Optim.     14 Heatmap             21 Patient Onboard
 07 Terms              15 Notifications       22 Nav to Drop        SUPPORT/PROFILE
 08 Profile Check                             23 Reached Hospital   33 Profile
                       EMT MODE               24 Handover           34 Documents
 EDGE                   36 Vitals Entry       25 Collect Payment    35 Help/SOS
 37 Offline Mode        38 Care Record        26 Trip Complete
                                              27 Post-trip Cleanup
```

### 5.2 Dashboard 🟢 HAVE — refine

```
┌─────────────────────────────────┐
│  DRV-001 · KA-01-AB-1234        │
│  ┌───────────────────────────┐  │
│  │  ●━━━━━━━━━━  ON DUTY     │  │  ← slider, green
│  └───────────────────────────┘  │
│  Today  ₹3,240 · 6 trips · 112km│
│  ─────────────────────────────  │
│  [ HEATMAP — demand zones ]     │
│  ↗ Move to Jayanagar: 4 requests│
│    waiting, ~₹1,800 next 30 min │
│  ─────────────────────────────  │
│  Acceptance 92% · Rating 4.8 ★  │
│  ⚠ Fitness cert expires in 12d  │
└─────────────────────────────────┘
```

**Duty toggle must be blocked** until: vehicle checklist done, documents valid, driver not over hours-of-service limit, device bound. Show *which* condition failed with a fix path.

### 5.3 Vehicle checklist (screen 10) 🔴 NEW — build this next

Mandatory before every shift. Photo-verified, 60 seconds:

- Oxygen cylinder pressure — **photo of gauge** (later: OCR reads the needle)
- Stretcher + straps functional — tap confirm
- Suction unit, BP cuff, pulse oximeter present
- Defibrillator battery (ALS/ICU only)
- Fuel level — photo of dash
- Vehicle exterior 4-photo walkaround (damage baseline, kills 90% of damage disputes)
- Sanitisation done since last patient — timestamped

Fails → vehicle auto-marked `UNAVAILABLE`, ops alerted, driver cannot go on duty. **This is your clinical liability shield and your quality differentiator in one screen.** Hospitals will audit this. Insurers will price on it.

### 5.4 Trip offer card (16) — 20-second decision

```
┌─────────────────────────────────┐
│         NEW TRIP · 18s          │  ← countdown ring
│  🚨 EMERGENCY · BLS             │
│  ─────────────────────────────  │
│  📍 2.1 km · 6 min to pickup    │
│  Koramangala 5th Block,          │
│  near Jyoti Nivas College        │
│  ↓                              │
│  🏥 St. John's Hospital (est.)   │
│  ─────────────────────────────  │
│  You earn  ₹1,120               │  ← NET, after commission. Always.
│  ─────────────────────────────  │
│  [   ACCEPT   ]  [  Reject  ]   │
└─────────────────────────────────┘
```

Show **net earnings**, never gross. Drivers who discover the commission later churn and, worse, badmouth you in the driver network — which in the ambulance business is a small, tight, gossipy world in every city.

### 5.5 Wait-charge flow (18–19) 🟡 **YOUR CURRENT PENDING WORK**

This is what you're mid-build on. Here is the complete specification.

**States and events:**

```
NAV_TO_PICKUP
   │ driver taps [REACHED PICKUP]
   │ ├─ GUARD: GPS within 150m of pickup, else "Move closer" +
   │ │   allow override with reason + photo (rural/GPS-drift case)
   │ ├─ EVENT: reached_pickup_at = server time (NEVER device time)
   │ └─ START pickup wait clock
   ▼
AT_PICKUP  ── free 10 min ──► PICKUP_WAIT_BILLABLE (₹5/min)
   │  UI: big timer, "Free time left 07:12" → then "Waiting charge ₹35"
   │  Customer sees the SAME timer live in their app. No surprises.
   │  Auto-SMS to customer at free-time expiry.
   │ driver taps [PATIENT ONBOARD] + OTP verified
   │ └─ EVENT: patient_onboard_at → STOP pickup wait clock
   ▼
EN_ROUTE  ── traffic wait accrues automatically ──►
   │  RULE: speed < 5 km/h for ≥ 180 continuous seconds → traffic wait
   │        accrues at ₹3/min, no free allowance
   │  Guard: pause accrual if vehicle is inside a known chronic-congestion
   │        geofence during declared civic disruption (fairness override)
   │ driver taps [REACHED HOSPITAL]
   ▼
AT_DROP
   │  ONE-WAY:      free 10 min, then ₹10/min
   │  ROUND-TRIP:   free 10 min, then ₹5/min for next 120 min, ₹10/min after
   │  UI shows which slab is active and when the rate steps up.
   │ driver taps [TRIP COMPLETE] (round-trip: [START RETURN])
   ▼
COMPLETED
```

**Hard rules — implement all of these:**

1. All wait timers computed **server-side** from the event log. The app displays; the server decides. Never trust device clocks or client-side accumulation.
2. All rates read from the MongoDB `Pricing` collection. 🟢 You already enforce no-hardcoded-rates. Extend the same rule to wait tiers.
3. Wait accrual **pauses** when the app is force-closed or offline > 2 min, and resumes on reconnect with the gap logged as `disputed_window` for ops review. Prevents both driver fraud and customer complaints.
4. Cap total wait charges at **150% of base fare** by default (configurable per rate card). An unbounded meter is how ambulance operators get onto the evening news.
5. Every wait segment stored as a discrete record with start/end/rate/reason. The customer's invoice shows the actual clock times. Disputes then resolve themselves.
6. Driver cannot edit any timestamp. Ops can adjust with mandatory reason + audit entry, and the adjustment appears on the customer's invoice as a visible credit.

**Wait segment document shape:**

```json
{
  "type": "PICKUP | TRAFFIC | DROP_ONEWAY | DROP_RETURN",
  "startedAt": "2026-07-25T10:12:04.000Z",
  "endedAt":   "2026-07-25T10:31:47.000Z",
  "totalSeconds": 1183,
  "freeSeconds": 600,
  "billableSeconds": 583,
  "tiers": [ { "fromSec": 600, "toSec": 1183, "ratePerMin": 5, "amount": 48.58 } ],
  "amount": 48.58,
  "gpsStart": [77.6101, 12.9345],
  "gpsEnd":   [77.6103, 12.9346],
  "autoDetected": false,
  "adjustments": []
}
```

### 5.6 EMT mode (36–38) 🔴 NEW — the hospital-revenue unlock

When an EMT/paramedic is assigned, unlock a clinical tab:

- **Vitals** — HR, BP, SpO2, RR, temp, GCS, blood glucose, pain score. Big number-pad entry, timestamped, repeatable every 5 min.
- **Interventions** — oxygen L/min, IV line, splint, CPR start/stop, medications administered (from a controlled list, EMT scope only).
- **Patient** — name, age, sex, chief complaint, allergies, known conditions, ABHA ID if available.
- **Handover** — auto-generates a PDF/HL7-FHIR summary, transmitted to the receiving hospital **before arrival**, and shown as a signed handover screen (receiving nurse signs on the driver's device).

This record is what makes a hospital sign an exclusive contract with you, what makes an insurer accept your claim without a query, and what makes a court case defensible. It is the highest-ROI feature in this entire document.

Compliance line: EMT documentation only. No diagnosis, no treatment recommendation, ever, from software.

### 5.7 Driver retention mechanics 🔴

Drivers are your true supply constraint. Product features that matter:

- **Instant payout** — earnings withdrawable daily to UPI (small fee) instead of weekly. The single biggest driver-loyalty lever in Indian gig work.
- **Transparent deductions** — every rupee cut, itemised, with an appeal button.
- **Idle-time guarantee** — for exclusive drivers, minimum ₹X/shift regardless of trips. Ambulance demand is bursty; drivers cannot survive pure per-trip economics in low-density zones.
- **Training + certification** in-app, with a pay-grade bump on completion. Converts a cost centre into a retention mechanic and a hospital-contract selling point.
- **Fatigue guard** — hard block on duty after 12h in 24h. Non-negotiable; you are moving critical patients.

---

## 6. Admin Console — dispatch & operations

🟢 You have the CRM at `crm.savelife.health` with ringtone alerts, Live Fleet Map (Leaflet), and Assign Vehicle/Driver. This section is the target state.

### 6.1 The Dispatcher Cockpit (single screen, 3 panes)

A dispatcher must never scroll or switch tabs during an emergency. One screen, three panes, keyboard-driven.

```
┌──────────────┬─────────────────────────────┬──────────────────┐
│  QUEUE       │        LIVE MAP             │  DETAIL / ACTION │
│              │                             │                  │
│ 🔴 P0 (2)    │  Vehicle pins:              │  Trip #SL-88213  │
│ ├ #88213 0:47│   🟢 idle  🔵 to-pickup     │  Emergency · BLS │
│ └ #88220 0:12│   🟠 onboard 🔴 SOS         │  Koramangala     │
│              │   ⚫ offline                │  ─────────────── │
│ 🟠 P1 (5)    │                             │  Suggested:      │
│ 🟡 P2 (11)   │  Heatmap toggle             │  1. KA01AB1234   │
│ 🔵 Scheduled │  Hospital pins + bed status │     4min · 96 pts│
│   (34)       │  Traffic layer              │  2. KA05CD9876   │
│              │                             │     7min · 88 pts│
│ Unassigned:1 │                             │  [ASSIGN] [CALL] │
│ SLA breach:0 │                             │  [ESCALATE][NOTE]│
└──────────────┴─────────────────────────────┴──────────────────┘
  Bottom bar: Active 47 · Idle 22 · TTD p95 38s · Open complaints 3
```

**Priority tiers:**

| Tier | Definition | Dispatch SLA | Behaviour |
|---|---|---|---|
| P0 | Cardiac/trauma/unconscious/obstetric emergency | Assign < 30s | Auto-broadcast to all nearby, audible alarm, auto-escalate at 45s |
| P1 | Urgent, stable | < 60s | Sequential offers |
| P2 | Non-emergency same-day | < 5 min | Batch optimised |
| P3 | Scheduled | T-45min | Reservation engine |

**Keyboard shortcuts** (dispatchers live on the keyboard): `A` assign top suggestion, `C` call customer, `D` call driver, `E` escalate, `N` note, `/` search, `1-9` jump to queue item.

### 6.2 Admin module list

| Module | Key screens |
|---|---|
| **Dispatch** | Cockpit, Queue, Manual Assign, Reassign, Escalations, SOS board |
| **Trips** | All trips, Trip detail (full event timeline + GPS replay), Disputes, Cancellations |
| **Fleet** | Vehicles, Documents & expiry, Maintenance, Telematics, Availability calendar |
| **People** | Drivers, EMTs, Onboarding pipeline, KYC verification, Training, Fatigue monitor, Ratings |
| **Partners** | Fleet owners, Contracts, Commission slabs, Payout runs, Partner SLA scorecards |
| **Clients** | Hospitals, Corporates, Insurers, Rate contracts, Credit limits, Invoices |
| **Pricing** | Rate cards by city × vehicle × service, Wait tiers, Add-ons, Surge rules, Promo codes, **Simulator** |
| **Finance** | Ledger, Settlements, Payouts, Refunds, GST reports, Reconciliation, Aging |
| **Support** | Tickets, Complaint SLA, Overcharge reports, Refund approvals, Call recordings |
| **Quality** | Checklist compliance, Response-time analytics, Clinical audit, Incident register |
| **Analytics** | Demand heatmaps, Utilisation, Funnel, Cohorts, Channel CAC, City P&L |
| **Config** | Cities, Zones/geofences, Services, Roles, Feature flags, SMS/WhatsApp templates |
| **Audit** | Immutable event log, admin action log, break-glass register |

### 6.3 Trip detail screen — the forensic view

The most-used screen in the console after the cockpit. It must answer any dispute in under 60 seconds.

- Full state timeline with server timestamps and actor for each transition
- GPS breadcrumb replay with a scrub bar (speed, stops, deviations highlighted)
- Fare recomputation panel — shows the exact rate card version and every line item, with a "recompute now" button that diffs against what was charged
- All communications: SMS sent, calls placed (with recordings), push notifications, in-app chat
- Wait segments with the clock windows
- Photos: checklist, tolls, damage
- Actions: refund (role-limited), adjust wait, waive charge, reassign, escalate — all requiring a reason code

### 6.4 Call-centre integration 🔴 NEW — high priority for you

Your Google Ads campaign is a **call** campaign. Most of your revenue arrives by phone, not app. The console must treat the phone as a first-class booking channel:

- CTI popup (Exotel/Ola/Knowlarity) — inbound call opens a booking form pre-filled with the caller's number and prior trip history
- Agent creates the booking in the same flow the app uses (same API, same quote engine)
- Call recording attached to the trip
- **Google Ads call-conversion fires on booking creation, not call answer** — so your ad spend optimises against real bookings. This alone will meaningfully cut your cost per booking.
- AI call transcription + auto-summary into the trip notes (Section 16.1)

---

## 7. Fleet Owner Portal

Partner fleet owners are how you scale supply without capex. They are also deeply suspicious of aggregators — Ola/Uber's history poisoned that well. **Radical transparency is the product.**

### 7.1 Screens (16)

```
01 Login/OTP          06 Vehicle Detail       11 Payout Detail
02 Dashboard          07 Add Vehicle          12 Invoice/TDS
03 My Vehicles        08 Documents & Expiry   13 Performance
04 My Drivers         09 Trips                14 Contract & Rates
05 Driver Detail      10 Earnings             15 Support
                                              16 Notifications
```

### 7.2 Dashboard

```
┌────────────────────────────────────────────────┐
│  SRI VENKATESHWARA AMBULANCE SERVICE           │
│  ┌──────────┬──────────┬──────────┬─────────┐  │
│  │ 8 active │ 42 trips │ ₹68,400  │ ₹19,200 │  │
│  │ /12 vehs │ this wk  │ earned   │ next    │  │
│  │          │          │          │ payout  │  │
│  └──────────┴──────────┴──────────┴─────────┘  │
│  Payout Friday 5pm · Last: ₹58,100 ✓ (17 Jul)  │
│  ─────────────────────────────────────────────  │
│  Vehicle utilisation                            │
│   KA01AB1234  ████████░░ 78%  ₹18,400          │
│   KA05CD9876  ████░░░░░░ 41%  ₹9,100  ⚠ idle   │
│  ─────────────────────────────────────────────  │
│  ⚠ 2 documents expiring in 15 days              │
│  ⚠ KA05CD9876 acceptance rate 61% — fewer trips │
└────────────────────────────────────────────────┘
```

### 7.3 Earnings — build for a suspicious reader

Per trip, always show the complete decomposition:

```
Trip SL-88213 · 25 Jul · 14.2 km
  Customer paid                    ₹1,480
  – Platform commission (18%)      ₹  266
  – GST on commission              ₹   48
  – Toll (reimbursed)              +₹  120  (passthrough, you keep)
  ─────────────────────────────────────────
  Your earning                     ₹1,286
  Status: Settled 19 Jul · UTR 4429...  [Download]
```

Plus: downloadable statements, TDS certificates, dispute button per line, and a **payout calendar** so cash-flow planning is possible. Fleet owners churn over payment uncertainty far more than over commission rate.

### 7.4 Fairness mechanics

Publish the dispatch scoring formula (Section 14.3) to fleet owners. Show each vehicle its score and *which factor* is costing it trips. An opaque allocation algorithm is the #1 source of partner revolt in every Indian marketplace. Make yours legible.

---

## 8. Hospital Dashboard

**The revenue centre.** Hospitals generate predictable, high-margin, recurring volume: discharges, inter-facility transfers, dialysis, diagnostics shuttles, and inbound emergency pre-alerts.

### 8.1 Two distinct users, two distinct views

**A) Transport Coordinator — outbound (discharge/transfer)**

```
01 Dashboard                    ┌──────────────────────────────────────┐
02 New Transport Request        │  MANIPAL HOSPITAL — TRANSPORT DESK   │
03 Bulk/Recurring Booking       │  Pending 4 · Active 3 · Today 22     │
04 Active Transports            │  ──────────────────────────────────  │
05 Schedule Calendar            │  ⚡ QUICK: [Discharge] [Transfer]     │
06 Patient Transport History    │           [Dialysis] [Diagnostic]    │
07 Bed-release Tracker          │  ──────────────────────────────────  │
08 Contracts & Rates            │  ACTIVE                              │
09 Invoices & Statements        │  Bed 412 → Home, Jayanagar           │
10 SLA Report                   │   KA01AB1234 · arriving 6 min        │
11 Users & Permissions          │  Bed 208 → Narayana Health           │
12 Settings                     │   ICU van · en route · ETA 14 min    │
                                └──────────────────────────────────────┘
```

Key features:
- **Book in ≤ 20 seconds** — patient ID, ward/bed, destination, vehicle type, time. Pull patient name/MRN from HIS if integrated.
- **Recurring schedules** — "Mrs. Sharma, dialysis, Mon/Wed/Fri 8am, 6 months" created once. This is your steadiest revenue line and almost nobody does it well.
- **Bed-release tracker** — minutes from discharge order → bed free. Hospitals measure themselves on this. If you can show you cut it by 40 minutes, you can charge a premium and never lose the account.
- **Cost centre tagging** — bill to patient / to hospital / to insurer, decided at booking.

**B) ED Clinician — inbound (pre-arrival)**

```
┌──────────────────────────────────────────────┐
│  INCOMING — EMERGENCY DEPT                    │
│  ┌────────────────────────────────────────┐   │
│  │ ⚠ ETA 6 min · ALS · M/58               │   │
│  │ Chest pain, ? STEMI                     │   │
│  │ HR 112 · BP 90/60 · SpO2 91% · GCS 15  │   │
│  │ O2 6L, IV line, aspirin given           │   │
│  │ EMT: R. Kumar · [CALL] [ACK] [DIVERT]  │   │
│  └────────────────────────────────────────┘   │
│  ⏱ ETA 19 min · BLS · F/34 · RTA, stable      │
└──────────────────────────────────────────────┘
```

This screen, on a wall-mounted TV in the ED, is how you win hospital contracts. Cost to build: modest. Value: it changes the hospital's clinical workflow, and switching costs become enormous.

Also: **bed availability publishing** — the hospital marks ICU/ED/ward capacity, which feeds your customer app's hospital recommendation. Two-way value, and it's the beginning of a genuine network effect.

### 8.2 Hospital commercial screens

- Contract terms, negotiated rate card, SLA (response-time commitments with penalties)
- Consolidated monthly invoice, dispute individual lines
- SLA report: on-time %, avg response, cancellations, complaints — auto-generated, because hospital procurement teams demand quarterly reviews and you want that meeting to be a formality

### 8.3 Integration path

- **Phase 1:** Web dashboard, manual entry (works day one)
- **Phase 2:** CSV/SFTP batch for scheduled transports
- **Phase 3:** HL7 v2 / FHIR R4 into the HIS (`ADT^A03` discharge triggers an auto transport request)
- **Phase 4:** ABDM/ABHA-linked patient records with consent artefacts

---

## 9. Corporate, Insurance and Government dashboards

### 9.1 Corporate Dashboard

Buyers: EHS managers, HR heads, facility managers, event organisers. Products: on-site standby ambulances, employee/family emergency cover, factory/site medical response, event coverage.

**Screens (14):** Dashboard · Book Transport · Standby Requests · Sites & Locations · Employees (bulk upload) · Cover Policy · Active/History · Emergency Response Log · Compliance Reports · Drills · Invoices · Budget & Limits · Users · Settings

**What actually closes the deal:**
- **Compliance pack** — auto-generated evidence for Factories Act / OSH / BIS requirements: standby ambulance present with timestamps and photos, response drill logs, EMT certifications. HR and EHS buy *audit-readiness*, not ambulances.
- **Site geofences** — an employee triggering SOS inside a registered site auto-dispatches to the on-site standby vehicle first, then the network.
- **Policy engine** — "employees + spouse + 2 children, 4 emergency trips/year, ₹5,000 cap per trip, India-wide." Enforced at quote time.
- **Response log** — every incident on-site, with times, for the safety committee.

**Pricing:** monthly retainer (standby vehicle + crew) + per-trip beyond cover + per-head/year employee cover. Retainers are your best revenue: recurring, predictable, high margin.

### 9.2 Insurance Dashboard

Buyers: health insurers, TPAs, motor insurers (accident cover), corporate group policies.

**Screens (12):** Dashboard · Claims Queue · Claim Detail · Verification · Network Rates · Pre-auth Requests · Cashless Approvals · Fraud Flags · Analytics · Settlements · Providers · Users

**The core insight:** ambulance claims in India fail on documentation and fraud suspicion, not on policy terms. Your platform produces *machine-verifiable evidence* that no standalone ambulance operator can:

```
CLAIM SL-88213 — auto-assembled packet
  ✓ GPS trail, start to end, 1,847 points     [verified]
  ✓ Timestamps, server-side, immutable         [verified]
  ✓ Vehicle registration + fitness certificate [verified via Vahan]
  ✓ Driver licence + EMT certification         [verified]
  ✓ Distance 14.2 km — matches route           [verified]
  ✓ Fare vs network rate card                  [within contract]
  ✓ Pickup = policyholder address              [match]
  ✓ Drop = network hospital                    [match]
  ✓ EMT vitals record attached                 [medical necessity]
  ⚠ 3rd claim by this member in 90 days        [review]
  ──────────────────────────────────────────────
  FRAUD SCORE: 4/100        [APPROVE] [QUERY] [REJECT]
```

**Cashless flow:** customer selects insurance as payer → pre-auth request fires at booking → insurer auto-approves within policy limits (rules engine, sub-5-second decision) → customer pays only the excess. Cashless ambulance at the point of emergency is a genuinely novel offering in India and a very strong reason for an insurer to make you their exclusive network provider.

**Revenue:** network rate contract (volume commitment for discounted rates), per-claim processing fee, and eventually a per-member-per-month embedded cover fee.

### 9.3 Government Dashboard

Buyers: state health departments, municipal corporations, NHM, district administrations, disaster management authorities.

**Screens (10):** Public Dashboard · Coverage Map · Response Time Analytics · Fleet Registry · Incident Register · Disaster Mode · Compliance Reports · Data Exports · Audit Log · Users

**Privacy is the entire design constraint.** Government access must be:
- **Aggregated and de-identified by default** — zone-level counts, median response times, coverage gaps. No names, no phone numbers, no exact addresses.
- **Case-level access only** with a recorded legal basis, a named requesting officer, a stated purpose, an expiry, and a full audit trail. Two-person approval.
- Every access logged and reportable to the Data Protection Board under the DPDP Act 2023.

Get this wrong and you will hand over patient data on a phone call from someone claiming authority. Build the friction into the software.

**Disaster mode** — a distinct operational state: mass-casualty incident declared → all vehicles in the zone become directable by the government incident commander, normal pricing suspends to a pre-agreed emergency rate, patient tracking switches to a triage-tag model (START protocol: red/yellow/green/black), and hospital load balancing activates across the region. Building this before you need it, and demonstrating it in a drill, is how you win a state contract.

**Revenue:** PPP contracts (operate X vehicles for a district), per-trip subsidy reimbursement under state schemes, technology licensing to run the state's own 108-style fleet on MediFleet, and disaster-preparedness retainers.

---

## 10. Database schema

MongoDB (Atlas) as primary OLTP — 🟢 consistent with what you have. Postgres/ClickHouse added later for analytics (Section 18.4). Redis for hot state.

### 10.1 Collection map

```
IDENTITY & TENANCY        OPERATIONS              MONEY                 SUPPORT
 orgs                      trips                   quotes                tickets
 users                     tripEvents              rateCards             disputes
 roleAssignments           waitSegments            invoices              ratings
 devices                   dispatchOffers          payments              incidents
 sessions                  shifts                  ledgerEntries         auditLogs
 consents                  checklists              payouts               notifications
                           locationPings (TS)      commissions
 SUPPLY                    routes                  promoCodes            REFERENCE
 vehicles                  sosEvents               settlements            cities
 drivers                   clinicalRecords         creditAccounts         zones
 fleetOwners               handovers                                      services
 documents                                         B2B                    hospitals
 maintenanceLogs           CLAIMS                  contracts              geofences
                           claims                  corporatePolicies      holidays
                           preAuths                employeeCovers
```

### 10.2 Core documents

**`trips` — the spine of the system**

```js
{
  _id, tripCode: "SL-88213",            // human-readable, used in every conversation
  orgId, branchId,                       // tenant scope (null for retail B2C)
  channel: "APP|WEB|CALL|HOSPITAL|CORP|API|WHATSAPP",
  type: "EMERGENCY|SCHEDULED|TRANSFER|DISCHARGE|DIALYSIS|EVENT|MORTUARY|AIR",
  priority: "P0|P1|P2|P3",
  status: "DRAFT|SEARCHING|ASSIGNED|NAV_PICKUP|AT_PICKUP|ONBOARD|EN_ROUTE|
           AT_DROP|RETURN|COMPLETED|CANCELLED|FAILED",

  customer: { userId, name, phone, altPhone },
  patient:  { name, age, gender, condition, abhaId, allergies,
              weight, isNeonate, requiresIsolation },

  pickup:  { type:"Point", coordinates:[lng,lat], address, landmark, floor,
             liftAvailable, gateName, contactPhone, placeId },
  drop:    { type:"Point", coordinates:[lng,lat], address, hospitalId,
             department, bedNumber },
  waypoints: [],

  vehicle: { vehicleId, regNumber, category:"BLS|ALS|ICU|NEONATAL|MORTUARY|AIR" },
  crew:    { driverId, emtId, doctorId },
  fleetOwnerId,

  requirements: { oxygen, ventilator, cardiacMonitor, incubator,
                  stretcherBearers:Int, paramedic:Bool, doctor:Bool },

  scheduling: { requestedAt, scheduledFor, isRecurring, recurrenceId },

  trip: { isRoundTrip, estimatedDistanceM, actualDistanceM,
          estimatedDurationS, actualDurationS, polyline, returnPolyline },

  timeline: {                            // denormalised for fast reads; source of
    createdAt, assignedAt, acceptedAt,   // truth is tripEvents
    reachedPickupAt, patientOnboardAt,
    reachedDropAt, completedAt, cancelledAt
  },

  fare: {
    quoteId, rateCardId, rateCardVersion,
    estimated: Number, final: Number,
    breakdown: [ { code, label, amount, qty, rate, meta } ],
    waitCharges: Number, tolls: Number, addOns: Number,
    discount: Number, tax: Number,
    payer: "CUSTOMER|HOSPITAL|CORPORATE|INSURER|GOVT|SPLIT",
    splits: [ { payer, amount } ]
  },

  payment: { status, method, transactionId, paidAt, deferred:Bool, dueAt },

  dispatch: { attempts:Int, offersSent:Int, timeToDispatchMs,
              assignedBy:"AUTO|DISPATCHER", dispatcherId, reassignCount },

  cancellation: { by, reasonCode, reason, charged:Number, at },
  sla: { targetAssignSec, actualAssignSec, breached:Bool },
  rating: { customerScore, customerComment, driverScore },
  flags: { sosRaised, routeDeviation, overchargeReported, disputed },

  createdAt, updatedAt, version
}
```

**Indexes on `trips`** — these are not optional at scale:
```js
{ tripCode: 1 }                                   // unique
{ status: 1, priority: 1, "timeline.createdAt": -1 }
{ "customer.userId": 1, "timeline.createdAt": -1 }
{ orgId: 1, "timeline.createdAt": -1 }
{ "crew.driverId": 1, status: 1 }
{ "vehicle.vehicleId": 1, "timeline.createdAt": -1 }
{ pickup: "2dsphere" }
{ cityId: 1, status: 1, "timeline.createdAt": -1 }   // shard-aligned
{ "scheduling.scheduledFor": 1, status: 1 }         // reservation engine
```

**`tripEvents` — append-only, immutable. The legal record.**

```js
{
  _id, tripId, seq: Int,                  // monotonic per trip
  event: "CREATED|QUOTED|DISPATCH_STARTED|OFFER_SENT|OFFER_ACCEPTED|
          OFFER_REJECTED|OFFER_TIMEOUT|ASSIGNED|REACHED_PICKUP|
          OTP_VERIFIED|PATIENT_ONBOARD|WAIT_START|WAIT_END|
          REACHED_DROP|HANDOVER|COMPLETED|CANCELLED|SOS|
          FARE_ADJUSTED|REASSIGNED|PAYMENT_RECEIVED",
  actor: { type:"CUSTOMER|DRIVER|DISPATCHER|SYSTEM|HOSPITAL", id, name },
  at: Date,                                // SERVER time, always
  deviceAt: Date,                          // device-reported, for drift analysis
  location: { type:"Point", coordinates:[lng,lat], accuracyM },
  payload: {},
  reasonCode, note,
  ip, userAgent,
  hash: String, prevHash: String           // hash chain → tamper-evident
}
```
Index: `{ tripId:1, seq:1 }` unique, `{ event:1, at:-1 }`. **Never update or delete.** The hash chain lets you prove to an insurer, a court, or a regulator that the record was not altered.

**`vehicles`**
```js
{
  _id, orgId, fleetOwnerId, regNumber, category, make, model, year,
  capabilities: { oxygen, ventilator, defibrillator, cardiacMonitor,
                  incubator, suction, stretcherType, wheelchairAccess,
                  freezerBox, seatingCapacity },
  documents: [ { type:"RC|INSURANCE|FITNESS|PERMIT|POLLUTION|AMBULANCE_REG",
                 number, issuedAt, expiresAt, fileUrl, verified,
                 verifiedBy, verifiedAt } ],
  status: "ACTIVE|IDLE|ON_TRIP|MAINTENANCE|UNAVAILABLE|SUSPENDED",
  currentLocation: { type:"Point", coordinates:[lng,lat], heading,
                     speedKmph, updatedAt },
  homeBase: { type:"Point", coordinates:[lng,lat] },
  cityId, zoneIds: [],
  currentDriverId, currentTripId,
  telematics: { deviceId, provider, lastPingAt, fuelPct, odometerKm },
  stats: { totalTrips, avgRating, acceptanceRate, cancellationRate,
           utilisationPct, lastServiceKm },
  createdAt, updatedAt
}
```
Indexes: `{ currentLocation: "2dsphere" }`, `{ cityId:1, status:1, category:1 }`, `{ "documents.expiresAt": 1 }`, `{ fleetOwnerId:1 }`.

**`rateCards` — versioned, never mutated in place**

```js
{
  _id, name: "Bengaluru · BLS · Retail · v7",
  scope: { cityId, category:"BLS", serviceType:"EMERGENCY",
           orgId: null, contractId: null },     // null = default retail
  version: 7, effectiveFrom, effectiveTo, status:"DRAFT|ACTIVE|ARCHIVED",
  currency: "INR",

  base: {
    slabs: [ { uptoKm: 10, amount: 1000 },
             { uptoKm: 25, amount: 1800 },
             { uptoKm: 50, amount: 3000 } ],
    perKmBeyond: 30,
    minimumFare: 800
  },

  wait: {
    pickup:      { freeMin: 10, tiers:[ { fromMin:10, toMin:null, perMin:5 } ] },
    traffic:     { freeMin: 0,  tiers:[ { fromMin:0,  toMin:null, perMin:3 } ],
                   triggerSpeedKmph: 5, triggerDurationSec: 180 },
    dropOneWay:  { freeMin: 10, tiers:[ { fromMin:10, toMin:null, perMin:10 } ] },
    dropReturn:  { freeMin: 10, tiers:[ { fromMin:10, toMin:130, perMin:5 },
                                        { fromMin:130, toMin:null, perMin:10 } ] },
    capPctOfBase: 150
  },

  addOns: [ { code:"OXYGEN", label:"Oxygen support", amount:200, unit:"trip" },
            { code:"PARAMEDIC", amount:800 },
            { code:"DOCTOR", amount:2500 },
            { code:"BEARER", amount:300, unit:"per_person" },
            { code:"VENTILATOR", amount:1500 } ],

  multipliers: {
    night: { fromHour:22, toHour:6, pct:15 },
    returnTrip: { pct:80 },                    // return leg at 80% of outbound
    interCity: { perKm: 25, driverAllowance: 500 }
  },

  surge: { enabled:false, maxMultiplier:1.0, appliesTo:[] },  // OFF for emergency
  cancellation: { freeWindowMin:5, charge:500, afterOnboard:"FULL_FARE" },
  passthrough: ["TOLL","PARKING","STATE_ENTRY_TAX"],
  tax: { applicable:Boolean, ratePct:Number, hsnSac:String },  // confirm with CA
  estimateVariancePct: 15,
  createdBy, approvedBy, createdAt
}
```

**`quotes` — immutable, TTL'd**
```js
{
  _id, rateCardId, rateCardVersion, inputs: {...},
  breakdown: [...], total, currency,
  createdAt, expiresAt,        // TTL index, 15 min
  lockedTripId
}
```
A quote is generated once, shown to the customer, and referenced by the trip. The final fare is recomputed at completion but **cannot exceed quote × (1 + estimateVariancePct/100)** unless the route materially changed — and if it did, the reason is stored.

**`locationPings` — MongoDB time-series**
```js
{
  ts: Date,                                    // timeField
  meta: { vehicleId, driverId, tripId, cityId },  // metaField
  loc: [lng, lat], speedKmph, heading, accuracyM, battery, provider
}
```
`timeseries: { timeField:"ts", metaField:"meta", granularity:"seconds" }`, `expireAfterSeconds: 7776000` (90 days hot). Archive to S3/Parquet beyond that. **This collection will be 95% of your write volume** — see Section 18.3.

**`ledgerEntries` — double-entry, immutable**
```js
{
  _id, entryId, tripId, orgId,
  debitAccount, creditAccount,           // e.g. "CUSTOMER:u123" / "REVENUE:FARE"
  amount, currency, type:"FARE|COMMISSION|PAYOUT|REFUND|TAX|ADJUSTMENT|TOLL",
  reference, description, at, reversedBy, batchId
}
```
Every rupee movement is two entries. Sum of debits equals sum of credits, always, checked by a nightly job. This is how you survive a finance audit and how you stop arguing with fleet owners.

**Other notable documents**

| Collection | Key fields |
|---|---|
| `dispatchOffers` | tripId, vehicleId, driverId, score, scoreBreakdown, sentAt, respondedAt, response, etaSec |
| `waitSegments` | tripId, type, startedAt, endedAt, freeSec, billableSec, tiers[], amount, adjustments[] |
| `shifts` | driverId, vehicleId, startAt, endAt, checklistId, tripsCount, distanceKm, dutyMinutes |
| `checklists` | shiftId, items[{code, ok, photoUrl, value}], passed, failReasons[] |
| `clinicalRecords` | tripId, emtId, vitals[{at, hr, bp, spo2, rr, temp, gcs}], interventions[], meds[], notes |
| `handovers` | tripId, hospitalId, receivedBy, signatureUrl, at, fhirBundleUrl |
| `contracts` | orgId, type, rateCardId, slaTerms, creditLimit, paymentTermsDays, validFrom/To, signedDocUrl |
| `claims` | tripId, insurerId, policyNumber, memberId, status, fraudScore, docs[], decision, settledAt |
| `consents` | userId, purpose, grantedAt, expiresAt, revokedAt, artefactId (DPDP/ABDM) |
| `auditLogs` | actorId, action, resource, resourceId, before, after, at, ip, reason |

### 10.3 Schema principles

1. **Money in paise (integers).** Never floats. `1480.50` → `148050`.
2. **All timestamps UTC**, rendered in IST at the edge.
3. **Denormalise for read paths** (driver name on the trip), but keep the normalised record authoritative. Reconcile nightly.
4. **Soft delete only.** `deletedAt`. Health-adjacent data has retention obligations.
5. **`schemaVersion` on every document** so migrations can be lazy.
6. **Shard key: `{ cityId: 1, _id: 1 }`** on `trips`, `tripEvents`, `locationPings`. City is the natural partition — queries are almost always city-scoped, and it distributes evenly as you expand. Decide this before you shard; changing it later is agony.

---

## 11. Backend architecture

### 11.1 Evolution path — do not skip stages

```
STAGE 1  (today → 50k bookings/mo)     MODULAR MONOLITH
  Single Node/Express app, clean module boundaries, one MongoDB,
  Redis added, BullMQ for jobs. 🟢 This is where you are. Stay here longer
  than feels comfortable. Microservices at your current scale would be
  self-sabotage.

STAGE 2  (50k → 300k)                   EXTRACT THE HOT PATHS
  Split out: Location/Tracking service, Dispatch service, Notification
  service. Everything else stays monolithic. Redis Cluster. Read replicas.
  Move off Render to AWS Mumbai (ap-south-1) for data residency + control.

STAGE 3  (300k → 10L+)                  SERVICE MESH + CQRS
  Full decomposition, Kafka event backbone, sharded Mongo, ClickHouse
  read models, multi-AZ, regional edge.
```

### 11.2 Target architecture (Stage 3)

```
                        ┌─────────────────────┐
     Mobile / Web  ───► │  CDN + WAF (CloudFront) │
                        └──────────┬──────────┘
                                   ▼
                        ┌─────────────────────┐
                        │   API GATEWAY        │  authN/Z, rate limit,
                        │   (ALB + Kong/Envoy) │  tenant routing, versioning
                        └──────────┬──────────┘
              ┌────────────┬───────┴────┬────────────┬────────────┐
              ▼            ▼            ▼            ▼            ▼
      ┌────────────┐┌───────────┐┌───────────┐┌──────────┐┌───────────┐
      │  IDENTITY  ││  BOOKING  ││ DISPATCH  ││ TRACKING ││  PRICING  │
      │  authN,RBAC││ trip CRUD ││ matching  ││ ws + geo ││ quote,fare│
      └────────────┘└───────────┘└───────────┘└──────────┘└───────────┘
              ▼            ▼            ▼            ▼            ▼
      ┌────────────┐┌───────────┐┌───────────┐┌──────────┐┌───────────┐
      │  PAYMENTS  ││ NOTIFY    ││ CLINICAL  ││ ANALYTICS││ INTEGRATION│
      │ ledger,PG  ││ sms/push  ││ vitals,   ││ reports  ││ HIS,insurer│
      │ payouts    ││ whatsapp  ││ FHIR      ││          ││ govt, maps │
      └────────────┘└───────────┘└───────────┘└──────────┘└───────────┘
              │            │            │            │            │
              └────────────┴─────┬──────┴────────────┴────────────┘
                                 ▼
     ┌──────────────────────────────────────────────────────────────┐
     │  KAFKA / MSK  —  event backbone, all domain events           │
     └──────────────────────────────────────────────────────────────┘
                ▼                ▼               ▼             ▼
        ┌────────────┐   ┌────────────┐  ┌────────────┐ ┌───────────┐
        │ MongoDB    │   │   Redis    │  │ ClickHouse │ │ S3 + Glue │
        │ sharded    │   │  Cluster   │  │ analytics  │ │ archive   │
        │ by cityId  │   │ geo,cache, │  │ read model │ │ ML feature│
        │            │   │ locks,queue│  │            │ │ store     │
        └────────────┘   └────────────┘  └────────────┘ └───────────┘
```

### 11.3 Service responsibilities

| Service | Owns | Critical constraint |
|---|---|---|
| **Identity** | users, orgs, roles, sessions, devices, consents | Stateless, JWT + refresh, short TTL (15 min) |
| **Booking** | trips, tripEvents, state machine | **Sole writer** to trip status. All transitions go through it. |
| **Dispatch** | offers, matching, escalation | In-memory candidate cache, Redis GEO, sub-200ms decisions |
| **Tracking** | pings, WebSocket fanout, ETA | Write-optimised, eventual consistency acceptable |
| **Pricing** | rate cards, quotes, fare calc | **Pure function**, deterministic, replayable, versioned |
| **Payments** | ledger, gateway, payouts, invoices | Idempotent, double-entry, never eventually-consistent |
| **Notification** | SMS/push/WhatsApp/IVR/email | Template-driven, DLT-compliant, retry with backoff |
| **Clinical** | vitals, records, handovers, FHIR | Encrypted at rest with a separate key, strictest access control |
| **Analytics** | read models, dashboards, exports | Read-only, never blocks the transaction path |
| **Integration** | HIS, insurers, govt, Maps, telematics | Anti-corruption layer, circuit breakers on every external call |

### 11.4 The trip state machine

State transitions are the heart of correctness. Implement as an explicit machine (XState or a hand-rolled table), not scattered `if` statements.

```
DRAFT ──quote──► QUOTED ──confirm──► SEARCHING
                                        │
        ┌───────────────────────────────┤
        │ no vehicle (3 rounds)         │ offer accepted
        ▼                               ▼
     FAILED ◄─── manual escalation ─► ASSIGNED
        │                               │
        │                               ▼ driver moves
        │                          NAV_TO_PICKUP
        │                               │ reached (geo-verified)
        │                               ▼
        │                          AT_PICKUP ──(wait clock)
        │                               │ OTP verified
        │                               ▼
        │                          ONBOARD
        │                               │
        │                               ▼
        │                          EN_ROUTE ──(traffic wait)
        │                               │ reached drop
        │                               ▼
        │                          AT_DROP ──(drop wait)
        │                            │      │
        │                  one-way   │      │ round trip
        │                            ▼      ▼
        │                       COMPLETED   RETURN_LEG ──► COMPLETED
        │                            │
        ▼                            ▼
    CANCELLED ◄──────────── (allowed from any pre-ONBOARD state,
                             and post-ONBOARD only by dispatcher)
```

**Rules:** every transition emits a `tripEvent`; illegal transitions throw and alert; every transition is idempotent by `(tripId, targetState, idempotencyKey)`; a transition can only be triggered by an authorised actor type.

### 11.5 Real-time layer

- **Driver → server:** location ping every 5s on trip, 15s idle, 60s off-duty. Batched — the app buffers and sends 4 pings per request. Cuts request volume 4× at negligible latency cost.
- **Server → customer:** WebSocket (Socket.IO with Redis adapter) for trip updates; SSE fallback; push notification as the guaranteed-delivery backstop.
- **Server → driver:** FCM high-priority push for offers (wakes the app), plus WebSocket when foregrounded.
- **Presence:** Redis key `drv:{id}:online` with a 30s TTL, refreshed by pings. Absence = offline. No separate heartbeat.
- **Geospatial index:** `GEOADD city:blr:idle {lng} {lat} {vehicleId}` in Redis. `GEOSEARCH` for candidates in ~1ms vs ~40ms from Mongo. Mongo remains the durable record; Redis is the query surface.

### 11.6 Reliability patterns

| Pattern | Where |
|---|---|
| **Idempotency keys** | Every mutating API. `Idempotency-Key` header, stored 24h. Double-tap on "Confirm" in panic is *guaranteed* to happen. |
| **Circuit breakers** | Google Maps, payment gateway, SMS, HIS. Fallback: cached geocode, haversine ETA, queued SMS. |
| **Outbox pattern** | Trip state change + event publish in one Mongo transaction, relay to Kafka. Never lose an event. |
| **Saga** | Booking = quote → reserve → dispatch → confirm. Compensating actions on each failure. |
| **Graceful degradation** | If Dispatch is down, all bookings route to the manual dispatcher queue with a loud alarm. **The phone must always work.** |
| **Offline-first driver app** | Queue trip events locally, sync on reconnect, server reconciles by `deviceAt` vs `at`. Ambulances go into basements and tunnels. |

### 11.7 Security & compliance

- TLS 1.3 everywhere; mTLS between internal services
- Field-level encryption for patient name, condition, ABHA ID, vitals — separate KMS key, rotated
- **DPDP Act 2023:** consent artefacts, purpose limitation, data-principal rights (access/correction/erasure) as actual API endpoints, breach notification runbook, appointed Data Protection Officer
- **Data residency: India region only.** Non-negotiable for health data and government contracts.
- ABDM compliance if handling health records (M1/M2/M3 milestones)
- PCI-DSS scope minimised — never store card data, tokenise via the gateway
- Secrets in AWS Secrets Manager; **rotate the exposed key immediately** (see 11.8)
- RBAC enforced at the data layer; break-glass access requires two-person approval and pages the security channel
- Quarterly VAPT; annual SOC 2 Type II once you sell to insurers and large hospital chains

### 11.8 ⚠️ Immediate action item

Your Google Maps **Key 5** (`AIzaSyB8wxg...`) is exposed in `routeUtils.js` and `FreezerBoxScreen.js` in the mobile bundle. Mobile bundles are trivially extractable. Rotate it this week: create a new key, restrict it by Android package name + SHA-1 and iOS bundle ID, ship via OTA/rebuild, then delete the old key. Also set a billing quota alarm — a scraped unrestricted Maps key can generate a very large bill very quickly.

---

## 12. API surface

REST + JSON, versioned at `/v1`. GraphQL only for the console (dashboards need flexible reads). WebSocket for real-time.

**Conventions:** `Idempotency-Key` on all writes · cursor pagination (`?cursor=&limit=`) · `X-Org-Id` for tenant scope · RFC 7807 problem details for errors · all list endpoints support `?fields=` sparse fieldsets.

### 12.1 Public / Customer

```
POST   /v1/auth/otp/send                    POST   /v1/auth/otp/verify
POST   /v1/auth/refresh                     POST   /v1/auth/logout
GET    /v1/me                               PATCH  /v1/me
GET    /v1/me/medical-profile               PUT    /v1/me/medical-profile
GET    /v1/me/emergency-contacts            POST   /v1/me/emergency-contacts
GET    /v1/me/saved-places                  POST   /v1/me/saved-places

GET    /v1/services                         GET    /v1/services/:id/vehicle-types
POST   /v1/quotes                           GET    /v1/quotes/:id
GET    /v1/availability?lat=&lng=&category=

POST   /v1/trips                            # create booking
GET    /v1/trips?status=&cursor=            GET    /v1/trips/:id
POST   /v1/trips/:id/cancel                 POST   /v1/trips/:id/destination
POST   /v1/trips/:id/upgrade                POST   /v1/trips/:id/sos
GET    /v1/trips/:id/track                  POST   /v1/trips/:id/share
GET    /v1/trips/:id/invoice                POST   /v1/trips/:id/rate
POST   /v1/trips/:id/complaint              POST   /v1/trips/:id/claim

POST   /v1/payments/intent                  POST   /v1/payments/:id/confirm
GET    /v1/payments/methods                 POST   /v1/payments/webhook/:provider

GET    /v1/places/autocomplete              GET    /v1/places/details      🟢 HAVE
GET    /v1/places/reverse                   GET    /v1/places/directions   🟢 HAVE
GET    /v1/hospitals/nearby?lat=&lng=&specialty=

GET    /t/:shortcode                        # public tracking, no auth
```

### 12.2 Driver

```
POST   /v1/driver/auth/login                POST   /v1/driver/auth/device/verify
POST   /v1/driver/auth/device/unbind        GET    /v1/driver/me
POST   /v1/driver/shifts/start              POST   /v1/driver/shifts/end
POST   /v1/driver/shifts/:id/checklist      POST   /v1/driver/duty            # on/off
POST   /v1/driver/break

POST   /v1/driver/location                  # batched pings
GET    /v1/driver/offers/current            POST   /v1/driver/offers/:id/accept
POST   /v1/driver/offers/:id/reject

POST   /v1/driver/trips/:id/reached-pickup  🟡 YOUR NEXT BUILD
POST   /v1/driver/trips/:id/verify-otp      POST   /v1/driver/trips/:id/onboard
POST   /v1/driver/trips/:id/reached-drop    POST   /v1/driver/trips/:id/complete
POST   /v1/driver/trips/:id/start-return    POST   /v1/driver/trips/:id/cancel
POST   /v1/driver/trips/:id/expense         # toll/parking + photo
GET    /v1/driver/trips/:id/wait-status     🟡 live wait timer state

POST   /v1/driver/clinical/:tripId/vitals   POST   /v1/driver/clinical/:tripId/intervention
POST   /v1/driver/clinical/:tripId/handover

GET    /v1/driver/earnings?period=          GET    /v1/driver/earnings/statement/:id
POST   /v1/driver/payouts/instant           GET    /v1/driver/incentives
GET    /v1/driver/heatmap?lat=&lng=         GET    /v1/driver/documents
POST   /v1/driver/sos
```

### 12.3 Admin / Dispatch

```
GET    /v1/admin/dispatch/queue             GET    /v1/admin/dispatch/candidates/:tripId
POST   /v1/admin/dispatch/assign            POST   /v1/admin/dispatch/reassign
POST   /v1/admin/dispatch/escalate          POST   /v1/admin/dispatch/broadcast
GET    /v1/admin/fleet/live                 GET    /v1/admin/sos

GET    /v1/admin/trips                      GET    /v1/admin/trips/:id
GET    /v1/admin/trips/:id/events           GET    /v1/admin/trips/:id/replay
POST   /v1/admin/trips/:id/adjust-fare      POST   /v1/admin/trips/:id/refund
POST   /v1/admin/trips/:id/adjust-wait      POST   /v1/admin/trips/:id/note

CRUD   /v1/admin/vehicles  /drivers  /fleet-owners  /hospitals  /corporates
       /insurers  /users  /roles  /zones  /cities  /services
POST   /v1/admin/documents/:id/verify

GET    /v1/admin/rate-cards                 POST   /v1/admin/rate-cards
POST   /v1/admin/rate-cards/:id/publish     POST   /v1/admin/rate-cards/simulate
GET    /v1/admin/promo-codes                POST   /v1/admin/promo-codes

GET    /v1/admin/finance/ledger             GET    /v1/admin/finance/settlements
POST   /v1/admin/finance/payout-run         GET    /v1/admin/finance/gst-report
GET    /v1/admin/finance/aging              GET    /v1/admin/finance/reconciliation

GET    /v1/admin/analytics/kpis             GET    /v1/admin/analytics/heatmap
GET    /v1/admin/analytics/sla              GET    /v1/admin/analytics/utilisation
GET    /v1/admin/analytics/funnel           GET    /v1/admin/analytics/city-pnl
GET    /v1/admin/audit                      GET    /v1/admin/tickets
POST   /v1/admin/calls/inbound              # CTI webhook
```

### 12.4 Fleet Owner / Hospital / Corporate / Insurance / Government

```
FLEET OWNER
GET  /v1/fleet/dashboard      GET  /v1/fleet/vehicles      POST /v1/fleet/vehicles
GET  /v1/fleet/drivers        GET  /v1/fleet/trips         GET  /v1/fleet/earnings
GET  /v1/fleet/payouts        GET  /v1/fleet/documents     POST /v1/fleet/disputes
GET  /v1/fleet/performance    GET  /v1/fleet/contract

HOSPITAL
POST /v1/hospital/transports              GET  /v1/hospital/transports
POST /v1/hospital/transports/bulk         POST /v1/hospital/transports/recurring
GET  /v1/hospital/inbound                 POST /v1/hospital/inbound/:id/ack
POST /v1/hospital/inbound/:id/divert      PUT  /v1/hospital/bed-availability
GET  /v1/hospital/invoices                GET  /v1/hospital/sla-report
GET  /v1/hospital/patients/:id/transports POST /v1/hospital/hl7/adt      # HIS webhook
GET  /v1/hospital/fhir/EncounterHistory   # FHIR R4 read

CORPORATE
POST /v1/corp/bookings         GET  /v1/corp/bookings      POST /v1/corp/standby
GET  /v1/corp/sites            POST /v1/corp/employees/bulk
GET  /v1/corp/policy           PUT  /v1/corp/policy        GET  /v1/corp/budget
GET  /v1/corp/compliance-report GET /v1/corp/incidents     GET  /v1/corp/invoices

INSURANCE
GET  /v1/insurer/claims        GET  /v1/insurer/claims/:id
POST /v1/insurer/claims/:id/decision       GET  /v1/insurer/claims/:id/evidence
POST /v1/insurer/preauth       POST /v1/insurer/preauth/:id/decision
GET  /v1/insurer/network-rates PUT  /v1/insurer/network-rates
GET  /v1/insurer/fraud-flags   GET  /v1/insurer/analytics  GET /v1/insurer/settlements

GOVERNMENT
GET  /v1/govt/coverage         GET  /v1/govt/response-times
GET  /v1/govt/fleet-registry   GET  /v1/govt/incidents      # aggregated only
POST /v1/govt/disaster/declare POST /v1/govt/disaster/direct
GET  /v1/govt/reports/:type    POST /v1/govt/case-access    # requires legal basis
GET  /v1/govt/audit
```

### 12.5 WebSocket channels

```
customer:trip:{tripId}    → status, driver location, eta, fare_update, wait_timer
driver:{driverId}         → offer, trip_update, cancellation, broadcast, ops_message
dispatch:city:{cityId}    → new_booking, sla_warning, sos, vehicle_status, unassigned
hospital:{hospitalId}     → inbound_alert, eta_update, vitals_update, arrival
fleet:{fleetOwnerId}      → vehicle_status, trip_completed, payout_processed
```

---

## 13. Roles & permissions

### 13.1 Model

**RBAC + ABAC hybrid.** Roles grant permissions; attributes (tenant, city, own-record, time window) constrain scope. Permission format: `resource:action:scope`.

```
trip:read:own      trip:read:org      trip:read:city      trip:read:all
trip:create        trip:cancel:own    trip:cancel:any     trip:assign
fare:adjust:limit  fare:adjust:any    refund:approve:5000 refund:approve:any
pii:view:masked    pii:view:full      pii:export
clinical:read      clinical:write     clinical:export
payout:view        payout:execute     ratecard:read       ratecard:publish
audit:read         breakglass:invoke
```

### 13.2 Permission matrix (abridged)

| Permission | cust | driver | emt | fleet_own | dispatch | ops_mgr | finance | support | hosp_coord | hosp_clin | corp_adm | insurer | govt | plat_adm |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| trip:create | ✓ | – | – | – | ✓ | ✓ | – | ✓ | ✓ | – | ✓ | – | – | ✓ |
| trip:read | own | assigned | assigned | org | city | all | all | all | org | org‑inb | org | claims | agg | all |
| trip:assign | – | – | – | – | ✓ | ✓ | – | – | – | – | – | – | – | ✓ |
| trip:cancel | own | – | – | – | ✓ | ✓ | – | – | own | – | own | – | – | ✓ |
| fare:adjust | – | – | – | – | – | ≤2k | ✓ | – | – | – | – | – | – | ✓ |
| refund:approve | – | – | – | – | – | ≤5k | ✓ | – | – | – | – | – | – | ✓ |
| pii:view | own | trip‑only | trip‑only | masked | full | full | masked | masked | own‑pts | own‑pts | masked | claim | **masked** | full |
| clinical:read | own | – | ✓ | – | – | ✓ | – | – | own‑pts | ✓ | – | claim | – | ✓ |
| clinical:write | – | – | ✓ | – | – | – | – | – | – | – | – | – | – | – |
| payout:execute | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – |
| ratecard:publish | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| location:live | own trip | own | own | own veh | city | all | – | trip | own trip | inbound | own sites | – | agg | all |
| audit:read | – | – | – | own | – | ✓ | ✓ | – | own | – | own | own | ✓ | ✓ |
| data:export | own | – | – | own | – | ✓ | ✓ | – | own | – | own | own | agg | ✓ |

### 13.3 Hard guardrails

1. **Government sees aggregates only.** Case-level requires `govt_auditor` + recorded legal basis + expiry + 2-person approval, all logged.
2. **Driver PII access is trip-scoped and time-bounded** — customer phone visible from assignment until 2 hours after completion, then masked. Prevents post-trip harassment, which is a real and serious risk.
3. **Clinical data** is the most restricted class. Only EMT (write), treating clinician (read), patient (read own), and insurer (read for a specific claim, with consent).
4. **Break-glass** for a super_admin: time-boxed to 60 minutes, requires a second approver, pages the security channel, and generates a mandatory post-hoc review ticket.
5. **No one can edit a `tripEvent`.** Not even super_admin. Corrections are new compensating events.
6. **Separation of duties:** whoever creates a payout batch cannot approve it.

---

## 14. Dispatch engine

The dispatch engine is the product. Everything else is packaging.

### 14.1 Design goals

| Goal | Target |
|---|---|
| Time to dispatch (P0), p50 / p95 | 18s / 45s |
| Offer acceptance rate | > 85% |
| Reassignment rate | < 5% |
| Unserved rate (P0) | < 1% |
| Dead-mileage per trip | < 3.5 km |
| Decision latency (server-side) | < 200 ms |

### 14.2 Pipeline

```
BOOKING CONFIRMED
      │
      ▼
[1] PRE-WARM ─ fired at TAP 1, before the customer even confirms.
      Candidate set is already computed and cached by the time
      "Confirm" is pressed. Saves 2–4 seconds. Free latency.
      │
      ▼
[2] CANDIDATE FETCH ─ Redis GEOSEARCH
      GEOSEARCH city:blr:idle FROMLONLAT lng lat BYRADIUS 3 km ASC COUNT 40
      Radius ladder: 3 → 5 → 10 → 20 → 40 km (inter-city)
      │
      ▼
[3] HARD FILTERS  (binary — fail = excluded, no scoring)
      ✗ vehicle category < required category
      ✗ missing mandatory equipment (ventilator, incubator, freezer)
      ✗ driver off-duty / on another trip / on break
      ✗ documents expired (RC, fitness, insurance, permit)
      ✗ checklist not passed for current shift
      ✗ driver hours-of-service exceeded
      ✗ fleet owner suspended or over credit limit
      ✗ vehicle in maintenance
      ✗ previously rejected/timed-out this same trip
      ✗ customer or driver on mutual block list
      │
      ▼
[4] SCORE  (see 14.3)
      │
      ▼
[5] OFFER STRATEGY
      P0: broadcast to top 5 simultaneously, first-accept wins
      P1: sequential, top-scored first, 20s timeout each
      P2: sequential, 30s timeout, batch-optimised across pending trips
      P3: reservation engine, assigned at T-45min
      │
      ▼
[6] ESCALATION LADDER
      T+20s  → next candidate / next batch
      T+45s  → widen radius one step + auto-call the customer from control room
      T+75s  → alert dispatcher board (audible P0 alarm) + broadcast city-wide
      T+120s → partner-network API (other operators) + offer customer 108 option
      T+180s → mark AT_RISK, ops manager paged, customer called by a human
      │
      ▼
ASSIGNED → tripEvent → push to driver → WebSocket to customer → SMS to customer
```

### 14.3 Scoring function

```js
score = 100
      - (etaSeconds / 6)                    // 6 min ETA costs 60 pts — ETA dominates
      + (acceptanceRate       * 12)         // 0–1 → 0–12
      + (rating / 5           * 8)          // 0–8
      + equipmentFitBonus                   // exact match +8, over-spec +2, none 0
      + fleetPriorityBonus                  // SLA-tier partner: 0 / 4 / 8
      + (idleMinutes.clamp(0,30) / 30 * 6)  // fairness: longest-idle gets a boost
      + returnTripBonus                     // vehicle heading toward pickup: +10
      - (cancellationRate     * 15)         // penalty
      - (recentComplaints     * 5)
      - homeBaseDriftPenalty                // discourages stranding vehicles far out

FINAL = score, tie-break by idleMinutes DESC (fairness), then vehicleId
```

**Why ETA dominates:** in emergency, a 4-minute vehicle with a 4.2 rating beats a 9-minute vehicle with a 4.9 rating, every single time. Do not let quality metrics outweigh time. The fairness and quality terms exist to break ties and to shape long-run supply behaviour, not to override physics.

**Publish this formula to fleet owners** (Section 7.4). Transparency here prevents the partner revolt that has damaged every Indian marketplace at scale.

### 14.4 ETA computation — the cost trap

Naive: call Google Distance Matrix for each of 40 candidates × 33,000 bookings/day = 13.2 M calls/day. That is financially impossible (Section 18.5).

Correct approach, in order:

1. **Haversine pre-rank** — cheap, sorts candidates, eliminates the obvious losers. Cost: zero.
2. **Self-hosted OSRM** with OpenStreetMap India data + a live traffic-factor layer derived from *your own* historical ping data — you have thousands of vehicles producing real speed data on real roads. This is a genuine long-term asset. Cost: one EC2 instance.
3. **Google Distance Matrix only for the final top-3**, and only for P0/P1. Cost: ~3 calls per booking instead of 40.
4. **Cache aggressively:** road-segment speeds by (zone-pair × hour-of-week), 15-minute TTL on live conditions.

Your own historical trip data will beat Google's ETA for ambulance-specific routing within 12 months, because you know things Google does not: which hospital gate is usable at 2 a.m., where the ambulance ramp is, which lane the ED entrance needs.

### 14.5 Scheduled / reservation engine

Different problem entirely — this is bin-packing, not matching.

- Bookings accepted up to 30 days out; capacity checked against a per-city, per-category calendar with a configurable overbooking factor (1.15 typical, tuned by observed cancellation rate).
- **Chaining:** a discharge at 10:00 in Whitefield and a dialysis pickup at 11:30 in Marathahalli should go to the same vehicle. Solve as a vehicle-routing problem with time windows, re-run every 15 minutes for the next 4-hour horizon. Greedy insertion heuristic is enough; do not build an OR-solver until volume justifies it.
- **Assignment at T-45min**, driver notified at T-30min, auto-reassign if the driver's current trip will overrun.
- **Recurring series** (dialysis Mon/Wed/Fri): generate instances 14 days ahead, pre-assign the same driver where possible — patients with chronic conditions strongly prefer a familiar driver, and it measurably reduces cancellations.
- Emergency always pre-empts scheduled. When a P0 steals a scheduled vehicle, the system auto-reassigns the scheduled trip *and* proactively SMSes the scheduled patient before they notice. Handling pre-emption gracefully is what separates a professional operation from a chaotic one.

### 14.6 Edge cases you must handle explicitly

| Case | Handling |
|---|---|
| Driver accepts but doesn't move (>3 min, <100 m) | Auto-nudge push → dispatcher alert at 5 min → force reassign, acceptance-rate penalty |
| Driver GPS lost mid-trip | Last-known + dead reckoning from speed/heading; alert at 90s; customer sees "reconnecting", not a frozen dot |
| Customer books multiple times in panic | Dedupe by (phone, pickup within 200 m, 5-min window) → merge, don't dispatch twice |
| Wrong vehicle type dispatched | In-trip upgrade flow with recorded consent and fare delta; ops can dispatch a second vehicle |
| Patient deceased on scene | Special state; converts to mortuary transport; police/legal workflow triggered; **fare rules differ** |
| Hospital refuses admission | Divert flow: dispatcher finds an alternate, wait clock pauses, no charge to the customer for the diversion |
| Fake GPS / mock location | Detect via `isFromMockProvider`, impossible-speed checks, and cell-tower cross-check; auto-suspend |
| Two ambulances at one accident | Multi-patient incident: one `incidentId`, multiple trips, coordinated dispatch |
| Inter-city, driver outside home zone | Return-empty allowance built into pricing; dispatch biases the return leg toward the home base |
| Monsoon/flood/road closure | Zone-level dispatch suspension with a broadcast to affected customers |

---

## 15. Pricing engine

### 15.1 Architecture

A **pure, deterministic, versioned function**. Same inputs + same rate card version = same output, forever. This is what lets you replay any historical fare in a dispute and prove the number was correct.

```
computeFare(input, rateCard) → { total, breakdown[], rateCardVersion, hash }

input = { category, serviceType, distanceM, durationS, waitSegments[],
          addOns[], scheduledAt, isRoundTrip, tolls[], promoCode,
          payer, contractId, cityId }
```

Never call an external service inside it. Never read the clock inside it — time is an input.

### 15.2 Rate card resolution order

First match wins:

```
1. Trip-specific override (dispatcher, with reason)        [rare, audited]
2. Corporate/insurer contract rate card (contractId)
3. Hospital contract rate card
4. City × category × service-type card
5. City × category default
6. National fallback card
```

### 15.3 Computation pipeline

```
 1. BASE          slab lookup by distance → base amount
 2. DISTANCE      max(0, distanceKm − lastSlabKm) × perKmBeyond
 3. WAIT          Σ waitSegments, tiered, capped at capPctOfBase
 4. ADD-ONS       oxygen, ventilator, paramedic, doctor, bearers
 5. MULTIPLIERS   night %, return-trip %, inter-city per-km + allowance
 6. SURGE         ONLY if serviceType ∈ surge.appliesTo   (never EMERGENCY)
 7. SUBTOTAL
 8. DISCOUNT      promo, corporate negotiated %, loyalty
 9. PASSTHROUGH   tolls, parking, state entry tax (at actuals, receipt required)
10. TAX           as applicable — see 15.7
11. ROUNDING      to nearest ₹10, always DOWN (customer-favourable)
12. GUARDS        minimumFare floor; variance cap vs quote; wait cap
```

### 15.4 Worked example

```
Emergency BLS · Bengaluru · 14.2 km · 22:40 · oxygen · pickup wait 19m43s

 1. Base (slab: up to 10 km)                      ₹1,000
 2. Distance 4.2 km × ₹30                         ₹  126
 3. Wait — pickup: 19m43s, free 10m,
           billable 9m43s (583s) × ₹5/min         ₹   49
 4. Add-on: Oxygen                                ₹  200
 5. Night multiplier 15% on (base+distance)       ₹  169
 6. Surge — N/A (emergency, never)                ₹    0
    ─────────────────────────────────────────────────────
    Subtotal                                      ₹1,544
 8. Discount                                      ₹    0
 9. Toll (receipt #4471, photo attached)          ₹  120
10. Tax — as applicable per 15.7                  ₹    0
11. Rounded down to nearest ₹10                   ₹1,660
    ─────────────────────────────────────────────────────
    Quote was ₹1,480 · variance +12.2% · within 15% cap ✓
```

### 15.5 Surge policy — write this into the code, not just the FAQ

```js
surge.appliesTo = ["SCHEDULED_NON_EMERGENCY", "EVENT_STANDBY", "INTERCITY_PLANNED"]
// EMERGENCY, TRANSFER, DISCHARGE, MORTUARY are permanently excluded.
maxMultiplier = 1.4
// Hard-blocked entirely during any declared disaster/disease outbreak in the zone.
```

"No surge on emergencies, ever" is simultaneously an ethical stance, a regulatory shield, a marketing line, and a genuine competitive moat — because your competitors *cannot* copy it without gutting their peak economics. Put it on the home screen, on the invoice, and in every ad.

### 15.6 Fare guards (enforced in code)

| Guard | Rule |
|---|---|
| Variance cap | Final ≤ quote × 1.15, unless `routeChanged` or `serviceUpgraded` with a recorded consent event. Overage above the cap is auto-waived. |
| Wait cap | Total wait charges ≤ 150% of base fare. |
| Minimum fare | Applied after all discounts, before passthroughs. |
| Passthrough proof | Toll/parking require a photo receipt or they don't bill. |
| Cancellation | Free < 5 min; ₹500 after; full fare after patient onboard; **₹0 always if SaveLife cancels or fails to arrive**. 🟢 you have this rule |
| Zero-rate guard | A computed fare of ₹0 or a negative fare throws and pages ops. Never silently bill zero. |
| Reconciliation | Nightly job recomputes yesterday's fares from the event log. Any mismatch > ₹1 raises a ticket. |

### 15.7 Tax treatment ⚠️

Ambulance services in India have historically been treated under the healthcare-services exemption for GST, but the treatment varies by service type — a non-emergency patient transfer, a corporate standby retainer, a mortuary transport, and a technology-platform commission are **not** all the same thing, and platform commission is separately taxable in most readings.

**Action:** get a written opinion from your CA covering each revenue line separately, and encode the outcome in the rate card's `tax` block per service type. Do not guess. Do not let me guess for you. Getting this wrong across 10 lakh monthly invoices creates a liability that compounds silently for years.

### 15.8 B2B and settlement

**Contract rate card types:** flat per-trip · distance slab · monthly retainer + per-trip · per-bed-per-month (hospital) · per-employee-per-year (corporate) · per-member-per-month (insurer).

**Settlement split example — ₹1,660 trip on a partner vehicle:**

```
Customer pays                          ₹1,660
  Toll passthrough → fleet owner       ₹  120
  Net fare                             ₹1,540
    Platform commission 18%            ₹  277
    GST on commission (as advised)     ₹   50
    Fleet owner receives               ₹1,213
Settlement: T+3 days, weekly batch, UTR on the statement, TDS 194-O applied.
```

Own-fleet trips: full fare to SaveLife, driver paid a salary + per-trip incentive. Track own-fleet and partner-fleet contribution margins separately — they are completely different businesses wearing the same uniform, and blending them in your P&L will hide the truth from you for years.

### 15.9 Pricing simulator (admin tool) 🔴

Before publishing any rate card version, run it against the last 30 days of real trips:

```
Rate card v8 vs v7, simulated on 41,203 trips
  Revenue                  +₹18.4 L (+7.2%)
  Avg fare        ₹1,204 → ₹1,291
  Trips >₹3,000    2.1%  →   3.8%   ⚠ complaint risk
  Trips <min fare   340   →    12
  Wait-charge share 4.1%  →   6.9%  ⚠ driver-gaming risk
  Fleet owner earnings    −2.1%     ⚠ partner churn risk
                                    [PUBLISH] [EDIT] [DISCARD]
```

Nobody publishes a price change blind after this exists. Build it before your third city.

---

## 16. AI features

**The governing rule, restated:** AI in this platform is *operational*, never *clinical*. It routes, predicts, transcribes, and flags. It does not diagnose, does not recommend treatment, and does not make a decision that affects patient care without a licensed human in the loop. Every AI output that touches clinical context carries a visible label and a named human reviewer. This line is what keeps you out of court and inside the regulations.

### 16.1 Tier 1 — build in the next 6 months (high value, low risk)

**1. Voice booking agent (IVR) 🔴 — your highest-ROI AI feature**
Your acquisition is a *call* campaign. At 3 a.m., when 12 calls land simultaneously, a human control room drops calls and you lose trips you already paid Google for. An LLM voice agent in Kannada/Hindi/English/Tamil/Telugu that: greets, captures location (with a fallback SMS live-location link), captures the patient's condition in the caller's own words, confirms the vehicle type, creates the booking, and **hands off to a human the instant it detects distress it can't handle**. Target: handle 60% of calls end-to-end, escalate 40%. Measured on abandoned-call rate, not on containment.

**2. Call transcription + auto-summary 🔴**
Every inbound call transcribed, summarised into the trip notes, and mined weekly for demand patterns, complaint themes, and lost-deal reasons. Cheap to build, immediately useful, and it makes your dispatchers 30% faster.

**3. ETA prediction model 🔴**
Gradient-boosted model on your own ping history: features = origin/destination zone, hour-of-week, weather, vehicle category, driver historical speed, road-segment congestion. Beats naive Maps ETA for ambulance routing within ~6 months of data. Directly improves both your dispatch scoring and your customer-facing ETA accuracy, which is the single largest driver of trust during the wait.

**4. Demand forecasting + fleet repositioning 🔴**
Predict bookings per zone per 30-minute bucket. Feed the driver heatmap. Reduces dead mileage and time-to-pickup simultaneously. Signals worth including: hour, day, weather, local events, festival calendar, hospital OPD schedules, historical accident hotspots.

**5. Document OCR + verification 🔴**
Driver licence, RC, insurance, fitness certificate → extract fields, check expiry, cross-verify against Vahan/Sarathi. Onboarding drops from 3 days to 20 minutes. At 5,000 vehicles this saves an entire back-office team.

**6. Fraud & anomaly detection 🔴**
Route deviation, impossible speeds, mock GPS, wait-charge gaming (drivers idling to accrue), duplicate bookings, unusual cancellation patterns, collusion between a driver and a repeat customer. Flags to ops, never auto-punishes without human review.

### 16.2 Tier 2 — months 6–18

**7. Symptom-to-vehicle-category assistant** — customer describes the situation in natural language ("my father is breathing heavily and his lips look blue") → recommends ALS with oxygen. Framed strictly as *"which vehicle to send"*, never as *"what is wrong with the patient."* Always over-provisions on ambiguity (recommends the higher category), always shows "Not sure? We'll send our best-equipped nearby vehicle." Every recommendation logged and audited against actual outcome.

**8. Hospital matching** — rank destination hospitals by drive time × capability × live bed availability × the patient's insurance network × prior admission history. Enormous clinical value; requires hospital integration to be real.

**9. Clinical handover summarisation** — turn the EMT's vitals log and notes into a structured pre-arrival summary for the ED. Human EMT signs it before transmission. Never auto-sent.

**10. Dynamic incentive optimisation** — compute the minimum driver incentive that closes each predicted supply gap, per zone per hour.

**11. Predictive maintenance** — telematics + odometer + fault codes → schedule service before a breakdown. An ambulance failing mid-transport is a clinical incident, not an inconvenience.

**12. Complaint triage & auto-resolution** — classify, route, and auto-resolve clear-cut overcharge complaints by recomputing the fare and issuing an instant refund. Turns your biggest reputational risk into a trust-building moment.

### 16.3 Tier 3 — later, and only with clinical governance

**13. Video triage assist** — customer's camera streamed to a remote doctor during the wait. High value, heavy regulatory load (telemedicine guidelines), requires licensed clinicians on staff.
**14. Outcome analytics** — correlate response time with clinical outcome, in partnership with hospitals, under ethics approval. Publishable research, and it is how you eventually justify premium pricing on evidence.
**15. Automated insurance adjudication** — auto-approve claims below a threshold with a fraud score under a limit.

### 16.4 What NOT to build

- ❌ AI that decides whether someone needs an ambulance
- ❌ AI that triages medical urgency without clinician oversight
- ❌ AI that talks to a patient about their condition
- ❌ AI-driven surge pricing on emergencies
- ❌ Fully autonomous complaint rejection

### 16.5 AI infrastructure

Start with hosted LLM APIs (no training, no GPUs, no ML team). Use retrieval over your own SOPs, rate cards, and hospital directory. Add small self-hosted models only for the high-volume, low-complexity paths (transcription, OCR) once unit cost justifies it. Keep a strict evaluation harness: every AI feature has a labelled test set and a weekly regression run before any prompt or model change ships. Log every AI input/output with the trip ID for audit.

---

## 17. Revenue model

### 17.1 Streams

| # | Stream | Model | Margin | Predictability | Priority |
|---|---|---|---|---|---|
| 1 | **B2C emergency** | Per trip, own fleet | 35–45% | Low | Brand engine |
| 2 | **B2C emergency** | Commission on partner fleet, 15–22% | 85%+ | Low | Scale lever |
| 3 | **Hospital contracts** | Retainer + per trip | 30–40% | **High** | 🥇 Core |
| 4 | **Non-emergency recurring** (dialysis, chemo, physio) | Per trip, subscription packs | 40–50% | **High** | 🥇 Core |
| 5 | **Corporate standby & cover** | Monthly retainer + per head/yr | 50–60% | **High** | 🥈 |
| 6 | **Insurance network** | Network rates + per-claim fee + PMPM | 60%+ | Medium | 🥈 |
| 7 | **Event medical cover** | Per event/day | 55% | Seasonal | Opportunistic |
| 8 | **Air ambulance brokerage** | Margin on charter, ₹1–3 L/trip | 15–25% | Low | High ticket |
| 9 | **Mortuary & repatriation** | Per trip, incl. international | 40% | Low | Niche, high margin |
| 10 | **SaveLife Shield subscription** | ₹999–2,499/family/yr | 70% at low utilisation | **High** | 🥈 Retention fix |
| 11 | **MediFleet SaaS licensing** | ₹X per vehicle/month to other operators & state fleets | **80%+** | **Very high** | 🥇 **The real prize** |
| 12 | **Government PPP** | Per-vehicle contract + subsidy reimbursement | 25–35% | **Very high** | Scale unlock |
| 13 | **Medical equipment rental** (adjacent) | Oxygen concentrators, hospital beds at home | 45% | Medium | Natural extension |

### 17.2 Why stream 11 may be worth more than 1–10 combined

You are building an ambulance operating system that will, by necessity, be better than anything the ~3,000 small ambulance operators across India can build for themselves. Every one of them needs dispatch, tracking, billing, driver management, and compliance. None will build it. Most state 108 systems run on aging software.

At even ₹1,500/vehicle/month across 20,000 vehicles, that's ₹3 Cr/month at ~85% margin, with no fuel, no drivers, no clinical liability, and no capex. It is a fundamentally better business than moving patients — and it is only credible *because* you move patients yourself.

**Sequencing:** operate first (2026–2028) → productise (2028) → license (2029+). Do not attempt to license before your own operation proves the software at scale. The operating business is the proof; the SaaS is the profit.

### 17.3 Unit economics — B2C emergency, own fleet (illustrative)

```
Revenue per trip                                  ₹1,660
  Fuel (14 km + 8 km deadhead @ ₹8/km)            ₹  176
  Driver cost (allocated, ₹28k/mo ÷ 180 trips)    ₹  156
  EMT cost (when deployed, 40% of trips)          ₹  120
  Vehicle depreciation + insurance + maintenance  ₹  190
  Consumables (oxygen, sanitisation, disposables) ₹   85
  Payment gateway + SMS + Maps                    ₹   38
  ─────────────────────────────────────────────────────
  Contribution margin                             ₹  895  (54%)
  Allocated fixed (control room, ops, tech)       ₹  420
  ─────────────────────────────────────────────────────
  Trip-level profit                               ₹  475  (29%)

CAC (Google Ads, ~₹380/call × ~2.4 calls per booking) ≈ ₹910
→ First trip is roughly break-even. Repeat rate on B2C emergency ≈ 4%.
→ THEREFORE: B2C paid acquisition does not compound. It buys brand and density.
   Profit lives in streams 3, 4, 5, 6, 11.
```

That last line is the most important sentence in this section. Read it again before your next ad-budget increase.

### 17.4 Revenue at 10 lakh bookings/month (illustrative model)

| Stream | Volume/mo | Avg net revenue | Monthly net revenue |
|---|---|---|---|
| Emergency B2C (own + partner) | 1,50,000 | ₹400 | ₹6.0 Cr |
| Hospital discharge/transfer | 4,50,000 | ₹200 | ₹9.0 Cr |
| Recurring non-emergency | 2,50,000 | ₹150 | ₹3.75 Cr |
| Corporate standby + cover | 50,000 + retainers | — | ₹2.0 Cr |
| Insurance claim fees + PMPM | 2,00,000 claims | ₹100 | ₹2.0 Cr |
| Air ambulance | 500 | ₹1.8 L | ₹0.9 Cr |
| Subscriptions | 3,00,000 members | ₹100/mo | ₹3.0 Cr |
| SaaS licensing | 20,000 vehicles | ₹1,500 | ₹3.0 Cr |
| **Total net revenue** | | | **≈ ₹29.6 Cr/month** |
| | | | **≈ ₹355 Cr/year** |
| GMV | | | **≈ ₹110 Cr/month** |

*Assumptions are illustrative and must be re-derived from your actual city-level data. The mix matters far more than the total: note that emergency is 15% of volume and 20% of revenue, while hospital + recurring is 70% of volume. **Build for the 70%.***

### 17.5 The reality check on 10 lakh/month

At ~200 trips per vehicle per month, 10 lakh bookings requires roughly **5,000 active vehicles**. India's entire organised ambulance fleet is a low five-figure number. So 10 lakh/month means:

1. You are the dominant national platform, not a Bengaluru operator.
2. The overwhelming majority of vehicles are **partner-owned, not yours** — asset-light aggregation is not a preference, it is the only arithmetic that works.
3. A large share of volume is **non-emergency patient transport**, which can use lower-cost vehicles (patient transport vehicles, wheelchair vans) rather than full BLS/ALS ambulances.
4. You are operating in 40+ cities, which means **the console, the rate-card engine, and the tenancy model must be multi-city from day one** — retrofitting them is the migration that kills companies at exactly this stage.

Plan the software for it now. Build the business toward it in stages.

---

## 18. Scaling plan — 10 lakh bookings/month

### 18.1 Load math

```
10,00,000 bookings/month
  = 33,300/day
  = 1,390/hour average
  = ~3,500/hour peak (2.5× factor)
  = ~1 booking/second at peak

Concurrent active trips at peak       ≈ 2,000
Active vehicles at peak               ≈ 5,000
Location pings (5s interval)          ≈ 1,000/sec  → 250 req/s batched 4×
Pings/day                             ≈ 57 million  (~7 GB/day compressed)
Concurrent WebSocket connections      ≈ 36,000
Dispatch decisions                    ≈ 1/sec, each scoring ~40 candidates
Dashboard/API reads                   ≈ 8,000 req/s peak
Notifications (SMS+push+WhatsApp)     ≈ 400,000/day
```

**The load profile is not "high traffic" — it is "moderate traffic with hard latency floors and zero tolerance for data loss."** That distinction should drive every infrastructure decision. You do not need Netflix-scale architecture. You need boring, redundant, observable systems.

### 18.2 Phased infrastructure

| Phase | Bookings/mo | Infrastructure | Team |
|---|---|---|---|
| **P0 — now** | < 5k | Render + Atlas M10 + Vercel 🟢 | You + 1–2 |
| **P1** | 5k–50k | Add Redis, BullMQ, Atlas M30, staging env, monitoring, CI/CD, on-call | 4–6 eng, 6 dispatchers |
| **P2** | 50k–3L | **Move to AWS ap-south-1.** EKS, ALB, Atlas M60 + read replicas, Redis Cluster, extract Tracking + Dispatch + Notification services, ClickHouse, multi-AZ | 15–20 eng, 30 dispatchers, city ops pods |
| **P3** | 3L–10L | Shard Mongo by cityId, Kafka backbone, CQRS read models, regional edge, self-hosted OSRM, full SRE practice, 24×7 NOC | 60–80 eng, 120 dispatchers, 40+ city pods |

**Move off Render at P2, not before.** Render is excellent until you need VPC peering, private networking to Atlas, fine-grained autoscaling, and India data-residency guarantees for government contracts. Migrating early wastes months; migrating late causes an outage during your growth spike.

### 18.3 The location-ping problem (your #1 scaling bottleneck)

57 million writes/day will destroy a naive design. The correct architecture:

```
Driver app → batch 4 pings → POST /v1/driver/location
     ▼
[Ingest service — stateless, autoscaled]
     ├─► Redis: GEOADD (live position, overwritten)        ← dispatch reads this
     ├─► Redis Stream: fanout to WebSocket subscribers     ← customers read this
     └─► Kafka topic: location.ping
              ▼
       [Batch writer] → MongoDB time-series, 1,000-doc bulk inserts, 5s flush
              ▼
       TTL 90 days → nightly export to S3 Parquet → ML feature store
```

Rules: never write a ping synchronously to Mongo; never query Mongo for a live position; downsample archived pings to 30-second intervals; store only on-trip pings at full resolution (idle pings can be 60s).

### 18.4 Data tiering

| Tier | Store | Retention | Serves |
|---|---|---|---|
| Hot | Redis | Minutes–hours | Dispatch, live tracking, presence |
| Warm | MongoDB | 90 days | App queries, trip detail, disputes |
| Analytical | ClickHouse | 3 years | Dashboards, SLA reports, city P&L |
| Cold | S3 Parquet | 7 years (legal) | Audit, ML training, regulator requests |

Dashboards must **never** query the OLTP database. Every dashboard read goes to ClickHouse, populated from the Kafka event stream. This one rule prevents the classic failure where a fleet owner running a year-long report takes down live dispatch.

### 18.5 ⚠️ Google Maps cost — the line item that will surprise you

At 10 lakh bookings/month with a naive implementation:

```
Autocomplete sessions   1.0 M × ~$0.017   ≈ $17,000
Place Details           1.0 M × ~$0.017   ≈ $17,000
Geocoding               2.0 M × ~$0.005   ≈ $10,000
Directions              2.0 M × ~$0.005   ≈ $10,000
Distance Matrix (naive) 13.2 M/day (!!)   ≈ catastrophic
Maps JS/SDK loads       ~5 M              ≈ $35,000
────────────────────────────────────────────────────
Naive total: comfortably ₹60 L – ₹1 Cr+ / month
```

**Mitigations, in order of impact:**
1. **Self-host OSRM + OpenStreetMap India** for routing, distance and ETA. Removes the Distance Matrix and Directions lines almost entirely. One EC2 instance, updated monthly. *This is the single largest infrastructure cost saving available to you, worth crores annually.*
2. **Session tokens on Autocomplete** (you may already do this — verify). Billing is per session, not per keystroke; without tokens you pay per keystroke.
3. **Cache geocodes forever** — addresses don't move. A hospital's coordinates are looked up once, ever.
4. **Debounce autocomplete** to 400 ms and require 3+ characters.
5. **MapLibre + your own vector tiles** for the driver app and console (drivers stare at maps for 8 hours a day — that's the highest map-load volume you have, and it needs no Google features).
6. Keep Google only where its quality is genuinely irreplaceable: consumer-facing place search and complex urban navigation.

Realistic optimised cost: **₹6–10 L/month at 10 lakh bookings** (₹0.60–1.00 per booking) versus ₹60 L+ naive. Do the OSRM work at P2, before the volume arrives.

### 18.6 Infrastructure cost estimate at 10 lakh/month

| Component | Monthly (₹) |
|---|---|
| Compute (EKS, ~60 pods, ARM instances) | 8,00,000 |
| MongoDB Atlas (6 shards + replicas) | 18,00,000 |
| Redis Cluster | 3,00,000 |
| Kafka (MSK) | 3,00,000 |
| ClickHouse | 2,00,000 |
| S3 + CloudFront + data transfer | 3,00,000 |
| Maps (optimised, incl. OSRM hosting) | 8,00,000 |
| SMS/WhatsApp/IVR (MSG91 + Exotel) | 12,00,000 |
| Push, email, monitoring, logging, APM | 3,00,000 |
| LLM/AI APIs | 4,00,000 |
| Security tooling, VAPT, WAF | 2,00,000 |
| **Total** | **≈ ₹66 L/month** |
| **Per booking** | **≈ ₹6.6** |

₹6.6 per booking against ~₹300 average net revenue per booking is healthy. The risk is not the total — it is the two lines (Maps and SMS) that silently 10× if unoptimised.

### 18.7 Reliability targets

| Metric | Target |
|---|---|
| Booking API availability | 99.95% (≈22 min/month) |
| Dispatch availability | 99.99% |
| Location ingest | 99.9% (lossy-tolerant) |
| Booking p95 latency | < 800 ms |
| Dispatch decision p95 | < 200 ms |
| RTO / RPO | 15 min / 1 min |
| Data loss tolerance (trips, payments) | **Zero** |

**Degradation ladder** — define, document, and drill:
```
L1 Maps down        → cached geocodes + haversine ETA, banner shown
L2 Dispatch down    → all bookings to manual dispatcher queue, alarm
L3 Mongo primary    → automatic failover; reads from replica; writes queue 60s
L4 Full API down    → IVR-only mode; control room books on paper; SMS to
                      all on-duty drivers with a fallback number
L5 Total outage     → published fallback phone number, and the honest
                      recommendation to call 108
```
**Drill L4 and L5 quarterly.** In this business, the failure mode you didn't rehearse is the one that ends up in the newspaper.

### 18.8 Observability

Golden signals per service, plus these business-level alerts (which matter more than CPU):

- Unassigned P0 trip > 90 seconds → **page immediately**
- TTD p95 above target for 10 minutes → page
- Any trip in a state for longer than its expected maximum → alert
- Payment success rate drop > 5% → page
- Fare recompute mismatch > ₹1 → ticket
- Ledger debits ≠ credits → page finance + engineering
- Driver on-duty count drops > 20% in an hour in any city → alert ops
- Vehicle stationary > 15 min mid-trip without a wait event → alert dispatch

Distributed tracing with `tripId` as the correlation ID across every service, log, and event. One ID, entire journey.

### 18.9 Organisational scaling

| Function | At 50k/mo | At 10L/mo |
|---|---|---|
| Engineering | 6 | 60–80 (12 squads) |
| Dispatch (24×7) | 6 | 120 across 3–4 regional control rooms |
| City ops | 2 | 40+ city pods (supply + quality + partner) |
| Clinical governance | 1 part-time MD | Chief Medical Officer + 6 clinical auditors |
| Finance/reconciliation | 1 | 12 |
| Support | 3 | 60 |
| Compliance/legal | advisor | 6 (incl. DPO) |

Two hires that founders in this business consistently make too late: a **Chief Medical Officer** (clinical protocols, EMT training, hospital credibility, liability defence) and a **Head of Supply/Partner Ops** (fleet owner relationships are a full-time relationship business, not a dashboard).

---

## 19. Regulatory & compliance checklist (India)

| Area | Requirement | Notes |
|---|---|---|
| Vehicle | Ambulance registration under the Motor Vehicles Act; state transport permits | Per state; interstate transport needs national permits or state entry taxes |
| Vehicle standard | **AIS-125** ambulance construction/equipment standard (Types A–D: patient transport, BLS, ALS, ICU) | Increasingly enforced; hospitals and government tenders check it. Build the vehicle capability model around these types. |
| Establishment | Clinical Establishments Act registration where the state has adopted it | Varies by state |
| Waste | Bio-Medical Waste Management Rules, 2016 | Sharps, contaminated linen; needs a disposal contract and records |
| Drugs | Drugs & Cosmetics Act for carrying/administering medicines | ALS vehicles only, under a registered medical practitioner's oversight |
| Staff | EMT/paramedic certification; driver licence + police verification | NSQF-aligned EMT courses; keep certification records per person |
| Oxygen | PESO rules for medical oxygen cylinder handling | Storage, transport, refill records |
| Data | **DPDP Act 2023** — consent, purpose limitation, data-principal rights, breach notice, DPO | Health data is sensitive; treat every trip record as such |
| Health records | ABDM/ABHA if storing health records; EHR standards | Needed for hospital integration at scale |
| Telecom | **TRAI DLT** registration for SMS headers/templates | 🟡 This is your current MSG91 blocker — see below |
| Payments | RBI PA/PG norms; never store card data; tokenisation | Use a licensed gateway, stay out of scope |
| Tax | GST treatment per revenue line; TDS 194-O on platform payouts; e-invoicing above threshold | ⚠️ Get a written CA opinion (Section 15.7) |
| Consumer | Consumer Protection (E-Commerce) Rules — published rate card, grievance officer, response SLA | Name a Grievance Officer on the website with contact details |
| Insurance | IRDAI norms if embedding cover; act as a corporate agent or partner with a licensed entity | Don't sell insurance directly without a licence |
| Advertising | ASCI + Google healthcare-ads policy; no clinical outcome claims | Your Google Ads account is at risk from careless copy |
| Emergency interop | Coordination protocol with 108/112 | Practical necessity and excellent government-relations material |

**🟡 On your live MSG91/DLT blocker:** the 403 from MSG91 with a DLT linking error on Jio TrueConnect's side is a principal-entity-to-header linkage problem, not a code problem. Escalate in parallel rather than in series: (a) MSG91 support ticket, (b) directly on the Jio TrueConnect DLT portal — verify the header is linked to your PE ID *and* that each template is approved against that header, (c) register the same templates on a second DLT operator (Vodafone/Airtel) as a fallback, since headers registered on one operator's portal propagate but linkage errors are often operator-local. Meanwhile, ship the booking form with WhatsApp OTP or a call-back verification as a fallback rather than holding the deployment.

---

## 20. Build order — what to actually do, and when

The blueprint above is the destination. This is the road. **Do not build out of order.**

### 20.1 Next 90 days (do only these)

| # | Item | Why now |
|---|---|---|
| 1 | 🔒 **Rotate the exposed Maps Key 5**, restrict all keys, set billing alerts | Active financial and security risk |
| 2 | ✅ **Finish the wait-charge feature** — driver "Reached Pickup", server-side timers, live customer-facing timer, invoice line items (Section 5.5) | Already in flight; unblocks correct billing |
| 3 | ✅ **Unblock OTP** — ship with a WhatsApp/call-back fallback, don't wait on DLT | A blocked booking form is lost revenue daily |
| 4 | ✅ **Vehicle checklist screen** (Section 5.3) | Cheapest possible clinical-liability shield; required for hospital sales |
| 5 | ✅ **CTI + call-booking in the CRM** (Section 6.4) | Most of your revenue arrives by phone today |
| 6 | ✅ **Google Ads conversion = booking created, not call answered** | Will cut cost-per-booking measurably within weeks |
| 7 | ✅ **Immutable `tripEvents` with a hash chain** (Section 10.2) | Everything later — disputes, claims, audits — depends on it |
| 8 | ✅ **Public tracking link** `savelife.health/t/:code` (Section 4.6) | Free organic reach at peak emotional moment |
| 9 | ✅ **Redis + BullMQ**, move dispatch and notifications off the request path | The prerequisite for every scaling step after this |

### 20.2 Months 4–9

10. **Hospital Dashboard v1** — outbound discharge/transfer booking + recurring schedules. Sign 3 hospitals in Bengaluru. *This is the revenue inflection point.*
11. **Fleet Owner Portal v1** — onboard 20 partner vehicles. Supply without capex.
12. **EMT mode + clinical record** — the hospital-contract unlock.
13. **Dispatch engine v2** — scoring, escalation ladder, pre-warm, Redis GEO.
14. **Pricing engine v2** — versioned rate cards, quote immutability, variance cap, simulator.
15. **AI voice booking agent** — handle overflow calls at 3 a.m.
16. **Double-entry ledger + automated payout runs.**

### 20.3 Months 10–18

17. Corporate dashboard + first 5 corporate retainer contracts
18. Insurance dashboard + one insurer network partnership (start with a TPA, they move faster)
19. City #2 and #3 — and this is the real test of your multi-tenant, multi-city data model
20. Migration to AWS ap-south-1, self-hosted OSRM, ClickHouse analytics
21. Subscription product (SaveLife Shield)
22. SOC 2 readiness

### 20.4 Year 2–3

23. Government PPP pilot in one district
24. MediFleet SaaS packaging and first 3 external operator customers
25. 10+ cities, 1,000+ vehicles
26. Air ambulance network formalisation
27. Series A/B on the strength of B2B recurring revenue, not B2C GMV

### 20.5 The five metrics to run the company on

Everything else is a vanity number.

1. **TTD p95** (time to dispatch) — product health
2. **Unserved rate on P0** — the only quality metric that is a moral obligation
3. **Contribution margin per trip, split by own-fleet vs partner-fleet** — business truth
4. **% of revenue from contracted B2B** — the survival metric; target > 60% by Year 2
5. **Driver 90-day retention** — the leading indicator of everything else

### 20.6 Three things that will kill this company if ignored

1. **A clinical incident with no documentation.** A patient dies, the family sues, and you cannot produce the vehicle checklist, the crew certification, the GPS trail, and the timestamps. Sections 5.3, 5.6 and 10.2 exist entirely for this. Build them before you scale, not after.
2. **A data breach involving patient health information.** Under the DPDP Act this is existential for a health-adjacent startup. Field-level encryption, strict RBAC, no cross-tenant leakage, and a rehearsed breach runbook.
3. **Scaling B2C on paid ads with no B2B base.** Your CAC never amortises, growth looks impressive, and you run out of money at exactly the moment you look most successful. The hospital and recurring-transport contracts are not a "later" item — they are the business.

---

## Appendix A — Naming and repo structure

```
savelife-web            🟢 Next.js marketing + booking (Vercel)
savelife-app            🟢 React Native customer app
medifleet-app           🟢 Expo driver/EMT app
medifleet-backend       🟢 Node/Express API (→ decompose at P2)
medifleet-console       🔴 One React app: admin, fleet, hospital, corporate,
                           insurer, govt views — role/tenant gated
savelife-shared         🔴 Types, rate-card schema, fare calculator, trip state
                           machine — shared between backend and clients so the
                           fare shown and the fare charged can never diverge
medifleet-infra         🔴 Terraform, Helm, CI/CD
```

`savelife-shared` is worth building early. A fare calculator implemented twice will eventually disagree with itself, and it will do so in front of a customer.

## Appendix B — Trip status reference

| Status | Customer sees | Driver sees | Billing |
|---|---|---|---|
| DRAFT | — | — | none |
| QUOTED | Fare estimate | — | none |
| SEARCHING | "Finding ambulance" | Offer card | none |
| ASSIGNED | Driver details | Trip accepted | none |
| NAV_PICKUP | Live ETA | Navigate | none |
| AT_PICKUP | Wait timer live | Wait timer | pickup wait accrues |
| ONBOARD | "Patient onboard" | Navigate to drop | base begins |
| EN_ROUTE | Live map + ETA | Navigation | traffic wait accrues |
| AT_DROP | Handover | Handover screen | drop wait accrues |
| RETURN_LEG | Return tracking | Navigate back | return-leg rate |
| COMPLETED | Invoice | Earnings | final fare locked |
| CANCELLED | Reason + charge | Reason | cancellation rule |
| FAILED | Apology + 108 suggestion | — | ₹0, always |

---

*Blueprint v1.0 — a working document. Revise it every quarter against real operating data, and treat any section that contradicts what your city ops team observes as wrong until proven otherwise.*