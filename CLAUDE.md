# bzrcMaster — Modular Shipping Integration

## Project Overview
bzrcMaster is a shipping integration dashboard that connects WooCommerce orders to carrier APIs (Naqel/GN Connect, SMSA, DHL). It provides order management, address translation, city code matching, currency conversion, shipment creation, and label download.

## Tech Stack
- **Frontend:** Next.js 16 + TypeScript + shadcn/ui + Tailwind CSS
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL (remote server)
- **No local database** — all data from WC API or remote shipping API
- **No Prisma, no NextAuth** — stateless frontend

## Architecture
```
WooCommerce (master.bazaarica.com)
  ↓ REST API v3
Next.js Frontend (hero.bazaarica.com:3001)
  ↓ API Routes (/api/*)
FastAPI Backend (dev.bazaarica.com:8000)
  ↓ PostgreSQL (bzrc_shipping_integ)
  ↓ Naqel/GN Connect API (dev.gnteq.app)
```

## Directory Structure
```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx              # Dashboard (shipment stats)
│   │   ├── orders/page.tsx       # WC orders (editable, translate, city match, route validation)
│   │   └── shipments/page.tsx    # Shipment list (submit, track, labels, timeline)
│   └── api/
│       ├── woo/orders/           # GET (list), [id] GET/PUT
│       ├── shipments/            # GET/POST, [id]/submit, [id]/label, [id]/track, [id]/tracking-events, tracking-poll
│       ├── translate/            # POST — Gemini translation
│       ├── city-match/           # POST — fuzzy city code matching
│       ├── exchange-rates/       # GET — open.er-api.com currency conversion
│       └── reference/sheets/     # GET — Google Sheets data (exit, cities, currencies, carrierConfig)
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx           # Navigation sidebar
│   │   └── topbar.tsx            # Top bar + mobile hamburger menu
│   └── ui/                       # shadcn/ui components
├── lib/api/
│   ├── woo-client.ts             # WooCommerce REST API client
│   ├── woo-types.ts              # WC type definitions
│   ├── woo-to-shipment.ts        # WC order → shipment payload mapper (with COD multiplier)
│   ├── shipping-client.ts        # Remote shipping API client (CRUD + submit + track)
│   ├── shipping-types.ts         # Shipment type definitions (+ TrackingEvent, TrackingResponse)
│   ├── gemini.ts                 # Gemini API (transliterate + translate + city match)
│   ├── city-matcher.ts           # 4-step city code fuzzy matching pipeline
│   └── google-sheets.ts          # Google Sheets API (raw fetch + JWT, zero deps, 4 sheets)
server/
└── main.py                       # FastAPI backend (shipment CRUD + Naqel submit + tracking)
credentials/
└── google-service-account.json   # GCP service account key (gitignored)
docs/
├── architecture.html             # Visual architecture documentation (legacy)
├── architecture_naqel.html       # Naqel module architecture (v3.0, Phases 1-4)
├── architecture_smsa.html        # SMSA module architecture (plan)
└── erd.html                      # Interactive ERD diagram (v4.0, draggable)
```

## Environment Variables (.env)
```
# Shipping Integration API (FastAPI backend)
SHIPPING_API_URL=https://dev.bazaarica.com

# WooCommerce Store
WOO_BASE_URL=https://master.bazaarica.com
WOO_CONSUMER_KEY=ck_...
WOO_CONSUMER_SECRET=cs_...

# Default Naqel credentials
NAQEL_CUSTOMER_CODE=NL***
NAQEL_BRANCH_CODE=NL***
NAQEL_SUPPLIER_CODE=SPL

# Gemini API (translation)
GEMINI_API_KEY=AIzaSy...

# Google Sheets (reference data)
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=credentials/google-service-account.json
GOOGLE_SHEET_ID=109aKj27J8Bo8KpPf1wt_wcbFDcXjYCrHT0vDIDEr3l4
```

