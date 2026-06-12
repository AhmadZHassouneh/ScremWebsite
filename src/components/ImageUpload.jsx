import { useState, useRef } from 'react'
import { extractMatchDataWithAI, fileToBase64 } from '../services/aiVision'

const MAX_IMAGES = 10

export default function ImageUpload({ onDataExtracted, teams, apiKey }) {
  const [uploading, setUploading] = useState(false)
  const [previews, setPreviews] = useState([])
  const [imageFiles, setImageFiles] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [editableParsed, setEditableParsed] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files || [])
    if (!newFiles.length) return
    setError('')
    setEditableParsed(null)
    setImageFiles(prev => {
      const combined = [...prev, ...newFiles].slice(0, MAX_IMAGES)
      return combined
    })
    setPreviews(prev => {
      const newPreviews = newFiles.map(f => URL.createObjectURL(f))
      return [...prev, ...newPreviews].slice(0, MAX_IMAGES)
    })
    // Reset input so the same file can be selected again
    if (fileRef.current) fileRef.current.value = ''
  }

  const deduplicateTeams = (allTeamGroups) => {
    const unique = []
    for (const group of allTeamGroups) {
      // Check if a team with the same position already exists
      const existingByPos = unique.find(u => u.position === group.position)
      if (existingByPos) {
        // Check player name overlap to confirm it's the same team
        const existingNames = existingByPos.players.map(p => p.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
        const newNames = group.players.map(p => p.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
        const overlap = newNames.filter(n => n && existingNames.some(e => e && (e.includes(n) || n.includes(e))))
        if (overlap.length > 0) {
          // Same team, skip duplicate
          continue
        }
      }

      // Also check by player names across all positions (team might appear with different position in different screenshots)
      const isDuplicate = unique.some(u => {
        const existingNames = u.players.map(p => p.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
        const newNames = group.players.map(p => p.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
        const matchCount = newNames.filter(n => n && existingNames.some(e => e && (e.includes(n) || n.includes(e)))).length
        return matchCount >= 2 // At least 2 matching players = same team
      })

      if (!isDuplicate) {
        unique.push(group)
      }
    }
    return unique.sort((a, b) => a.position - b.position)
  }

  const processImages = async () => {
    if (!imageFiles.length) return
    if (!apiKey) {
      setError('Please set your Gemini API key first (above).')
      return
    }

    setUploading(true)
    setError('')
    setProgress({ done: 0, total: imageFiles.length })

    try {
      const allTeamGroups = []

      for (let i = 0; i < imageFiles.length; i++) {
        const base64 = await fileToBase64(imageFiles[i])
        const teamsData = await extractMatchDataWithAI(base64, apiKey)

        const groups = teamsData.map(t => ({
          position: t.position,
          players: (t.players || []).slice(0, 4).map(p => ({
            name: p.name || '',
            kills: p.kills || 0,
          })),
        })).slice(0, 5)

        allTeamGroups.push(...groups)
        setProgress({ done: i + 1, total: imageFiles.length })
      }

      // Deduplicate teams across all screenshots
      const uniqueTeams = deduplicateTeams(allTeamGroups)

      const data = {
        entries: uniqueTeams.flatMap(g => g.players.map(p => ({ ...p, position: g.position }))),
        teamGroups: uniqueTeams,
      }

      setEditableParsed(JSON.parse(JSON.stringify(data)))
    } catch (err) {
      console.error(err)
      if (err.message.includes('API_KEY') || err.message.includes('401') || err.message.includes('auth')) {
        setError('Invalid API key. Please check your Google Gemini API key.')
      } else {
        setError(`Failed: ${err.message}`)
      }
    } finally {
      setUploading(false)
    }
  }

  const updatePlayerName = (gi, pi, value) => {
    const updated = JSON.parse(JSON.stringify(editableParsed))
    updated.teamGroups[gi].players[pi].name = value
    setEditableParsed(updated)
  }

  const updatePlayerKills = (gi, pi, value) => {
    const updated = JSON.parse(JSON.stringify(editableParsed))
    updated.teamGroups[gi].players[pi].kills = parseInt(value) || 0
    setEditableParsed(updated)
  }

  const updateGroupPosition = (gi, value) => {
    const updated = JSON.parse(JSON.stringify(editableParsed))
    updated.teamGroups[gi].position = parseInt(value) || 0
    setEditableParsed(updated)
  }

  const addPlayer = (gi) => {
    const updated = JSON.parse(JSON.stringify(editableParsed))
    if (updated.teamGroups[gi].players.length >= 4) return
    updated.teamGroups[gi].players.push({ name: '', kills: 0 })
    setEditableParsed(updated)
  }

  const removePlayer = (gi, pi) => {
    const updated = JSON.parse(JSON.stringify(editableParsed))
    updated.teamGroups[gi].players.splice(pi, 1)
    setEditableParsed(updated)
  }

  const addGroup = () => {
    const updated = JSON.parse(JSON.stringify(editableParsed))
    const nextPos = Math.max(0, ...updated.teamGroups.map(g => g.position)) + 1
    updated.teamGroups.push({ position: nextPos, players: [{ name: '', kills: 0 }] })
    setEditableParsed(updated)
  }

  const removeGroup = (gi) => {
    const updated = JSON.parse(JSON.stringify(editableParsed))
    updated.teamGroups.splice(gi, 1)
    setEditableParsed(updated)
  }

  const applyData = () => {
    if (editableParsed) {
      onDataExtracted(editableParsed)
      setEditableParsed(null)
      setPreviews([])
      setImageFiles([])
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeImage = (index) => {
    const newFiles = imageFiles.filter((_, i) => i !== index)
    const newPreviews = previews.filter((_, i) => i !== index)
    setImageFiles(newFiles)
    setPreviews(newPreviews)
    if (newFiles.length === 0 && fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="card">
      <h2>Upload Match Screenshots</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        Upload up to {MAX_IMAGES} PUBG match result screenshots. AI will read all teams, deduplicate, and merge results automatically.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 8,
            color: 'var(--text)',
          }}
        />
        <button
          className="btn btn-primary"
          onClick={processImages}
          disabled={!imageFiles.length || uploading || !apiKey}
        >
          {uploading ? `AI Reading... (${progress.done}/${progress.total})` : `Extract from ${imageFiles.length || 0} image${imageFiles.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {!apiKey && (
        <div style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--danger)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          color: 'var(--danger)',
          fontSize: '0.9rem',
        }}>
          Set your Gemini API key at the top of this page to enable AI image reading.
        </div>
      )}

      {uploading && (
        <div style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
          <div style={{
            width: 40, height: 40,
            border: '4px solid var(--border)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px',
          }} />
          <p style={{ color: 'var(--primary)', fontWeight: 600 }}>
            AI is reading screenshot {progress.done + 1} of {progress.total}...
          </p>
          <div style={{
            background: 'var(--border)',
            borderRadius: 4,
            height: 8,
            maxWidth: 300,
            margin: '12px auto',
            overflow: 'hidden',
          }}>
            <div style={{
              background: 'var(--primary)',
              height: '100%',
              width: `${(progress.done / progress.total) * 100}%`,
              transition: 'width 0.3s ease',
              borderRadius: 4,
            }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {progress.done} of {progress.total} processed
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {previews.length > 0 && !uploading && !editableParsed && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}>
          {previews.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={src}
                alt={`Screenshot ${i + 1}`}
                style={{
                  width: '100%',
                  height: 120,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              />
              <button
                onClick={() => removeImage(i)}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: 'var(--danger)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 22,
                  height: 22,
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                X
              </button>
              <div style={{
                position: 'absolute',
                bottom: 4,
                left: 4,
                background: 'rgba(0,0,0,0.7)',
                color: '#fff',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}>
                {i + 1}/{previews.length}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger)', marginBottom: 16, fontWeight: 600 }}>{error}</div>
      )}

      {editableParsed && editableParsed.teamGroups.length > 0 && (
        <div>
          <h3 style={{ color: 'var(--primary)', marginBottom: 4 }}>
            AI Extracted {editableParsed.teamGroups.length} Unique Teams from {imageFiles.length} Screenshots - Verify & Edit
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
            Duplicate teams have been automatically removed. Review the data below.
          </p>

          {editableParsed.teamGroups.map((group, gi) => (
            <div key={gi} style={{
              background: 'var(--bg-input)',
              padding: 16,
              borderRadius: 8,
              marginBottom: 12,
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>POS:</label>
                  <input
                    type="number" min="1" max="20"
                    value={group.position}
                    onChange={e => updateGroupPosition(gi, e.target.value)}
                    style={{ width: 60 }}
                  />
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                    #{group.position} ({group.players.length} players)
                  </span>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => removeGroup(gi)}>Remove Team</button>
              </div>

              {group.players.map((player, pi) => (
                <div key={pi} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', width: 20 }}>{pi + 1}.</span>
                  <input
                    type="text"
                    value={player.name}
                    onChange={e => updatePlayerName(gi, pi, e.target.value)}
                    placeholder="Player name"
                    style={{ flex: 1 }}
                  />
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Kills:</label>
                  <input
                    type="number" min="0"
                    value={player.kills}
                    onChange={e => updatePlayerKills(gi, pi, e.target.value)}
                    style={{ width: 60 }}
                  />
                  <button className="btn btn-danger btn-sm" onClick={() => removePlayer(gi, pi)}>X</button>
                </div>
              ))}

              {group.players.length < 4 && (
                <button className="btn btn-sm btn-primary" onClick={() => addPlayer(gi)} style={{ marginTop: 8 }}>
                  + Add Player
                </button>
              )}
            </div>
          ))}

          <div className="btn-group" style={{ marginTop: 16 }}>
            <button className="btn btn-sm btn-primary" onClick={addGroup}>+ Add Team</button>
            <button className="btn btn-primary" onClick={applyData}>Apply to Match</button>
            <button className="btn btn-sm" style={{ background: 'var(--border)', color: 'var(--text)' }}
              onClick={() => { setEditableParsed(null) }}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
