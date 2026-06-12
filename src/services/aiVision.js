const MATCH_PROMPT = `You are analyzing a PUBG Mobile screenshot. The image could be in ANY format:

POSSIBLE FORMATS:
1. Match result screen - shows teams ranked with players and their eliminations/kills
2. Overall ranking/standings table - shows teams with columns like #, Team, Win, Pos, Kill, Total
3. Lobby/room screen - shows team slots with player names
4. Scoreboard - shows teams and scores in various layouts
5. Any other PUBG tournament screenshot showing teams and players

YOUR TASK: Extract teams with their position and players with kill counts.

Return valid JSON only (no markdown, no explanation, no code fences):
{"teams":[{"position":1,"players":[{"name":"PlayerName","kills":2}]}]}

Rules:
- Read ALL teams visible in the image (up to 20 teams)
- Read player names EXACTLY as shown (including special characters, clan tags like WAR, HiP, STG, etc.)
- Read kill/elimination counts exactly. If no individual kills are shown, use 0
- If the image shows a ranking table without individual players, use the team name as a single player entry
- If position/rank is shown, use that number. Otherwise number them in order starting from 1
- Each team can have up to 4 players
- Return ONLY valid JSON, no markdown, no backticks, no explanation`

const TEAMS_PROMPT = `You are analyzing a PUBG Mobile screenshot. The image could be in ANY format:

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
  'gemini-2.0-flash-lite',
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
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: imageBase64.includes('image/png') ? 'image/png' : 'image/jpeg',
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const msg = errorData.error?.message || `API error: ${response.status}`
    throw new Error(msg)
  }

  const data = await response.json()

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
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

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
