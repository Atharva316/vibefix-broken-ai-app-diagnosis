# VibeFix

Cloudflare Worker app for VibeFix: public marketing pages, Google OAuth, dashboard, reports, and AI Fix Helper.

## Required Cloudflare setup

Create a KV namespace and bind it as:

`VIBEFIX_KV`

Set these Worker secrets:

`GOOGLE_CLIENT_ID`
`GOOGLE_CLIENT_SECRET`
`ANTHROPIC_API_KEY`

Optional vars are in `wrangler.toml`:

`FREE_AI_LIMIT`
`RAZORPAY_PAYMENT_LINK`
`UPGRADE_URL`

## Current VibeFix flow

1. Landing page
2. Razorpay Payment Link
3. `payment-success.html`
4. `intake.html`
5. Web3Forms email submission
6. `intake-submitted.html`
7. Manual/AI-assisted diagnosis report delivery

Razorpay handles payment. Web3Forms handles intake submission. No Razorpay API secrets are stored in frontend code. The legacy checkout provider has been removed from the active flow.

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
