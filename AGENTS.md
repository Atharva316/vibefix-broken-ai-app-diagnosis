# VibeFix Agent Notes

## Product Positioning

VibeFix is a Safe Prompting System for broken AI-built apps. The core promise is:

Before you ask AI to fix your app, check what not to touch.

The site is for non-technical founders and indie builders using Lovable, Bolt, Cursor, Replit, v0, Claude Code, Windsurf, ChatGPT, Gemini, DeepSeek, and similar tools.

## Stack

- Cloudflare Worker entry: `src/worker.js`
- Static assets: `public/`
- Deploy config: `wrangler.toml`
- Supabase setup SQL: `database/supabase-setup.sql`
- No frontend framework is currently used.

## Project layout

```
src/worker.js              Cloudflare Worker (API, auth, dashboard)
database/supabase-setup.sql
public/
  index.html               Homepage
  sitemap.xml
  assets/css|js|images/    Shared styles, scripts, images
  pages/                   Intake and payment flow
  tools/                   Interactive scanners and calculators
  guides/                  SEO diagnosis guides
```

Public URLs like `/intake.html` and `/styles.css` are preserved via path aliases in the worker.

## Important Commands

- Syntax check Worker: `node --check src/worker.js`
- Syntax check site JS: `node --check public/assets/js/site.js`
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

## Visual Direction

- VibeFix should feel like a diagnostic lab, case file system, risk scanner, and black box recorder for broken AI-built apps.
- Inspiration from polished product storytelling is fine, but do not copy Twilio layout, colors, assets, or brand patterns.
- Avoid generic AI chatbot visuals, cute robot icons, childish 3D sparkles, crypto-style glow overload, and fake enterprise proof.
- Prefer lightweight CSS transitions/keyframes and small JavaScript state changes.
- Respect `prefers-reduced-motion`.
- Keep mobile cards readable with no horizontal overflow.
- Preserve strong contrast and text labels for risk states; do not rely only on color.

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
- Old checkout provider references remain removed.
- No committed secrets are present.
