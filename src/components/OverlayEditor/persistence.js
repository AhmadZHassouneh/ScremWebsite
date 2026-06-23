import { openDB } from 'idb'

const DB_NAME = 'overlay-editor'
const DB_VERSION = 1
const STORE = 'configs'

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    },
  })
}

/**
 * Convert a blob URL to an actual Blob for storage.
 * Blob URLs are session-scoped and can't survive a page reload.
 */
async function blobUrlToBlob(blobUrl) {
  const res = await fetch(blobUrl)
  return res.blob()
}

/**
 * Save the current editor state to IndexedDB.
 *
 * Converts in-memory blob URLs → Blobs so they persist across sessions.
 * Stored shape: { id, name, savedAt, background: { blob, fileName }, teams: [...] }
 */
export async function saveConfig({ id, name, backgroundSrc, bgFileName, teams }) {
  const bgBlob = backgroundSrc ? await blobUrlToBlob(backgroundSrc) : null

  const storedTeams = await Promise.all(
    teams.map(async (t) => ({
      id: t.id,
      name: t.name,
      logoBlob: t.logoSrc ? await blobUrlToBlob(t.logoSrc) : null,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      style: { ...t.style },
    }))
  )

  const record = {
    id,
    name,
    savedAt: Date.now(),
    background: bgBlob ? { blob: bgBlob, fileName: bgFileName } : null,
    teams: storedTeams,
  }

  const db = await getDb()
  await db.put(STORE, record)
  return record
}

/**
 * Load a config from IndexedDB and convert stored Blobs back to blob URLs.
 *
 * Returns: { id, name, backgroundSrc, bgFileName, teams: [{ ...team, logoSrc }] }
 */
export async function loadConfig(id) {
  const db = await getDb()
  const record = await db.get(STORE, id)
  if (!record) return null

  const backgroundSrc = record.background?.blob
    ? URL.createObjectURL(record.background.blob)
    : null
  const bgFileName = record.background?.fileName || ''

  const teams = record.teams.map((t) => ({
    id: t.id,
    name: t.name,
    logoSrc: t.logoBlob ? URL.createObjectURL(t.logoBlob) : null,
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    style: { ...t.style },
  }))

  return { id: record.id, name: record.name, backgroundSrc, bgFileName, teams }
}

/** List all saved configs (metadata only — no heavy blob loading). */
export async function listConfigs() {
  const db = await getDb()
  const all = await db.getAll(STORE)
  return all.map((r) => ({
    id: r.id,
    name: r.name,
    savedAt: r.savedAt,
    teamCount: r.teams.length,
    hasBackground: !!r.background,
  }))
}

/** Delete a saved config by id. */
export async function deleteConfig(id) {
  const db = await getDb()
  await db.delete(STORE, id)
}
