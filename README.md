# Project Price

Instant plumbing estimates — connecting homeowners with vetted local pros.

## Repository Structure

```
Project-Price/
├── backend/
│   └── functions/          # Netlify serverless functions (Node.js)
├── web/
│   └── public/             # Homeowner portal, admin panel, contractor pages (HTML/CSS/JS)
├── apps/
│   ├── mobile/             # Flutter mobile app (iOS + Android)
│   └── api/                # Future dedicated API service (TypeScript)
├── packages/
│   └── types/              # Shared TypeScript types across apps
├── supabase/
│   ├── migrations/         # Database schema migrations (SQL)
│   ├── config.toml         # Supabase local dev config
│   └── seed.sql            # Dev seed data
├── infra/
│   ├── scripts/            # Build and smoke-test scripts
│   └── codemagic/          # CI/CD config for mobile builds
├── assets/
│   └── logos/              # Brand assets
├── docs/                   # Architecture and feature documentation
├── netlify.toml            # Netlify build + function config
├── package.json            # Root workspace config
└── .env.example            # Environment variable template
```

## Getting Started

1. Copy `.env.example` → `.env` and fill in your keys
2. Install dependencies: `npm install`
3. Run smoke test: `npm run smoke:waterfall`

## Deployment

Netlify auto-deploys from `main`. Functions in `backend/functions/`, web assets in `web/public/`.
Project Price 
