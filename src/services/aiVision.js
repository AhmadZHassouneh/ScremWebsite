const MATCH_PROMPT = `You are a world-class OCR system specialized in reading PUBG Mobile tournament screenshots with extreme precision.

POSSIBLE FORMATS:
1. Match result screen - teams ranked with players and their eliminations/kills
2. Overall ranking/standings table - columns like #, Team, Win, Pos, Kill, Total
3. Lobby/room screen - team slots with player names
4. Scoreboard - teams and scores in various layouts

YOUR TASK: Extract teams with their position and players with kill counts.

Return valid JSON only (no markdown, no explanation, no code fences):
{"teams":[{"position":1,"players":[{"name":"PlayerName","kills":2}]}]}

CRITICAL RULES FOR READING PLAYER NAMES:
- Zoom into EACH character of EVERY name. Do not skim or guess from partial shapes
- Player names often contain: uppercase/lowercase mix, numbers, underscores, dots, dashes, and unicode characters
- Common PUBG clan tags appear as prefixes: e.g. "WAR·", "STG.", "HiP_", "RA·", etc. Read the FULL name including the tag
- Distinguish carefully between visually similar characters: I/l/1, O/0, S/5, B/8, G/6, Z/2, rn/m, cl/d, VV/W
- If a character is ambiguous, use the context of the surrounding characters and common PUBG naming patterns
- Spaces in names are intentional — do not merge separate words
- Special characters like · (middle dot), ☆, ★, ツ are common in PUBG names — include them exactly

CRITICAL RULES FOR READING NUMBERS:
- CAREFULLY distinguish between similar-looking digits: 0 vs 8, 1 vs 7, 3 vs 8, 5 vs 6, 6 vs 8, 9 vs 8
- Kill counts per player are typically 0-15. If you read >20, re-examine that digit carefully
- Position/rank numbers MUST be sequential (1,2,3...). If you see gaps, re-examine
- For each digit, look at the EXACT shape: 0 is oval/empty center, 8 has pinched middle, 6 has bottom loop, 9 has top loop, 1 is thin/straight, 7 has a horizontal top stroke
- Cross-check: total team kills should roughly equal the sum of individual player kills if both are shown
- Pay attention to column alignment — read numbers from the correct column, not adjacent ones

VERIFICATION STEP:
After reading all data, mentally re-scan each name and number once more. Fix any readings that look wrong.

OTHER RULES:
- Read ALL teams visible in the image (up to 20 teams)
- If no individual kills are shown, use 0
- If the image shows a ranking table without individual players, use the team name as a single player entry
- If position/rank is shown, use that number. Otherwise number them in order starting from 1
- Each team can have up to 4 players
- Return ONLY valid JSON, no markdown, no backticks, no explanation`

const TEAMS_PROMPT = `You are a world-class OCR system specialized in reading PUBG Mobile tournament screenshots with extreme precision.

POSSIBLE FORMATS:
1. Overall ranking/standings table - columns like #, Team, Win, Pos, Kill, Total
2. Match result screen - teams ranked with players and eliminations
3. Lobby/room screen - team slots with player names
4. Tournament bracket or group stage table
5. Team list, roster display, or any screen showing team names
6. Scoreboard with team names and scores

YOUR TASK: Extract ALL team names visible in the image.

Return valid JSON only (no markdown, no explanation, no code fences):
{"teams":["STG ESP","HOPEESPORT","WAR.ESPORTSX1"]}

Rules:
- Read EVERY team name visible in the image, no matter the format
- Read team names EXACTLY as shown, character by character (including dots, spaces, dashes, special characters, clan tags, unicode symbols)
- Zoom into each character and distinguish carefully between: I/l/1, O/0, S/5, B/8, G/6, Z/2, rn/m, VV/W, cl/d
- Include ALL teams even if there are 16 or 20+ teams
- If the image shows player names with clan tags (e.g. "WAR LORD", "STG Player1"), extract the TEAM name (e.g. "WAR", "STG") not individual players
- If teams have full names visible (e.g. "STG ESP", "HOPEESPORT"), use those exact names
- After reading all names, re-verify each one by checking it against the original image
- Do NOT skip any team, read the entire image carefully
- Return ONLY valid JSON, no markdown, no backticks, no explanation`

