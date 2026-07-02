# Stripe Webhook (Cloudflare Worker)

Receives Stripe webhook events and updates user subscriptions in Firestore.
Runs on the Cloudflare Workers **free plan** so the Firebase project can stay
on the free Spark plan. (`functions/` in the repo root is the equivalent
Firebase Cloud Function — only usable if the project ever upgrades to Blaze.
Only ONE of the two should be registered in Stripe.)

## Files

- `src/index.js` — the worker (no npm dependencies)
- `wrangler.toml` — Cloudflare config
- `service-account.json` — Firebase service-account key (**git-ignored, never commit**)
- `.dev.vars` — local secrets for `wrangler dev` (**git-ignored, never commit**)

## Secrets

Set each with `npx wrangler secret put NAME` (run inside this folder):

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys (`sk_test_`/`sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → the endpoint's signing secret (`whsec_`) |
| `STRIPE_MONTHLY_PRICE_ID` | Product catalog → monthly price (`price_...`) |
| `STRIPE_YEARLY_PRICE_ID` | Product catalog → yearly price (`price_...`) |
| `FIREBASE_SERVICE_ACCOUNT` | Entire contents of `service-account.json` |

## Deploy

```
npx wrangler deploy
```

The printed `*.workers.dev` URL is the endpoint to register in
Stripe Dashboard → Developers → Webhooks, with these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## Test locally

```
npx wrangler dev
npx stripe listen --forward-to localhost:8787   # needs Stripe CLI
```
