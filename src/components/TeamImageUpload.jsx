import { useState, useRef } from 'react'
import { extractTeamNamesWithAI, fileToBase64 } from '../services/aiVision'

const MAX_IMAGES = 10

export default function TeamImageUpload({ onTeamsExtracted, apiKey }) {
  const [uploading, setUploading] = useState(false)
  const [previews, setPreviews] = useState([])
  const [imageFiles, setImageFiles] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files || [])
    if (!newFiles.length) return
    setError('')
    setParsed(null)
    setImageFiles(prev => [...prev, ...newFiles].slice(0, MAX_IMAGES))
    setPreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))].slice(0, MAX_IMAGES))
    if (fileRef.current) fileRef.current.value = ''
  }

  const processImages = async () => {
    if (!imageFiles.length) return
    if (!apiKey) {
      setError('Please set your Gemini API key first.')
      return
    }

    setUploading(true)
    setError('')
    setProgress({ done: 0, total: imageFiles.length })

    try {
      const allNames = []

      for (let i = 0; i < imageFiles.length; i++) {
        const base64 = await fileToBase64(imageFiles[i])
        const teamNames = await extractTeamNamesWithAI(base64, apiKey)

        // teamNames is an array of strings like ["STG ESP", "HOPEESPORT", ...]
        if (Array.isArray(teamNames)) {
          allNames.push(...teamNames)
        }
        setProgress({ done: i + 1, total: imageFiles.length })
      }

      // Deduplicate team names (case-insensitive)
      const seen = new Set()
      const unique = []
      for (const name of allNames) {
        const key = name.trim().toLowerCase()
        if (key && !seen.has(key)) {
          seen.add(key)
          unique.push(name.trim())
        }
      }

      setParsed(unique)
    } catch (err) {
      console.error(err)
      setError(`Failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const updateName = (index, value) => {
    const updated = [...parsed]
    updated[index] = value
    setParsed(updated)
  }

  const removeName = (index) => {
    setParsed(parsed.filter((_, i) => i !== index))
  }

  const addName = () => {
    setParsed([...parsed, ''])
  }

  const applyData = () => {
    if (parsed && parsed.length > 0) {
      const teamNames = parsed.filter(n => n.trim())
      onTeamsExtracted(teamNames)
      setParsed(null)
      setPreviews([])
      setImageFiles([])
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeImage = (index) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
    if (imageFiles.length <= 1 && fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="card">
      <h2>Upload Team Screenshots</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        Upload up to {MAX_IMAGES} screenshots (ranking tables, standings, team lists). AI will extract all team names automatically.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, color: 'var(--text)' }} />
        <button className="btn btn-primary" onClick={processImages} disabled={!imageFiles.length || uploading || !apiKey}>
          {uploading ? `AI Reading... (${progress.done}/${progress.total})` : `Extract from ${imageFiles.length || 0} image${imageFiles.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {!apiKey && (
        <div style={{ background: 'var(--bg-input)', border: '1px solid var(--danger)', borderRadius: 8, padding: 12, marginBottom: 16, color: 'var(--danger)', fontSize: '0.9rem' }}>
          Set your Gemini API key in the Matches tab to enable AI reading.
        </div>
      )}

      {uploading && (
        <div style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
          <div style={{ width: 40, height: 40, border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--primary)', fontWeight: 600 }}>
            AI is reading screenshot {progress.done + 1} of {progress.total}...
          </p>
          <div style={{ background: 'var(--border)', borderRadius: 4, height: 8, maxWidth: 300, margin: '12px auto', overflow: 'hidden' }}>
            <div style={{ background: 'var(--primary)', height: '100%', width: `${(progress.done / progress.total) * 100}%`, transition: 'width 0.3s ease', borderRadius: 4 }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{progress.done} of {progress.total} processed</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {previews.length > 0 && !uploading && !parsed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {previews.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={src} alt={`Screenshot ${i + 1}`}
                style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              <button onClick={() => removeImage(i)}
                style={{
                  position: 'absolute', top: 4, right: 4, background: 'var(--danger)', color: '#fff',
                  border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer',
                  fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>X</button>
              <div style={{
                position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.7)', color: '#fff',
                borderRadius: 4, padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600,
              }}>{i + 1}/{previews.length}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16, fontWeight: 600 }}>{error}</div>}

      {parsed && parsed.length > 0 && (
        <div>
          <h3 style={{ color: 'var(--primary)', marginBottom: 12 }}>
            AI Found {parsed.length} Teams - Verify & Edit
          </h3>
          {parsed.map((name, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', width: 24, textAlign: 'right' }}>{i + 1}.</span>
              <input
                type="text"
                value={name}
                onChange={e => updateName(i, e.target.value)}
                placeholder="Team name"
                style={{ flex: 1 }}
              />
              <button className="btn btn-danger btn-sm" onClick={() => removeName(i)}
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}>X</button>
            </div>
          ))}
          <div className="btn-group" style={{ marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={addName}>+ Add Team</button>
            <button className="btn btn-primary" onClick={applyData}>Add These Teams</button>
            <button className="btn btn-sm" style={{ background: 'var(--border)', color: 'var(--text)' }} onClick={() => setParsed(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}
