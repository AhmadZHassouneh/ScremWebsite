# Paddle webhook worker

Syncs Paddle subscription events into Firestore (`users/{uid}.subscription`) so
the app can gate Pro features. Replaces `stripe-webhook-worker/` (Stripe does
not support businesses in Jordan; Paddle acts as merchant of record).

Deployed at: `https://screm-paddle-webhook.scremwebsite.workers.dev`

## Secrets

Set with `npx wrangler secret put NAME` from this directory:

| Secret | Value |
| --- | --- |
| `PADDLE_WEBHOOK_SECRET` | `pdl_ntfset_...` from the notification destination |
| `PADDLE_MONTHLY_PRICE_ID` | `pri_...` of the $5/month price |
| `PADDLE_YEARLY_PRICE_ID` | `pri_...` of the $48/year price |
| `FIREBASE_SERVICE_ACCOUNT` | full JSON of the Firebase service-account key (already set) |

## Paddle dashboard setup

1. Catalog → create product "Screm Pro" with two recurring prices ($5 monthly,
   $48 yearly). Note the two `pri_...` ids.
2. Developer tools → Notifications → new destination:
   - URL: `https://screm-paddle-webhook.scremwebsite.workers.dev`
   - Events: `subscription.activated`, `subscription.trialing`,
     `subscription.updated`, `subscription.resumed`, `subscription.canceled`,
     `subscription.past_due`
   - Copy the endpoint secret key into `PADDLE_WEBHOOK_SECRET`.
3. Developer tools → Authentication → create a client-side token; put it in the
   site's `.env` as `VITE_PADDLE_CLIENT_TOKEN` together with the price ids.
4. Checkout settings → set the default payment link to
   `https://scremwebsite.web.app` (domain must be approved for live mode).

## Event → Firestore mapping

| Paddle event | subscription fields written |
| --- | --- |
| `subscription.activated` / `trialing` / `resumed` | whole map: plan, status `active`, paddleCustomerId, paddleSubscriptionId, currentPeriodEnd |
| `subscription.updated` | plan/status/currentPeriodEnd (scheduled cancel → status `canceled`, Pro kept until period end by the client) |
| `subscription.canceled` | plan `free`, status `expired` |
| `subscription.past_due` | status `past_due` |

The user document is found via `custom_data.uid` (set by the checkout in
`SubscriptionPanel.jsx`), falling back to a query on
`subscription.paddleCustomerId`.

## Deploy

```
npx wrangler deploy
```
