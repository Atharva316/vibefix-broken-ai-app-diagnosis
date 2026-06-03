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
2. `payment.html` safe payment handoff page
3. ₹1 Razorpay test Payment Link
4. `payment-success.html` if Razorpay redirect is configured, or manual fallback if the shortlink returns a blank page
5. `intake.html`
6. `/api/generate-report`
7. Gemini creates report draft when configured, otherwise a local report draft is generated
8. Resend/Web3Forms/local fallback handles submission
9. `intake-submitted.html` confirmation
10. Final report is reviewed and sent manually

Production link to restore after test:

`https://rzp.io/rzp/bM3R4oPI`

Test link currently active:

`https://rzp.io/rzp/IJurCsfY`

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
