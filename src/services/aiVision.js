const MATCH_PROMPT = `You are a precise data extraction system analyzing a PUBG Mobile tournament screenshot.

POSSIBLE FORMATS:
1. Match result screen - teams ranked with players and their eliminations/kills
2. Overall ranking/standings table - columns like #, Team, Win, Pos, Kill, Total
3. Lobby/room screen - team slots with player names
4. Scoreboard - teams and scores in various layouts

YOUR TASK: Extract teams with their position and players with kill counts.

Return valid JSON only (no markdown, no explanation, no code fences):
{"teams":[{"position":1,"players":[{"name":"PlayerName","kills":2}]}]}

CRITICAL RULES FOR READING NUMBERS ACCURATELY:
- CAREFULLY distinguish between similar-looking digits: 0 vs 8, 1 vs 7, 3 vs 8, 5 vs 6, 6 vs 8
- Kill counts in PUBG are typically small numbers (0-15 range per player). If you read a very high number, double-check it
- Look at the EXACT digit shape: 0 has an empty center, 8 has a pinched middle, 6 has a bottom loop, 9 has a top loop
- For each number you read, verify it by looking at the pixel patterns carefully. Do NOT guess
- Position/rank numbers should be sequential (1,2,3...) - if you see gaps, re-examine the image
- Pay attention to the column alignment - make sure you're reading the number from the correct column, not an adjacent one

OTHER RULES:
- Read ALL teams visible in the image (up to 20 teams)
- Read player names EXACTLY as shown (including special characters, clan tags like WAR, HiP, STG, etc.)
- If no individual kills are shown, use 0
- If the image shows a ranking table without individual players, use the team name as a single player entry
- If position/rank is shown, use that number. Otherwise number them in order starting from 1
- Each team can have up to 4 players
- Return ONLY valid JSON, no markdown, no backticks, no explanation`

const TEAMS_PROMPT = `You are a precise data extraction system analyzing a PUBG Mobile tournament screenshot.

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
- Read team names EXACTLY as shown (including dots, spaces, dashes, special characters, clan tags)
- Pay careful attention to each character - distinguish between similar letters (I vs l, O vs 0, S vs 5)
- Include ALL teams even if there are 16 or 20+ teams
- If the image shows player names with clan tags (e.g. "WAR LORD", "STG Player1"), extract the TEAM name (e.g. "WAR", "STG") not individual players
- If teams have full names visible (e.g. "STG ESP", "HOPEESPORT"), use those exact names
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

// Models to try in order (free tier fallbacks)
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
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

        if (msg.includes('not found') || msg.includes('not supported')) {
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
  const urls = [
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
  ]

  let lastErr = null
  for (const url of urls) {
    try {
      return await doFetch(url, base64Data, imageBase64, prompt)
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

async function doFetch(url, base64Data, imageBase64, prompt) {
  const mimeType = imageBase64.includes('image/png') ? 'image/png' :
    imageBase64.includes('image/webp') ? 'image/webp' : 'image/jpeg'

  const generationConfig = {
    temperature: 0,
    maxOutputTokens: 8192,
  }

  // Enable thinking for gemini-2.5 models for better accuracy
  if (url.includes('gemini-2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 1024 }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

// Enhance image quality for better AI reading - upscale small images and sharpen
function enhanceImageForOCR(base64DataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const MIN_WIDTH = 1920
      // Only upscale if the image is too small
      if (img.width >= MIN_WIDTH) {
        resolve(base64DataUrl)
        return
      }

      const scale = MIN_WIDTH / img.width
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')

      // Use high-quality interpolation
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const mimeType = base64DataUrl.includes('image/png') ? 'image/png' : 'image/jpeg'
      const quality = mimeType === 'image/jpeg' ? 0.95 : undefined
      resolve(canvas.toDataURL(mimeType, quality))
    }
    img.onerror = () => resolve(base64DataUrl) // fallback to original on error
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