## Key API Routes (Next.js)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/woo/orders` | List WC orders (page, per_page, status) |
| GET | `/api/woo/orders/[id]` | Get single WC order |
| PUT | `/api/woo/orders/[id]` | Update WC order (shipping, billing, note) |
| GET | `/api/shipments` | List shipments from remote API |
| POST | `/api/shipments` | Create shipment (with route + carrier config validation) |
| POST | `/api/shipments/[id]/submit` | Submit shipment to Naqel |
| GET | `/api/shipments/[id]/label` | Download shipping label PDF |
| POST | `/api/shipments/[id]/track` | Track shipment via GN Connect |
| GET | `/api/shipments/[id]/tracking-events` | Get cached tracking events |
| POST | `/api/shipments/tracking-poll` | Bulk poll all submitted/in_transit shipments |
| POST | `/api/translate` | Translate/transliterate text via Gemini |
| POST | `/api/city-match` | Fuzzy match city to Naqel code |
| GET | `/api/exchange-rates` | Get/convert exchange rates (open.er-api.com) |
| GET | `/api/reference/sheets` | Google Sheets reference data (4 sheets + carrierConfigs) |

## FastAPI Backend Endpoints (server/main.py)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/shipments/` | Create shipment in DB |
| GET | `/shipments/` | List shipments |
| GET | `/shipments/{id}` | Get single shipment |
| PATCH | `/shipments/{id}` | Update shipment |
| POST | `/shipments/{id}/submit` | Submit to Naqel/GN Connect |
| GET | `/shipments/{id}/label` | Download label PDF |
| POST | `/shipments/{id}/track` | Track via GN Connect, store events, update status |
| GET | `/shipments/{id}/tracking-events` | Read cached events (no external call) |
| POST | `/shipments/tracking/poll` | Bulk poll all submitted/in_transit shipments |
| GET | `/exchange-rates/` | All TCMB rates (cached 4h, DB fallback) |
| GET | `/exchange-rates/convert` | Convert amount (?from=USD&to=SAR&amount=100) |

## Google Sheets Reference Data
- **Implementation:** Raw `fetch()` + JWT auth using Node.js built-in `crypto` (zero npm deps)
- **Spreadsheet ID:** `109aKj27...r3l4`
- **Service Account:** `indexer-bot@alpine-guild-481512-t7.iam.gserviceaccount.com`
- **Cache:** 6-hour TTL (in-memory), token cached 1 hour
- **Sheets:**
  - `exitLocation` — Exit Country, Exit Location Code, Destination Countries (split by "/" in code)
  - `naqelCityCodes` — Country Code, Country Name, Province, City [EN], City [AR], City Code, Country Currency, Country Trade Code, City Code NET
  - `currencyCodes` — Code, Currency, Currency Description
  - `carrierConfig` — Carrier Code, Carrier Name, Declared Value Multiplier (Phase 3)
- **Country name resolution:** exitLocation sheet uses names (Turkiye, UAE-FF) → resolved to ISO2 (TR, AE) in code

## Exit Location Route Validation (Phase 3)
- **Server-side:** POST `/api/shipments` returns 422 if TR → destination not in exitLocation sheet
- **Client-side (orders page):**
  - Red "Invalid Route" badge on order rows with invalid destination
  - "Route Issues" filter tab showing count of affected orders
  - Detail dialog: red warning banner, Create Shipment button disabled
  - Valid destinations built from exitLocation sheet on page mount

## COD Declared Value (Phase 3)
- Carrier-specific multiplier from `carrierConfig` Google Sheet (e.g., naqel=0.85, smsa=1.0)
- Applied to `customs_declared_value` and per-item `customs_value` for COD orders only
- **NOT** applied to `cod_amount` (real amount customer pays on delivery)
- Lookup: `getCarrierConfig(carrierCode)` → `declaredValueMultiplier`

## City Matching Pipeline
1. **Exact match** — country code + city name (case-insensitive)
2. **Fuzzy match** — Levenshtein distance >= 70% against English city names
3. **Gemini Arabic fallback** — if Arabic characters detected, ask Gemini
4. **Operator confirmation** — fuzzy/gemini matches require manual confirm
5. **Manual entry** — operator can always type a city code directly
- **Confidence "none" (< 70%) blocks shipment creation** — user must select alternative or enter manually
- **City/country field edits invalidate** existing city match and manual code (forces re-match)

## Currency Conversion (open.er-api.com)
- Source: `https://open.er-api.com/v6/latest/{base}` (free, no API key)
- All WC orders arrive in USD
- Convert to destination currency (determined from countryCurrencyMap, built from naqelCityCodes)
- **Currency lookup by country code** (not dependent on city match) — works even with saved city code
- Caching: in-memory Map with 1-hour TTL (Next.js API route)
- Runs entirely in frontend — no FastAPI backend involvement

