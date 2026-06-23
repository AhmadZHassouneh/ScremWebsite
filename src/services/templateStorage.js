import { openDB } from 'idb'

const DB_NAME = 'template-designs'
const DB_VERSION = 1
const STORE = 'templates'

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    },
  })
}

async function blobUrlToBlob(blobUrl) {
  const res = await fetch(blobUrl)
  return res.blob()
}

export async function saveTemplate({ id, name, bgBlobUrl, rows, cellPositions, fontSize, fontColor, fontFamily }) {
  const bgBlob = bgBlobUrl ? await blobUrlToBlob(bgBlobUrl) : null
  const record = {
    id,
    name,
    savedAt: Date.now(),
    bgBlob,
    rows: rows.map(r => ({
      ...r,
      logoBlob: null, // logos handled separately if needed
      logoPreview: null,
    })),
    cellPositions,
    fontSize,
    fontColor,
    fontFamily,
  }

  const db = await getDb()
  await db.put(STORE, record)
  return record
}

export async function loadTemplate(id) {
  const db = await getDb()
  const record = await db.get(STORE, id)
  if (!record) return null

  const bgImage = record.bgBlob ? URL.createObjectURL(record.bgBlob) : null

  return {
    id: record.id,
    name: record.name,
    bgImage,
    rows: record.rows,
    cellPositions: record.cellPositions,
    fontSize: record.fontSize,
    fontColor: record.fontColor,
    fontFamily: record.fontFamily,
  }
}

export async function listTemplates() {
  const db = await getDb()
  const all = await db.getAll(STORE)
  return all.map(r => ({
    id: r.id,
    name: r.name,
    savedAt: r.savedAt,
    hasPositions: !!r.cellPositions,
    rowCount: r.rows?.length || 0,
  })).sort((a, b) => b.savedAt - a.savedAt)
}

export async function deleteTemplate(id) {
  const db = await getDb()
  await db.delete(STORE, id)
}
