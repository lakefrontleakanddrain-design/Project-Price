# Project Price — Full Product Overview

**Version:** 0.1.1  
**Platform:** Android (iOS in development), Web  
**Live URL:** https://projectpriceapp.com  
**Play Store:** com.projectpriceapp.mobile  
**Company:** Project Price / Lakefront Leak & Drain  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem We Solve](#2-the-problem-we-solve)
3. [What Project Price Does](#3-what-project-price-does)
4. [How It Works — End-to-End Flow](#4-how-it-works--end-to-end-flow)
5. [Core Features](#5-core-features)
6. [End User Groups & Specific Use Cases](#6-end-user-groups--specific-use-cases)
   - [Homeowners](#61-homeowners)
   - [Real Estate Agents & Realtors](#62-real-estate-agents--realtors)
   - [Contractors & Trade Professionals](#63-contractors--trade-professionals)
   - [Property Managers](#64-property-managers)
   - [Home Inspectors](#65-home-inspectors)
   - [Insurance Adjusters & Appraisers](#66-insurance-adjusters--appraisers)
   - [Investors & House Flippers](#67-real-estate-investors--house-flippers)
7. [Technology Stack](#7-technology-stack)
8. [AI & Estimating Engine](#8-ai--estimating-engine)
9. [Contractor Matching System (Waterfall)](#9-contractor-matching-system-waterfall)
10. [Admin & Compliance Infrastructure](#10-admin--compliance-infrastructure)
11. [Security & Privacy](#11-security--privacy)
12. [Platform Architecture](#12-platform-architecture)
13. [Current Status & Roadmap](#13-current-status--roadmap)
14. [Market Opportunity](#14-market-opportunity)
15. [Revenue Model](#15-revenue-model)
16. [Branding & Design](#16-branding--design)

---

## 1. Executive Summary

**Project Price** is a mobile-first platform that gives homeowners, real estate professionals, contractors, and property managers instant AI-powered cost estimates for home repair and remodel projects — and then connects them to vetted local contractors ready to bid on the work.

Users take or upload a photo of their project area, describe the job in plain language, enter their zip code, and receive three tiered cost estimates (Budget / Mid-Range / Premium) within seconds — along with a visual AI preview of how the finished work could look. When they are ready to move forward, one tap submits a lead request to a prioritized queue of local, verified contractors.

Project Price removes the biggest friction point in the home improvement market: not knowing what something should cost before calling a contractor.

---

## 2. The Problem We Solve

The home improvement industry is a fragmented, opaque market worth over $600 billion annually in the US alone. The core problems:

- **Homeowners** have no reliable way to estimate costs before soliciting bids, leading to sticker shock, scope creep, and exploitation by unscrupulous contractors.
- **Contractors** waste significant time responding to leads from homeowners who are not budget-aligned or not ready to proceed.
- **Real estate professionals** cannot quickly assess repair/upgrade costs when pricing or preparing a property for sale.
- **Property managers** lack a fast, consistent method to estimate and document repair costs across multiple units.
- **The industry** lacks a centralized, transparent pricing reference tied to real market data and local labor indices.

**Project Price solves this by making accurate, AI-driven cost estimates available to anyone with a smartphone — in seconds, before any contractor is ever called.**

---

## 3. What Project Price Does

Project Price is composed of three interconnected systems:

| System | Description |
|--------|-------------|
| **Mobile App** | Flutter-based cross-platform app. Homeowner-facing. Photo upload, AI estimates, project history, contractor request. |
| **Web Portal** | Contractor portal, admin dashboard, homeowner estimate viewer, sign-up and compliance forms. |
| **Backend Engine** | Serverless API functions (Netlify), Supabase database, AI estimating, geofenced contractor waterfall matching, email/SMS notifications. |

---

## 4. How It Works — End-to-End Flow

### Step 1: Project Creation (Homeowner / User)
- User opens the app or visits the web portal.
- Taps **"Price a Project."**
- Takes a photo with the phone camera or uploads from their gallery.
- Enters a plain-language description of the work (e.g., "Replace kitchen countertops and backsplash").
- Enters their 5-digit zip code.

### Step 2: AI Estimate Generation
- Photo and description are sent securely to the Project Price backend.
- The AI engine analyzes the image and description using Google Gemini (`google_generative_ai`).
- The system applies a **regional market pricing index** based on the zip code (Northeast, Southeast, Midwest, South Central, Mountain West, Pacific) — adjusting for local labor cost, material cost, permit complexity, code complexity, access complexity, and weather seasonality.
- Three estimate tiers are returned within seconds:
  - **Budget** — essential materials and basic labor, lowest acceptable quality
  - **Mid-Range** — standard contractor-grade materials and finish
  - **Premium** — high-end materials, specialist labor, best available finish quality
- Each tier includes a dollar range (low–high), a written summary, and an AI-generated visual preview of what the completed project could look like.

### Step 3: Project Saved
- User reviews the estimates and selects a tier.
- Project is saved to their account with full details: project type, description, zip code, photo, cost range, and AI takeoff data.
- User can return to **"My Projects"** at any time to review all saved estimates.

### Step 4: Request a Contractor (Optional)
- When ready to get an exact quote, user taps **"Request a Pro."**
- The system triggers the **Contractor Waterfall Matching Engine** (described in Section 9).
- Verified local contractors matching the specialty and zip code are offered the lead in priority sequence.
- The first contractor to accept receives the homeowner's contact information and project details.
- Both parties receive an email/SMS notification with a unique lead reference number (format: `PP-XXXXXXXX`).

### Step 5: Contractor Follow-Through
- The contractor logs into their dashboard to view the lead details.
- They can update the lead status (accepted, in-progress, completed, declined).
- Homeowner receives status updates throughout.

---

## 5. Core Features

### Mobile App Features
- Photo capture (camera or gallery) with automatic image optimization (max 1600px, 80% quality)
- AI-powered three-tier cost estimates with visual previews
- Regional market index adjustment by zip code
- Project save and history management
- Homeowner account creation and secure authentication
- One-tap contractor lead request
- Secure credential storage (flutter_secure_storage)
- Legal notice and compliance disclosures built in
- Password update and account recovery

### Web Portal Features
- **Homeowner portal:** Estimate viewer, project history, quote request
- **Contractor portal:** Sign-up, account management, lead dashboard, lead status update
- **Admin dashboard:** Contractor approval queue, lead management, activity log, compliance monitoring
- **Data deletion request:** GDPR/CCPA-compliant user data removal workflow
- **Privacy policy and legal pages**

### Backend / API Features
- Serverless Netlify functions for all business logic
- Supabase PostgreSQL database with Row-Level Security (RLS)
- Geofenced contractor matching using Haversine formula (PostgreSQL RPC)
- Regional market pricing profiles (7 regions, 6 cost factors each)
- Automated contractor compliance check (daily cron)
- Activity audit log (all key system actions recorded)
- Email notifications via Resend API (branded HTML templates)
- SMS notifications via Twilio
- Contractor license verification (required for plumbing, electrical, HVAC)
- Lead waterfall with automatic expiration and fallback sequencing

---

## 6. End User Groups & Specific Use Cases

---

### 6.1 Homeowners

**Who they are:** Anyone who owns or rents a home and needs repair, renovation, or improvement work done.

**Core Value:** Know what something costs before calling anyone, so they walk into every contractor conversation with confidence and a realistic budget.

#### Specific Use Cases

| Scenario | How Project Price Helps |
|----------|------------------------|
| **Kitchen remodel planning** | Upload a photo of the kitchen, describe desired changes (cabinet replacement, countertops, appliances), receive Budget/Mid-Range/Premium cost ranges, and see an AI preview of the finished result. |
| **Bathroom renovation** | Estimate tile, vanity, or full gut-and-replace jobs with a single photo and description. Compare three quality tiers to match a budget. |
| **Roof damage after storm** | Photograph damaged area, get an estimate range, and immediately request a local roofing contractor via the app. |
| **Furnace or HVAC replacement** | Describe the unit type and age, get a cost range for replacement, and find a licensed HVAC contractor (app verifies contractor licensing for HVAC, electrical, and plumbing). |
| **Budgeting for a move** | Before committing to a home purchase, photograph problem areas during a tour and get rough cost estimates to factor into the negotiation. |
| **Comparing contractor bids** | Use the Project Price estimate as a benchmark to verify that a contractor's quote is fair and in range. |
| **Project history & recordkeeping** | All saved projects remain in the app, creating a permanent record of repairs with photos, descriptions, dates, and cost estimates. |

---

### 6.2 Real Estate Agents & Realtors

**Who they are:** Licensed agents representing buyers or sellers. Deal in hundreds of thousands to millions of dollars of property transactions where repair costs can make or break a deal.

**Core Value:** Instantly quantify the cost of required repairs or improvements during showings, listing prep, or negotiations — without waiting for a contractor appointment.

#### Specific Use Cases

| Scenario | How Project Price Helps |
|----------|------------------------|
| **Buyer representation — repair negotiation** | During an inspection walkthrough, photograph every identified issue, generate cost estimates for each, and build a repair credit or price reduction request backed by data. |
| **Seller representation — pre-listing prep** | Help sellers understand exactly what needs to be done before listing, what each item costs, and which fixes have the highest return on investment. |
| **Price reduction after inspection** | Use Project Price estimates to professionally justify a specific price reduction request rather than a vague "we want $X off." |
| **As-is listing pricing** | Estimate total deferred maintenance on an as-is property, price it accordingly, and disclose costs to buyers accurately. |
| **Client confidence building** | Send clients a Project Price report of estimated repair costs so they have informed expectations before making an offer. |
| **Staging and cosmetic improvement estimates** | Estimate paint, flooring, landscaping, or fixture upgrades and advise sellers on cost-effective improvements to maximize sale price. |
| **REO / bank-owned properties** | Quickly assess repair budgets on distressed properties where contractors may not be immediately available. |

---

### 6.3 Contractors & Trade Professionals

**Who they are:** Licensed and unlicensed tradespeople and general contractors actively bidding on home repair and remodel projects. Specialties include plumbing, electrical, HVAC, roofing, carpentry, flooring, painting, and general contracting.

**Core Value:** Receive pre-qualified leads from homeowners who already understand cost expectations — reducing wasted bid trips and misaligned proposals.

#### Specific Use Cases

| Scenario | How Project Price Helps |
|----------|------------------------|
| **Inbound lead generation** | Contractors register on the platform and define their specialty, service zip codes, and service radius. When a matching homeowner submits a lead request, the contractor is contacted automatically — no cold calls, no advertising needed. |
| **Pre-qualified prospects** | Every lead comes from a homeowner who has already seen an estimate tier and selected it, meaning they are budget-aware and more likely to close. |
| **Geofenced matching** | The waterfall engine matches leads by specialty AND geographic proximity (Haversine distance formula + zip code coverage array), so contractors only receive leads they can realistically serve. |
| **License verification filter** | For regulated trades (plumbing, electrical, HVAC), the platform verifies contractor license compliance before allowing them into the matching pool — protecting both the contractor's reputation and the homeowner. |
| **Structured lead dashboard** | Contractors manage all leads from a web dashboard: view project details, homeowner contact info, project photo, estimated cost range, and current lead status. |
| **Job costing reference** | Use the Project Price AI estimate as a market benchmark when building their own formal quote — confirming their pricing is competitive. |
| **Reduced bid competition** | The waterfall offers leads sequentially (first match → second match → etc.), not as a mass broadcast. The first contractor to accept gets exclusive access, incentivizing fast response. |
| **Compliance and account management** | Contractors maintain their compliance document uploads (insurance, license) through the portal. The system runs automated daily compliance checks. |

---

### 6.4 Property Managers

**Who they are:** Individuals or companies managing single-family rentals, multi-family units, apartment complexes, HOA properties, or commercial real estate. Responsible for maintenance coordination and budget management.

**Core Value:** Rapidly estimate repair and maintenance costs across multiple properties, create consistent documented records, and quickly source vetted contractors without repeated manual vetting.

#### Specific Use Cases

| Scenario | How Project Price Helps |
|----------|------------------------|
| **Tenant turn estimates** | After a tenant moves out, photograph all damage and deferred maintenance, generate estimates for each item, and build a full turn-cost report within minutes. |
| **Annual maintenance budgeting** | Walk a property portfolio with the app, catalog condition issues, and generate a data-backed budget estimate for the coming year. |
| **Contractor vetting shortcut** | Rather than maintaining an internal vetted contractor list, rely on the Project Price verified contractor network for consistent, licensed tradesperson access. |
| **Insurance claim documentation** | Photograph damage, generate cost estimates, and create a documented record with timestamps, photos, and estimate ranges to support insurance claims. |
| **Vendor bid comparison** | Use Project Price estimates as an independent benchmark to validate or challenge contractor bids received through other channels. |
| **Emergency repair triage** | Quickly estimate the cost of an emergency (burst pipe, HVAC failure) and request a contractor immediately through the app — even after business hours. |

---

### 6.5 Home Inspectors

**Who they are:** Licensed professionals who assess home condition on behalf of buyers or lenders. Typically do not quote repair costs in their reports but frequently face client questions about cost implications.

**Core Value:** Provide clients a tangible cost context for each inspection finding without stepping outside their professional scope — by directing clients to Project Price or embedding cost estimates alongside inspection notes.

#### Specific Use Cases

| Scenario | How Project Price Helps |
|----------|------------------------|
| **Client cost education** | After documenting a finding, use Project Price to provide the client with a rough cost range for the repair — improving client satisfaction without the inspector providing a formal quote. |
| **Report supplement** | Reference Project Price estimate tiers in inspection reports so buyers understand the relative severity (Budget fix vs. Premium scope) of each issue. |
| **Contractor referral** | Use the contractor request feature to refer clients directly to verified local professionals for issues uncovered during inspection. |

---

### 6.6 Insurance Adjusters & Appraisers

**Who they are:** Professionals who assess property value or damage for insurance claims, appraisals, or disputes. Operate under tight timelines and need defensible, documented cost estimates.

**Core Value:** Fast, photo-based cost documentation with regional market index adjustment for more defensible estimates.

#### Specific Use Cases

| Scenario | How Project Price Helps |
|----------|------------------------|
| **Damage documentation** | Photograph damage on-site, generate tiered cost estimates, and retain the record with photo, description, timestamp, and regional pricing data. |
| **Regional cost calibration** | Project Price applies regional labor and material index adjustments automatically — producing estimates appropriate to the local market, not national averages. |
| **Supplement and supplement disputes** | Use the three-tier system to document the difference between a minimal repair (Budget) and a like-for-like restoration (Premium) when building a supplement claim. |

---

### 6.7 Real Estate Investors & House Flippers

**Who they are:** Individuals or entities purchasing properties below market value, renovating them, and reselling or renting for profit. Speed and cost accuracy are critical to deal evaluation.

**Core Value:** Rapid, data-backed renovation cost estimates during due diligence — before committing capital — with the ability to immediately source contractor bids on accepted deals.

#### Specific Use Cases

| Scenario | How Project Price Helps |
|----------|------------------------|
| **Deal analysis on-site** | Walk a potential acquisition during inspection period, photograph every repair item, and build a realistic rehab budget in real time — directly informing the offer price. |
| **ARV-based budgeting** | Use the three tiers to model a cosmetic flip (Budget scope) vs. a full renovation (Premium scope) and calculate projected returns for each scenario. |
| **Contractor pipeline management** | Once a deal is acquired, immediately submit contractor lead requests for each trade — roofing, plumbing, HVAC, flooring — and manage all through the app. |
| **Multi-property portfolio analysis** | Create multiple saved projects across different acquisitions and review all cost estimates in one place (My Projects screen). |
| **Rehab budget documentation for lenders** | Use saved Project Price estimates as supporting documentation when presenting a rehab budget to hard money lenders or private capital partners. |

---

## 7. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Mobile app** | Flutter 3.x (Dart), cross-platform iOS + Android |
| **State management** | Flutter built-in StatefulWidget |
| **Auth & database** | Supabase (PostgreSQL with Row-Level Security) |
| **AI/ML** | Google Gemini (`google_generative_ai` v0.4.6) |
| **Image handling** | image_picker v1.1.2, in-app camera + gallery access |
| **Secure storage** | flutter_secure_storage v9.2.2 (encrypted on-device credential store) |
| **HTTP client** | http v1.2.2 |
| **Backend functions** | Netlify Serverless Functions (Node.js) |
| **Email notifications** | Resend API (branded HTML templates) |
| **SMS notifications** | Twilio |
| **Web hosting** | Netlify CDN (auto-deploys from GitHub main branch) |
| **CI/CD (mobile)** | Codemagic |
| **Database migrations** | Supabase SQL migrations (version-controlled) |
| **Geospatial matching** | PostgreSQL RPC with Haversine formula |

---

## 8. AI & Estimating Engine

The estimate engine is the technical core of Project Price. It combines photo analysis, natural language understanding, and regional market data to produce defensible cost ranges in seconds.

### How It Works

1. **Image + description** are sent to the backend API function (`project-price-generate-estimates`).
2. The **zip code** is mapped to one of 7 regional market profiles.
3. Each profile contains 6 cost multipliers:

| Factor | What It Adjusts |
|--------|----------------|
| `laborCostIndex` | Regional labor rate vs. national baseline |
| `materialCostIndex` | Regional material cost vs. national baseline |
| `permitComplexity` | 1–5 score, affects overhead estimate |
| `codeComplexity` | 1–5 score, affects compliance cost estimate |
| `accessComplexity` | 1–5 score, affects site logistics estimate |
| `weatherComplexity` | 1–5 score, affects seasonal delay risk |

4. The AI model (Google Gemini) analyzes the photo and description against the regional profile and returns:
   - Three named tiers (Budget / Mid-Range / Premium)
   - Dollar range (low–high) for each tier
   - Written summary per tier
   - AI-generated visual preview per tier (what the finished result could look like)
   - An overall estimate summary

5. Results are stored in the `projects` table as structured JSON (`ai_takeoff`, `estimated_cost_range`).

### Regional Market Profiles

| Region | Labor Index | Material Index |
|--------|------------|----------------|
| Northeast | 1.18 | 1.08 |
| Southeast | 0.98 | 0.97 |
| Midwest | 1.00 | 0.99 |
| South Central | 0.96 | 0.98 |
| Mountain West | 1.04 | 1.02 |
| Pacific | 1.22 | 1.12 |
| National (default) | 1.00 | 1.00 |

---

## 9. Contractor Matching System (Waterfall)

The waterfall engine is what turns an estimate into a real contractor connection. It is designed to be fair, fast, and geographically precise.

### Matching Logic

1. When a homeowner submits a lead request, the system calls the `match_professionals` PostgreSQL RPC.
2. The RPC filters by:
   - **Specialty match** (e.g., "plumbing," "roofing," "electrical")
   - **Verified status** (`is_verified = true`)
   - **Zip code coverage** (contractor's `service_zip_codes` array contains the homeowner's zip)
   - **Geographic radius** (Haversine distance formula — contractor's `service_center_lat/lng` + `service_radius_km`)
3. Matched contractors are ranked by proximity.
4. The lead is **offered sequentially** (waterfall, not broadcast):
   - Contractor #1 receives a notification and has a fixed window to accept or decline.
   - If they decline or the window expires → Contractor #2 is offered the lead.
   - This continues until the lead is claimed or the queue is exhausted.
5. Once claimed, the homeowner and contractor both receive a notification with the unique lead reference (`PP-XXXXXXXX`), full project details, and contact information.

### Lead Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Offered to contractor, awaiting response |
| `claimed` | Contractor accepted, lead is active |
| `expired` | No contractor accepted within the window |

### License Verification
For regulated trades (plumbing, electrical, HVAC), the system enforces license verification as a prerequisite for inclusion in the matching pool. This protects homeowners and reduces legal liability.

---

## 10. Admin & Compliance Infrastructure

### Admin Dashboard
- Protected by an `ADMIN_DASHBOARD_KEY` environment variable
- View and approve/deny contractor sign-up applications
- Review all lead activity and status
- View real-time activity audit log
- Manage contractor account status

### Activity Audit Log
Every key action in the system is recorded in the `activity_audit_logs` table:
- Timestamp
- Action type
- User/contractor reference
- Metadata payload

### Contractor Compliance (Daily Cron)
- The `project-price-compliance-daily` function runs on a scheduled basis.
- Checks contractor accounts for expired or missing compliance documents (insurance, license).
- Flags non-compliant contractors and can suspend them from the matching pool automatically.

### Data Deletion (GDPR/CCPA)
- A dedicated `data-deletion-request` function and public web page allow any user to submit a data deletion request.
- Requests are logged and processed with documented audit trail.

---

## 11. Security & Privacy

| Area | Implementation |
|------|---------------|
| **Authentication** | Supabase Auth (email + password, bcrypt-hashed) |
| **Row-Level Security** | Supabase RLS policies restrict every table — users can only read/write their own data |
| **Credential storage** | flutter_secure_storage — credentials are encrypted on-device using platform keychain (iOS Keychain / Android Keystore) |
| **API key management** | All secrets stored as environment variables (never in source code) |
| **Admin access** | Admin API routes require a separate `ADMIN_DASHBOARD_KEY` header — not accessible via normal auth tokens |
| **Service role** | Supabase service-role key used only in server-side Netlify functions, never exposed to the client |
| **License enforcement** | Regulated trade contractors (plumbing, electrical, HVAC) require license verification before lead eligibility |
| **Data deletion** | GDPR/CCPA-compliant deletion request workflow with audit trail |
| **Privacy policy** | Published at https://projectpriceapp.com/privacy-policy.html |

---

## 12. Platform Architecture

```
┌─────────────────────────────────────────────┐
│              End Users                       │
│  Homeowners · Realtors · Contractors · PMs  │
└───────────┬────────────────────┬────────────┘
            │                    │
     ┌──────▼──────┐     ┌───────▼──────┐
     │ Flutter App  │     │  Web Portal  │
     │ (iOS/Android)│     │  (Netlify)   │
     └──────┬──────┘     └───────┬──────┘
            │                    │
     ┌──────▼────────────────────▼──────┐
     │      Netlify Serverless API       │
     │   (Node.js Functions)             │
     │  • Estimate generation            │
     │  • Lead submission & waterfall    │
     │  • Contractor account mgmt        │
     │  • Admin operations               │
     │  • Email (Resend) / SMS (Twilio)  │
     └──────────────┬───────────────────┘
                    │
     ┌──────────────▼───────────────────┐
     │         Supabase                  │
     │  PostgreSQL + Auth + Storage      │
     │  • users, professionals, projects │
     │  • lead_requests, waterfall queue │
     │  • activity_audit_logs            │
     │  • compliance_docs                │
     │  • data_deletion_requests         │
     │  • RLS on all tables              │
     │  • Geofence matching RPC          │
     └──────────────────────────────────┘
                    │
     ┌──────────────▼───────────────────┐
     │         Google Gemini AI          │
     │  Photo + description → estimates  │
     │  AI visual previews per tier      │
     └──────────────────────────────────┘
```

---

## 13. Current Status & Roadmap

### Current (v0.1.1 — April 2026)
- Android app live on Google Play (in review)
- Web portal live at https://projectpriceapp.com
- AI estimate engine operational
- Contractor waterfall matching operational
- Contractor onboarding and compliance portal live
- Admin dashboard live
- Supabase database with full schema deployed
- Email (Resend) and SMS (Twilio) notifications active

### Near-Term Roadmap
- iOS App Store submission
- In-app contractor messaging
- Stripe payment integration (contractor lead fee billing)
- Expanded AI model fine-tuning with real project cost data
- Homeowner review and rating system for contractors
- Push notifications (FCM/APNs)
- 7-inch tablet optimized UI

### Long-Term Vision
- SaaS licensing to real estate brokerages and property management companies
- API access for home inspection software integrations
- Predictive maintenance scheduling
- Material cost tracking integration (Home Depot / Lowe's pricing APIs)
- Contractor CRM and job management suite

---

## 14. Market Opportunity

| Market | Size (US) |
|--------|----------|
| Home improvement & repair | ~$620B annually |
| Real estate transaction volume | ~$1.5T annually |
| Property management industry | ~$100B annually |
| Home inspection industry | ~$4.4B annually |
| Contractor services marketplace | ~$500B annually |

**Total Addressable Market (TAM):** $600B+ home improvement  
**Serviceable Addressable Market (SAM):** Homeowners + real estate professionals who use digital tools for project planning and contractor sourcing  
**Serviceable Obtainable Market (SOM, Year 1–2):** Regional launch in key metro markets, targeting early adopters via Play Store + realtor associations + contractor networks

Key growth drivers:
- 65%+ of US homes are over 30 years old, creating sustained repair and renovation demand
- 85% of homeowners report they don't know what a project should cost before calling a contractor
- The contractor discovery and vetting process averages 3–5 days — Project Price compresses it to under 5 minutes
- AI-powered estimating is a category-defining differentiator with strong IP moat potential

---

## 15. Revenue Model

Project Price supports multiple revenue streams:

| Stream | Description |
|--------|-------------|
| **Lead fees (contractor-paid)** | Contractors pay a per-lead fee when they claim a homeowner lead through the waterfall system |
| **Contractor subscription** | Monthly or annual subscription for access to the lead platform, dashboard, and compliance management tools |
| **Premium homeowner tier** | Subscription for homeowners who want unlimited saved projects, priority contractor matching, or enhanced AI features |
| **SaaS / API licensing** | White-label or API access for real estate brokerages, property management platforms, or insurance companies |
| **Enterprise contracts** | Custom pricing for large property management companies or national real estate networks |

---

## 16. Branding & Design

**Brand Colors:**
- Primary Navy: `#0E3A78`
- Accent Emerald: `#16A36A`
- Background: Soft blue-white gradient (`#EAF3FF` → `#FFFFFF`)

**App Name:** ProjectPrice  
**Tagline:** *Instant Repair & Remodel Estimates*  
**Voice:** Professional, confident, practical. Not sales-y. The platform is a tool, not a pitch.

**Design Philosophy:** Clean mobile-first UI with large tap targets, clear cost hierarchy (tiers presented top-down from Premium → Budget to anchor on quality), and immediate visual feedback (AI preview images per tier).

---

*Document version: April 30, 2026. Based on deployed codebase at commit e01c44d.*
