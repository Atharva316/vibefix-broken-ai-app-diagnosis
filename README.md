# VibeFix

VibeFix is a Safe Prompting System for broken AI-built apps.

Main positioning:

Before you ask AI to fix your app, check what not to touch.

The site combines a free Safe First Move Scanner, Prompt Risk Checker, AI Change History, Fix-Break Loop Detector, VibeFix Case File preview, and paid Deep Diagnosis flow.

## Stack

- Cloudflare Worker: `src/worker.js`
- Static assets: `public/`
- Deployment config: `wrangler.toml`
- Supabase schema: `database/supabase-setup.sql`
- No frontend framework

## Project layout

```
src/worker.js                 API routes, auth, dashboard rendering
database/supabase-setup.sql   Tables, RLS, grants
public/
  index.html                  Landing page
  sitemap.xml
  assets/
    css/styles.css
    js/site.js, dashboard.js
    images/og-image.svg
  pages/                      intake, payment, success pages
  tools/                      prompt checker, rollback calculator
  guides/                     SEO diagnosis articles
```

## Required Cloudflare setup

Create a KV namespace and bind it as:

`VIBEFIX_KV`

Set these Worker secrets or vars:

`ANTHROPIC_API_KEY`
`GEMINI_API_KEY`
`RESEND_API_KEY`
`OWNER_EMAIL`
`FROM_EMAIL`
`SUPABASE_URL`
`SUPABASE_ANON_KEY`

Optional vars are in `wrangler.toml`:

`FREE_AI_LIMIT`
`RAZORPAY_PAYMENT_LINK`
`UPGRADE_URL`

## Current VibeFix flow

1. Landing page
2. Free Safe First Move Scanner and Prompt Risk Checker
3. Razorpay Payment Link
4. `payment-success.html`
5. `intake.html`
6. `/api/generate-report`
7. Web3Forms/Resend owner notification
8. `intake-submitted.html`
9. Manual/AI-assisted diagnosis report delivery

Production Razorpay link:

`https://rzp.io/rzp/bM3R4oPl`

Backup intake link:

`https://tally.so/r/yPzAVx`

## Security notes

- Razorpay handles payment through a hosted payment link.
- No Razorpay API secrets are stored in the frontend.
- No Gemini key is stored in the frontend.
- No Resend key is stored in the frontend.
- No Supabase service role key is stored in the frontend.
- Supabase access uses the anon key only with RLS insert policies.
- Private intake/scanner records must not have public select policies.
- Secret-like submitted text is redacted before storage/email/report generation.

## Supabase tables

Core existing tables:

- `report_counter`
- `ai_helper_sessions`
- `rollback_calculator_sessions`
- `prompt_checker_sessions`

Product data tables:

- `vibefix_scans`
- `vibefix_prompt_checks`
- `vibefix_intakes`
- `vibefix_case_files`

Use `database/supabase-setup.sql` to create the required tables, RLS policies, and PostgREST grants.

## KV keys used

`usage:{anonymousUserId}` stores AI helper free-use count.

`report:{reportId}` stores generated report access records.

`reports:{userId}` stores report cards if dashboard reports are used later.

## Validation

Run:

`node --check src/worker.js`

`node --check public/assets/js/site.js`

`npx wrangler deploy --dry-run`