## Gemini Translation (3 modes)
- **Transliterate:** Names (first_name, last_name, company) — phonetic Latin only
- **Translate Address:** address_1, address_2, city, state — translate generic words, transliterate proper nouns
- **Generic Translate:** Other fields — pure 1:1 translation
- **City Match:** Arabic city name → matched against Naqel candidate list
- Names are NEVER translated (e.g. هداية → "Hedaye" NOT "Gift")

## WooCommerce Meta Persistence
- `bzrc_carrier` — Selected carrier (naqel/smsa/dhl)
- `bzrc_city_code` — Matched Naqel city code (AMM, RUH, etc.)
- `bzrc_country_currency` — Destination currency (JOD, SAR, etc.)
- Saved via PUT /api/woo/orders/[id], pre-populated on next dialog open
- Green "ready" badge on order list when carrier + city code set

## Phase 4: Shipment Tracking (Complete)
- **Single track:** POST `/api/shipments/[id]/track` → GN Connect Tracking API → store events
- **Cached events:** GET `/api/shipments/[id]/tracking-events` → read from DB (no external call)
- **Bulk poll:** POST `/api/shipments/tracking-poll` → poll all submitted/in_transit
- **Background poller:** asyncio.Task on FastAPI startup, runs every 3 hours
- **DB:** `tracking_events` table (FK → shipments, dedup by event_code+event_date UTC)
- **UI:** 4th "Tracking" tab in shipment detail dialog, vertical timeline, per-row Radar button
- **Dashboard:** 6 stat cards (total, pending, submitted, in_transit, delivered, failed)

## Naqel/GN Connect API Quirks
- Token: POST `/api/identity/Authentication/GetToken`
- Submit: POST `/api/gnconnect/Shipments` (single object, NOT array)
- Track: POST `/api/gnconnect/Tracking` → returns **flat list** of events (NOT nested dict)
- Success: HTTP 201, status="Success", airwaybill + shipmentLabel (base64)
- numberOfPieces must be string, not int
- COD field typo: `codCurrnecy` (not codCurrency)
- Shipper country code: ISO3 (TUR, SAU); Consignee: ISO2 (TR, SA)
- companyName required for shipper (default: "Bazaarica")
- Tracking fields: `eventName` (not eventDescription), `actionDate` (not eventDate), `eventCity`+`eventCountry` (not eventLocation)
- Tracking dedup: normalize dates to UTC before comparing (DB stores in server TZ)

## SMSA Express Integration (Planned)
- **Protocol:** SOAP/XML (not REST)
- **Endpoint:** `http://track.smsaexpress.com/SECOM/SMSAwebService.asmx`
- **Auth:** passKey string (static, per-call). Test key `Testing0` only works for city lookup.
- **Python lib:** `zeep` (SOAP client)
- **Key methods:** addShipPDF (create+AWB+PDF), getTrack, getStatus, getPDF, getShipCharges, cancelShipment, getShipUpdates
- **City codes:** String names ("Jeddah"), NOT numeric codes like Naqel
- **No DB changes needed** — existing shipments/tracking_events tables support both carriers via `carrier_code`
- **Backend change:** carrier router in submit/track endpoints (check carrier_code → route to Naqel or SMSA)
- **Waiting for:** SMSA production passKey from account manager (fsaid@smsaexpress.com)
- **Architecture doc:** `docs/architecture_smsa.html`

## Development
```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
```

## Deployment
- **Frontend:** hero.bazaarica.com (PM2: bzrc-hero, port 3001)
- **Backend:** dev.bazaarica.com (systemd: bzrc_app.service, port 8000)
- **Server:** 135.181.215.44 (Hetzner, Ubuntu 22.04)
- **GitHub:** kalafatm/bzrc-hero (main branch)
- **Deploy script:** `/usr/local/lsws/DEFAULT/heroBZRC/deploy.sh`

## Rules
- All UI text in English only
- No local database — all data from WC API or remote shipping API
- No bulk shipment creation — all shipments go through detail dialog (carrier/city/translation review)
- PowerShell: use `;` not `&&` to chain commands
- shadcn CLI: `npx shadcn@latest add <component> -y`
- API routes return `NextResponse.json()`
- Don't push to GitHub/server until features are complete locally
- NEVER default carrier to "naqel" — show actual WC meta value or empty with error