const LAYOUT_PROMPT = `You are analyzing a tournament ranking template image. Your job is to find the EXACT pixel positions of every data cell where text should be placed.

The image shows a ranking table (possibly split into left and right halves). Each row has cells for: rank number (#), team logo area, team name, and stat columns (like Win, Pos, Kill, Total or similar).

Analyze the image carefully and return the EXACT positions as percentages of the image width and height.

Return valid JSON only (no markdown, no explanation, no code fences):
{
  "imageWidth": 1500,
  "imageHeight": 800,
  "tables": [
    {
      "side": "left",
      "rows": [
        {
          "rank": 1,
          "y": 20.5,
          "height": 5.5,
          "cells": {
            "num": {"x": 5.0, "w": 3.5},
            "logo": {"x": 8.5, "w": 5.0},
            "team": {"x": 13.5, "w": 18.0},
            "stat1": {"x": 31.5, "w": 5.0},
            "stat2": {"x": 36.5, "w": 5.0},
            "stat3": {"x": 41.5, "w": 5.0},
            "stat4": {"x": 46.5, "w": 5.0}
          }
        }
      ]
    }
  ]
}

Rules:
- All x, y, w (width), height values must be PERCENTAGES of the full image dimensions (0-100)
- y is the TOP edge of the row, height is the row's height
- x is the LEFT edge of the cell, w is the cell's width
- Measure positions PRECISELY by looking at the borders/lines/cell boundaries in the image
- Include EVERY data row (not header rows). If there are 8 rows on left and 8 on right, include all 16
- For the right table, x values will be around 50-95%
- stat1, stat2, stat3, stat4 correspond to the stat columns (Win, Pos, Kill, Total or whatever columns exist)
- If a row has a colored/gradient background (like gold for #1), still measure its position
- Look at the actual cell borders, lines, and boundaries in the image to get precise measurements
- Return ONLY valid JSON, no markdown, no backticks`

// Models to try in order (free tier fallbacks).
// Gemini 2.x was retired mid-2026; gemini-3.5-flash is Google's designated
// replacement, with 3-flash-preview and 3.1-flash-lite as free-tier fallbacks.
const MODELS = [
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
]

const MAX_RETRIES = 3
const RETRY_DELAYS = [3000, 6000, 12000] // 3s, 6s, 12s

function isRetryableError(msg) {
  return msg.includes('quota') || msg.includes('429') || msg.includes('limit') ||
    msg.includes('overloaded') || msg.includes('high demand') || msg.includes('503') ||
    msg.includes('temporarily') || msg.includes('try again') || msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('invalid data') || msg.includes('invalid json')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function callWithRetry(base64Data, imageBase64, apiKey, prompt) {
  let lastError = null

  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await callGemini(base64Data, imageBase64, apiKey, model, prompt)
      } catch (err) {
        lastError = err
        const msg = err.message.toLowerCase()

        if (isRetryableError(msg) && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAYS[attempt])
          continue
        }

        // Model unavailable (missing, retired, or restricted) — try the next one
        if (msg.includes('not found') || msg.includes('not supported') ||
          msg.includes('no longer available') || msg.includes('deprecated') ||
          msg.includes('retired')) {
          break
        }

        if (isRetryableError(msg)) {
          break
        }

        throw err
      }
    }
  }

  throw lastError
}

export async function extractMatchDataWithAI(imageBase64, apiKey) {
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  return await callWithRetry(base64Data, imageBase64, apiKey, MATCH_PROMPT)
}

export async function extractTeamNamesWithAI(imageBase64, apiKey) {
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  return await callWithRetry(base64Data, imageBase64, apiKey, TEAMS_PROMPT)
}

