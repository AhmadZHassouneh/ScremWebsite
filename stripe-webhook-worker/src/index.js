/**
 * Stripe webhook -> Firestore subscription sync.
 *
 * Runs on Cloudflare Workers (free plan) instead of Firebase Cloud Functions
 * so the Firebase project can stay on the free Spark plan. Mirrors the logic
 * in functions/index.js (the Blaze alternative).
 *
 * No npm dependencies: Stripe signature verification uses WebCrypto HMAC,
 * Firestore access uses the REST API with a service-account OAuth token.
 *
 * Secrets (set with `npx wrangler secret put NAME`):
 *   STRIPE_SECRET_KEY         sk_test_... / sk_live_...
 *   STRIPE_WEBHOOK_SECRET     whsec_...
 *   STRIPE_MONTHLY_PRICE_ID   price_...
 *   STRIPE_YEARLY_PRICE_ID    price_...
 *   FIREBASE_SERVICE_ACCOUNT  full JSON of the Firebase service-account key
 */

const encoder = new TextEncoder()

// ---------------- Stripe signature verification ----------------

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyStripeSignature(payload, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false
  let t = null
  const v1 = []
  for (const item of header.split(',')) {
    const idx = item.indexOf('=')
    if (idx < 0) continue
    const k = item.slice(0, idx).trim()
    const v = item.slice(idx + 1).trim()
    if (k === 't') t = v
    if (k === 'v1') v1.push(v)
  }
  const ts = parseInt(t, 10)
  if (!ts || Math.abs(nowSec - ts) > toleranceSec) return false
  const expected = await hmacSha256Hex(secret, `${t}.${payload}`)
  let valid = false
  for (const sig of v1) {
    // check every candidate to keep timing independent of match position
    if (timingSafeEqual(sig, expected)) valid = true
  }
  return valid
}

// ---------------- Google OAuth (service account -> access token) ----------------

let cachedToken = null // { token, exp } — survives across requests in a warm isolate

function base64UrlEncode(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signingInput = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signingInput))
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt,
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) }
  return cachedToken.token
}

// ---------------- Firestore REST helpers ----------------

export function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  }
  if (typeof v === 'object') {
    const fields = {}
    for (const [k, val] of Object.entries(v)) fields[k] = fsValue(val)
    return { mapValue: { fields } }
  }
  throw new Error(`Unsupported Firestore value: ${typeof v}`)
}

function firestoreBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
}

/**
 * Patch nested subscription fields on a user document.
 * `docName` is either a full resource name (from a query) or null with `uid` set.
 * Only the paths in `subFields` are touched — stripeCustomerId etc. survive.
 */
async function patchSubscription(projectId, token, { docName, uid }, subFields, replaceWholeMap = false) {
  const name = docName || `${firestoreBase(projectId)}/users/${uid}`
  const url = new URL(name.startsWith('http') ? name : `https://firestore.googleapis.com/v1/${name}`)
  if (replaceWholeMap) {
    url.searchParams.append('updateMask.fieldPaths', 'subscription')
  } else {
    for (const k of Object.keys(subFields)) {
      url.searchParams.append('updateMask.fieldPaths', `subscription.${k}`)
    }
  }
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { subscription: fsValue(subFields) } }),
  })
  if (!res.ok) throw new Error(`Firestore patch failed: ${res.status} ${await res.text()}`)
}

