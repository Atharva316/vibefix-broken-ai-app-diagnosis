# VibeFix Agent Notes

## Product Positioning

VibeFix is a Safe Prompting System for broken AI-built apps. The core promise is:

Before you ask AI to fix your app, check what not to touch.

The site is for non-technical founders and indie builders using Lovable, Bolt, Cursor, Replit, v0, Claude Code, Windsurf, ChatGPT, Gemini, DeepSeek, and similar tools.

## Stack

- Cloudflare Worker entry: `worker.js`
- Static assets: `public/`
- Deploy config: `wrangler.toml`
- Supabase setup SQL: `supabase-setup.sql`
- No frontend framework is currently used.

## Important Commands

- Syntax check Worker: `node --check worker.js`
- Syntax check site JS: `node --check public/site.js`
- Cloudflare dry run: `npx wrangler deploy --dry-run`
- Local dev: `npx wrangler dev`

## Do Not Break

- Razorpay production payment link: `https://rzp.io/rzp/bM3R4oPl`
- Intake page: `/intake.html`
- Payment success page: `/payment-success.html`
- Tally backup link: `https://tally.so/r/yPzAVx`
- Web3Forms fallback submission from intake
- Existing SEO pages in `public/`

## Security Rules

- Do not commit API keys, service role keys, database passwords, private tokens, or admin credentials.
- Do not expose Supabase service role keys in browser code.
- Public Supabase access must be insert-only for user submissions. Do not add public select policies for private intake data.
- Redact secret-like strings before storing or emailing submissions.
- Do not request production secrets from customers. Ask for test credentials only.

## Content Rules

- Do not add fake testimonials, fake report counts, fake case-study numbers, or unsupported proof.
- Do not position VibeFix as a security audit, legal/compliance review, 24/7 support, or guaranteed bug fixing.
- Keep the tone diagnostic, restrained, and practical.

## Validation Checklist

Before finishing changes:

- Homepage loads.
- Safe First Move Scanner produces a case file.
- Prompt Risk Checker produces a safe rewrite.
- Copy/export/download buttons work.
- `/intake.html` loads and validates required fields.
- `/payment-success.html` links to `/intake.html`.
- Razorpay CTAs use the production link unless explicitly in test mode.
- Tally remains backup only.
- No Lemon Squeezy references remain.
- No committed secrets are present.
