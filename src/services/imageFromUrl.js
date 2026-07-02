const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB
const FETCH_TIMEOUT = 15000 // 15 seconds

export async function fetchImageFromUrl(url) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Only secure (HTTPS) image URLs are allowed.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`)

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    throw new Error('URL does not point to an image.')
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
  if (contentLength > MAX_IMAGE_SIZE) {
    throw new Error('Image too large (max 20MB).')
  }

  const blob = await res.blob()
  if (blob.size > MAX_IMAGE_SIZE) {
    throw new Error('Image too large (max 20MB).')
  }

  const ext = contentType.split('/')[1]?.split(';')[0] || 'png'
  return new File([blob], `pasted-image.${ext}`, { type: blob.type })
}

export function extractUrl(text) {
  const trimmed = text.trim()
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return trimmed
  } catch { /* not a valid URL */ }
  return null
}