/** Find the user document whose subscription.stripeCustomerId matches. */
async function findUserDocByCustomerId(projectId, token, customerId) {
  const res = await fetch(`${firestoreBase(projectId)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'subscription.stripeCustomerId' },
            op: 'EQUAL',
            value: { stringValue: customerId },
          },
        },
        limit: 1,
      },
    }),
  })
  if (!res.ok) throw new Error(`Firestore query failed: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  const doc = Array.isArray(rows) ? rows.find(r => r.document)?.document : null
  return doc ? doc.name : null
}

// ---------------- Stripe REST helpers ----------------

async function stripeGetSubscription(secretKey, subscriptionId) {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  if (!res.ok) throw new Error(`Stripe API error: ${res.status} ${await res.text()}`)
  return res.json()
}

/** Newer Stripe API versions moved current_period_end onto the items. */
function periodEndIso(sub) {
  const ts = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
  return ts ? new Date(ts * 1000).toISOString() : null
}

function subPriceId(sub) {
  return sub.items?.data?.[0]?.price?.id || ''
}

// ---------------- Event handling ----------------

function makePlanFromPriceId(env) {
  return (priceId) => {
    if (priceId === env.STRIPE_YEARLY_PRICE_ID) return 'pro_yearly'
    if (priceId !== env.STRIPE_MONTHLY_PRICE_ID) {
      console.warn(`Unknown Stripe price id "${priceId}" - defaulting to pro_monthly`)
    }
    return 'pro_monthly'
  }
}

async function handleEvent(event, env, projectId, token) {
  const planFromPriceId = makePlanFromPriceId(env)

  switch (event.type) {
    // User completes checkout - activate subscription
    case 'checkout.session.completed': {
      const session = event.data.object
      const uid = session.client_reference_id
      const subId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id
      if (!uid || !subId) break

      const sub = await stripeGetSubscription(env.STRIPE_SECRET_KEY, subId)
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id

      await patchSubscription(projectId, token, { uid }, {
        plan: planFromPriceId(subPriceId(sub)),
        status: 'active',
        stripeCustomerId: customerId || '',
        stripeSubscriptionId: subId,
        currentPeriodEnd: periodEndIso(sub),
        updatedAt: new Date().toISOString(),
      }, true)
      console.log(`Activated subscription for user ${uid}`)
      break
    }

    // Subscription renewed, plan changed, or cancellation scheduled
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const docName = await findUserDocByCustomerId(projectId, token, sub.customer)
      if (!docName) break

      const status = sub.cancel_at_period_end
        ? 'canceled'
        : sub.status === 'active' ? 'active' : sub.status

      await patchSubscription(projectId, token, { docName }, {
        plan: planFromPriceId(subPriceId(sub)),
        status,
        currentPeriodEnd: periodEndIso(sub),
        updatedAt: new Date().toISOString(),
      })
      console.log(`Updated subscription for ${docName} (${status})`)
      break
    }

    // Subscription canceled/expired
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const docName = await findUserDocByCustomerId(projectId, token, sub.customer)
      if (!docName) break

      await patchSubscription(projectId, token, { docName }, {
        plan: 'free',
        status: 'expired',
        updatedAt: new Date().toISOString(),
      })
      console.log(`Subscription expired for ${docName}`)
      break
    }

    // Payment failed on renewal
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
      if (!customerId) break
      const docName = await findUserDocByCustomerId(projectId, token, customerId)
      if (!docName) break

      await patchSubscription(projectId, token, { docName }, {
        status: 'past_due',
        updatedAt: new Date().toISOString(),
      })
      console.log(`Payment failed for ${docName}`)
      break
    }
  }
}

// ---------------- Worker entry ----------------

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'FIREBASE_SERVICE_ACCOUNT']
      .filter(k => !env[k])
    if (missing.length) {
      console.error('Missing secrets:', missing.join(', '))
      return new Response('Webhook not configured', { status: 500 })
    }

    const payload = await request.text()
    const signature = request.headers.get('stripe-signature')
    const valid = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET)
    if (!valid) {
      return new Response('Invalid signature', { status: 400 })
    }

    let event
    try {
      event = JSON.parse(payload)
    } catch {
      return new Response('Invalid payload', { status: 400 })
    }

    try {
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
      const token = await getAccessToken(serviceAccount)
      await handleEvent(event, env, serviceAccount.project_id, token)
      return Response.json({ received: true })
    } catch (err) {
      console.error('Error processing webhook:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  },
}
