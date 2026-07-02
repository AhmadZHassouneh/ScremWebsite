/**
 * Paddle webhook -> Firestore subscription sync.
 *
 * Paddle is the merchant of record (Stripe does not support businesses in
 * Jordan). Runs on Cloudflare Workers (free plan) so the Firebase project can
 * stay on the free Spark plan. Mirrors stripe-webhook-worker/src/index.js.
 *
 * No npm dependencies: Paddle signature verification uses WebCrypto HMAC,
 * Firestore access uses the REST API with a service-account OAuth token.
 *
 * Secrets (set with `npx wrangler secret put NAME`):
 *   PADDLE_WEBHOOK_SECRET     pdl_ntfset_... (notification destination secret)
 *   PADDLE_MONTHLY_PRICE_ID   pri_...
 *   PADDLE_YEARLY_PRICE_ID    pri_...
 *   FIREBASE_SERVICE_ACCOUNT  full JSON of the Firebase service-account key
 */

const encoder = new TextEncoder()

// ---------------- Paddle signature verification ----------------

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

/**
 * Paddle-Signature header: `ts=1671552777;h1=abc123...`
 * Signed payload is `${ts}:${rawBody}`. Multiple h1 entries are possible
 * while a destination secret is being rotated.
 */
export async function verifyPaddleSignature(payload, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false
  let t = null
  const h1 = []
  for (const item of header.split(';')) {
    const idx = item.indexOf('=')
    if (idx < 0) continue
    const k = item.slice(0, idx).trim()
    const v = item.slice(idx + 1).trim()
    if (k === 'ts') t = v
    if (k === 'h1') h1.push(v)
  }
  const ts = parseInt(t, 10)
  if (!ts || Math.abs(nowSec - ts) > toleranceSec) return false
  const expected = await hmacSha256Hex(secret, `${t}:${payload}`)
  let valid = false
  for (const sig of h1) {
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
 * Only the paths in `subFields` are touched unless `replaceWholeMap` is set.
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

/** Find the user document whose subscription.paddleCustomerId matches. */
async function findUserDocByCustomerId(projectId, token, customerId) {
  const res = await fetch(`${firestoreBase(projectId)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'subscription.paddleCustomerId' },
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

// ---------------- Event handling ----------------

function makePlanFromPriceId(env) {
  return (priceId) => {
    if (priceId === env.PADDLE_YEARLY_PRICE_ID) return 'pro_yearly'
    if (priceId !== env.PADDLE_MONTHLY_PRICE_ID) {
      console.warn(`Unknown Paddle price id "${priceId}" - defaulting to pro_monthly`)
    }
    return 'pro_monthly'
  }
}

function subPriceId(data) {
  return data.items?.[0]?.price?.id || ''
}

function periodEndIso(data) {
  return data.current_billing_period?.ends_at || null
}

/**
 * Prefer the uid we set as checkout custom data (Paddle copies it onto the
 * subscription); fall back to the stored Paddle customer id.
 */
async function resolveTarget(projectId, token, data) {
  const uid = data.custom_data?.uid
  if (uid) return { uid }
  if (!data.customer_id) return null
  const docName = await findUserDocByCustomerId(projectId, token, data.customer_id)
  return docName ? { docName } : null
}

async function handleEvent(event, env, projectId, token) {
  const planFromPriceId = makePlanFromPriceId(env)
  const data = event.data || {}

  switch (event.event_type) {
    // Checkout completed (or a paused/canceled subscription resumed)
    case 'subscription.activated':
    case 'subscription.resumed': {
      const target = await resolveTarget(projectId, token, data)
      if (!target) break

      await patchSubscription(projectId, token, target, {
        plan: planFromPriceId(subPriceId(data)),
        status: 'active',
        paddleCustomerId: data.customer_id || '',
        paddleSubscriptionId: data.id || '',
        currentPeriodEnd: periodEndIso(data),
        updatedAt: new Date().toISOString(),
      }, true)
      console.log(`Activated subscription for ${JSON.stringify(target)}`)
      break
    }

    // Renewal, plan change, or cancellation scheduled/unscheduled.
    // A scheduled cancel keeps status 'canceled' with currentPeriodEnd in the
    // future - the client grants Pro until that date (canceledButPaid).
    case 'subscription.updated': {
      const target = await resolveTarget(projectId, token, data)
      if (!target) break

      const status = data.scheduled_change?.action === 'cancel'
        ? 'canceled'
        : data.status === 'active' ? 'active' : data.status

      await patchSubscription(projectId, token, target, {
        plan: planFromPriceId(subPriceId(data)),
        status,
        paddleCustomerId: data.customer_id || '',
        paddleSubscriptionId: data.id || '',
        currentPeriodEnd: periodEndIso(data),
        updatedAt: new Date().toISOString(),
      })
      console.log(`Updated subscription for ${JSON.stringify(target)} (${status})`)
      break
    }

    // Subscription fully ended
    case 'subscription.canceled': {
      const target = await resolveTarget(projectId, token, data)
      if (!target) break

      await patchSubscription(projectId, token, target, {
        plan: 'free',
        status: 'expired',
        updatedAt: new Date().toISOString(),
      })
      console.log(`Subscription expired for ${JSON.stringify(target)}`)
      break
    }

    // Renewal payment failed
    case 'subscription.past_due': {
      const target = await resolveTarget(projectId, token, data)
      if (!target) break

      await patchSubscription(projectId, token, target, {
        status: 'past_due',
        updatedAt: new Date().toISOString(),
      })
      console.log(`Payment failed for ${JSON.stringify(target)}`)
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

    const missing = ['PADDLE_WEBHOOK_SECRET', 'FIREBASE_SERVICE_ACCOUNT']
      .filter(k => !env[k])
    if (missing.length) {
      console.error('Missing secrets:', missing.join(', '))
      return new Response('Webhook not configured', { status: 500 })
    }

    const payload = await request.text()
    const signature = request.headers.get('paddle-signature')
    const valid = await verifyPaddleSignature(payload, signature, env.PADDLE_WEBHOOK_SECRET)
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
