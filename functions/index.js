const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

let _stripe;
function getStripe() {
  if (!_stripe) {
    const Stripe = require("stripe");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID || "";
const YEARLY_PRICE_ID = process.env.STRIPE_YEARLY_PRICE_ID || "";

function planFromPriceId(priceId) {
  if (priceId === YEARLY_PRICE_ID) return "pro_yearly";
  if (priceId !== MONTHLY_PRICE_ID) {
    console.warn(`Unknown Stripe price id "${priceId}" - defaulting to pro_monthly`);
  }
  return "pro_monthly";
}

async function findUserByCustomerId(customerId) {
  const snapshot = await db
    .collection("users")
    .where("subscription.stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0];
}

exports.stripeWebhook = onRequest(
  { cors: false, region: "us-central1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      res.status(500).send("Webhook secret not configured");
      return;
    }

    // Verify webhook signature
    let event;
    try {
      const sig = req.headers["stripe-signature"];
      if (!sig) {
        res.status(400).send("Missing stripe-signature header");
        return;
      }
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        // User completes checkout - activate subscription
        case "checkout.session.completed": {
          const session = event.data.object;
          const uid = session.client_reference_id;
          if (!uid || !session.subscription) break;

          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const priceId = sub.items.data[0]?.price?.id || "";

          await db.doc(`users/${uid}`).set(
            {
              subscription: {
                plan: planFromPriceId(priceId),
                status: "active",
                stripeCustomerId: session.customer,
                stripeSubscriptionId: session.subscription,
                currentPeriodEnd: new Date(
                  sub.current_period_end * 1000
                ).toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
            { merge: true }
          );
          console.log(`Activated ${planFromPriceId(priceId)} for user ${uid}`);
          break;
        }

        // Subscription renewed or plan changed
        case "customer.subscription.updated": {
          const sub = event.data.object;
          const userDoc = await findUserByCustomerId(sub.customer);
          if (!userDoc) break;

          const priceId = sub.items.data[0]?.price?.id || "";
          const status = sub.cancel_at_period_end
            ? "canceled"
            : sub.status === "active"
              ? "active"
              : sub.status;

          await userDoc.ref.update({
            "subscription.plan": planFromPriceId(priceId),
            "subscription.status": status,
            "subscription.currentPeriodEnd": new Date(
              sub.current_period_end * 1000
            ).toISOString(),
            "subscription.updatedAt": new Date().toISOString(),
          });
          console.log(
            `Updated subscription for ${userDoc.id}: ${planFromPriceId(priceId)} (${status})`
          );
          break;
        }

        // Subscription canceled/expired
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const userDoc = await findUserByCustomerId(sub.customer);
          if (!userDoc) break;

          await userDoc.ref.update({
            "subscription.plan": "free",
            "subscription.status": "expired",
            "subscription.updatedAt": new Date().toISOString(),
          });
          console.log(`Subscription expired for ${userDoc.id}`);
          break;
        }

        // Payment failed on renewal
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const userDoc = await findUserByCustomerId(invoice.customer);
          if (!userDoc) break;

          await userDoc.ref.update({
            "subscription.status": "past_due",
            "subscription.updatedAt": new Date().toISOString(),
          });
          console.log(`Payment failed for ${userDoc.id}`);
          break;
        }
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("Error processing webhook:", err);
      res.status(500).send("Internal Server Error");
    }
  }
);
