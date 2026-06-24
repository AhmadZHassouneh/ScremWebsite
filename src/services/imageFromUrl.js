export async function fetchImageFromUrl(url) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Only secure (HTTPS) image URLs are allowed.')
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`)

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    throw new Error('URL does not point to an image.')
  }

  const blob = await res.blob()
  const ext = contentType.split('/')[1]?.split(';')[0] || 'png'
  return new File([blob], `pasted-image.${ext}`, { type: blob.type })
}

export function extractUrl(text) {
  const trimmed = text.trim()
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:' || url.protocol === 'http:') return trimmed
  } catch {}
  return null
}
