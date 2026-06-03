# VibeFix

Cloudflare Worker app for VibeFix: public marketing pages, Google OAuth, dashboard, reports, and AI Fix Helper.

## Required Cloudflare setup

Create a KV namespace and bind it as:

`VIBEFIX_KV`

Set these Worker secrets:

`GOOGLE_CLIENT_ID`
`GOOGLE_CLIENT_SECRET`
`ANTHROPIC_API_KEY`
`GEMINI_API_KEY`
`RESEND_API_KEY`
`OWNER_EMAIL`
`FROM_EMAIL`

Optional vars are in `wrangler.toml`:

`FREE_AI_LIMIT`
`RAZORPAY_PAYMENT_LINK`
`UPGRADE_URL`

## Current test flow

1. Landing page
2. ₹1 Razorpay test Payment Link
3. `payment-success.html` if Razorpay redirect is configured
4. `intake.html`
5. `/api/generate-report`
6. Gemini creates report draft
7. Resend emails draft to owner
8. `intake-submitted.html` confirmation
9. Final report is reviewed and sent manually

Production link to restore after test:

`https://rzp.io/rzp/bM3R4oPI`

Test link currently active:

`https://rzp.io/rzp/lJurCsFY`

Required environment variables:

`GEMINI_API_KEY`
`RESEND_API_KEY`
`OWNER_EMAIL`
`FROM_EMAIL`

Security notes:

No Razorpay secrets in frontend.
No Gemini key in frontend.
No Resend key in frontend.
Legacy checkout provider removed.

Google OAuth redirect URL:

`https://vibefix-broken-ai-app-diagnosis.atharvam144.workers.dev/auth/google/callback`

## KV keys used

`user:{googleId}` stores name, email, Google ID, avatar, created_at, diagnosis_count.

`session:{sessionId}` stores logged-in session state.

`usage:{googleId}` stores AI helper free-use count.

`reports:{googleId}` stores manual report cards as a JSON array.

Example reports value:

```json
[
  {
    "tool": "Lovable",
    "date_submitted": "2026-06-03",
    "status": "Pending",
    "report_url": ""
  }
]
```