export async function analyzeTemplateLayoutWithAI(imageBase64, apiKey) {
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  return await callWithRetry(base64Data, imageBase64, apiKey, LAYOUT_PROMPT)
}

async function callGemini(base64Data, imageBase64, apiKey, model, prompt) {
  // Key goes in a header, not the URL, so it never lands in logs/history
  const urls = [
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
  ]

  let lastErr = null
  for (const url of urls) {
    try {
      return await doFetch(url, base64Data, imageBase64, prompt, apiKey)
    } catch (err) {
      lastErr = err
      if (err.message.includes('not found') || err.message.includes('not supported')) continue
      throw err
    }
  }
  throw lastErr
}

function tryRepairJSON(str) {
  let s = str.replace(/,\s*$/, '')
  s = s.replace(/,\s*"[^"]*$/, '')
  s = s.replace(/"[^"]*$/, '"')

  let openBraces = 0, openBrackets = 0
  let inString = false, escape = false
  for (const ch of s) {
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') openBraces++
    if (ch === '}') openBraces--
    if (ch === '[') openBrackets++
    if (ch === ']') openBrackets--
  }

  s = s.replace(/,\s*$/, '')

  while (openBrackets > 0) { s += ']'; openBrackets-- }
  while (openBraces > 0) { s += '}'; openBraces-- }

  try {
    return JSON.parse(s)
  } catch {
    throw new Error('AI returned invalid data. Please try again.')
  }
}

async function doFetch(url, base64Data, imageBase64, prompt, apiKey) {
  const mimeType = imageBase64.includes('image/png') ? 'image/png' :
    imageBase64.includes('image/webp') ? 'image/webp' : 'image/jpeg'

  // Gemini 3 models run on API defaults: temperature must stay at 1.0 (lower
  // values can cause looping/degraded output) and thinking defaults to high,
  // which suits OCR accuracy. Legacy tuning kept in case a 2.x model returns.
  const generationConfig = {}
  if (/gemini-[12]\./.test(url)) {
    generationConfig.temperature = 0
    generationConfig.maxOutputTokens = 8192
    // Enable thinking for gemini-2.5 models for better accuracy
    if (url.includes('gemini-2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 10000 }
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const msg = errorData.error?.message || `API error: ${response.status}`
    throw new Error(msg)
  }

  const data = await response.json()

  // Extract text from response, skipping any thinking parts
  const parts = data.candidates?.[0]?.content?.parts || []
  const textPart = parts.filter(p => p.text !== undefined && !p.thought).pop()
  const text = textPart?.text
  if (!text) throw new Error('No response from AI')

  let jsonStr = text.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    parsed = tryRepairJSON(jsonStr)
  }
  // Return teams array if present, otherwise return full object (for layout analysis)
  return parsed.teams !== undefined ? parsed.teams : parsed
}

// Enhance image quality for better AI reading - upscale, sharpen, and boost contrast
function enhanceImageForOCR(base64DataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const MIN_WIDTH = 2400
      const needsUpscale = img.width < MIN_WIDTH
      const scale = needsUpscale ? MIN_WIDTH / img.width : 1

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')

      // Use high-quality interpolation
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Apply contrast boost and sharpening via convolution for better text readability
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        // Increase contrast
        const contrast = 1.3
        const intercept = 128 * (1 - contrast)
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, Math.min(255, data[i] * contrast + intercept))
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * contrast + intercept))
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * contrast + intercept))
        }
        ctx.putImageData(imageData, 0, 0)
      } catch {
        // Canvas tainted or other error, proceed without enhancement
      }

      const mimeType = base64DataUrl.includes('image/png') ? 'image/png' : 'image/jpeg'
      const quality = mimeType === 'image/jpeg' ? 0.95 : undefined
      resolve(canvas.toDataURL(mimeType, quality))
    }
    img.onerror = () => resolve(base64DataUrl)
    img.src = base64DataUrl
  })
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const enhanced = await enhanceImageForOCR(reader.result)
        resolve(enhanced)
      } catch {
        resolve(reader.result)
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
