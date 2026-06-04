# VibeFix

Cloudflare Worker app for VibeFix: public marketing pages, SEO guides, AI Helper, custom intake, and report submission flow.

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

## Current production flow

1. Landing page
2. Razorpay Payment Link for ₹7,530
3. `payment-success.html` if Razorpay redirect is configured
4. `intake.html`
5. `/api/generate-report`
6. Gemini creates report draft when configured, otherwise a local report draft is generated
7. Resend/Web3Forms/local fallback handles submission
8. `intake-submitted.html` confirmation
9. Final report is reviewed and sent manually

Production Razorpay link:

`https://rzp.io/rzp/bM3R4oPl`

Security notes:

No Razorpay secrets in frontend.
No Gemini key in frontend.
No Resend key in frontend.
No Supabase service role key in frontend.
Supabase frontend/API access uses the anon key only.

## Supabase tables

`report_counter`
`ai_helper_sessions`
`rollback_calculator_sessions`
`prompt_checker_sessions`

Use `supabase-setup.sql` to create the required tables, RLS policies, and PostgREST grants.

## KV keys used

`usage:{anonymousUserId}` stores AI helper free-use count.

`reports:{userId}` stores manual report cards as a JSON array if dashboard reports are used later.
