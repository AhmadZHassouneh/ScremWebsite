import { useState, useRef } from 'react'
import { analyzeTemplateLayoutWithAI, fileToBase64 } from '../services/aiVision'

const DEFAULT_ROWS = 16

const emptyRow = () => ({ logo: null, logoPreview: null, team: '', win: '', pos: '', kill: '', total: '' })
const createRows = (count) => Array.from({ length: count }, () => emptyRow())

export default function DesignPanel({ rankings, apiKey }) {
  const [bgImage, setBgImage] = useState(null)
  const [bgFile, setBgFile] = useState(null)
  const [rows, setRows] = useState(createRows(DEFAULT_ROWS))
  const [fontSize, setFontSize] = useState(1.4)
  const [fontColor, setFontColor] = useState('#1a1a2e')
  const [fontFamily, setFontFamily] = useState('Arial Black')
  const [cellPositions, setCellPositions] = useState(null) // AI-detected positions
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const bgRef = useRef()

  const handleBgUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setBgImage(URL.createObjectURL(file))
    setBgFile(file)
    setCellPositions(null)
    setError('')
  }

  const analyzeTemplate = async () => {
    if (!bgFile || !apiKey) {
      setError(!apiKey ? 'Set your Gemini API key first.' : 'Upload a template image first.')
      return
    }

    setAnalyzing(true)
    setError('')

    try {
      const base64 = await fileToBase64(bgFile)
      const result = await analyzeTemplateLayoutWithAI(base64, apiKey)

      // Parse AI result into cell positions
      if (result && result.tables) {
        const positions = []
        for (const table of result.tables) {
          for (const row of table.rows) {
            positions.push({
              rank: row.rank,
              y: row.y,
              h: row.height,
              num: row.cells.num,
              logo: row.cells.logo,
              team: row.cells.team,
              win: row.cells.stat1,
              pos: row.cells.stat2,
              kill: row.cells.stat3,
              total: row.cells.stat4,
            })
          }
        }
        positions.sort((a, b) => a.rank - b.rank)
        setCellPositions(positions)

        // Adjust row count to match detected rows
        const count = positions.length
        setRows(prev => {
          const updated = [...prev]
          while (updated.length < count) updated.push(emptyRow())
          return updated.slice(0, count)
        })
      } else {
        setError('AI could not detect the layout. Try a clearer template image.')
      }
    } catch (err) {
      console.error(err)
      setError(`Failed: ${err.message}`)
    } finally {
      setAnalyzing(false)
    }
  }

  const updateRow = (index, field, value) => {
    const updated = [...rows]
    updated[index] = { ...updated[index], [field]: value }
    setRows(updated)
  }

  const handleLogoUpload = (index, e) => {
    const file = e.target.files[0]
    if (!file) return
    const updated = [...rows]
    updated[index] = { ...updated[index], logo: file, logoPreview: URL.createObjectURL(file) }
    setRows(updated)
  }

  const removeLogo = (index) => {
    const updated = [...rows]
    updated[index] = { ...updated[index], logo: null, logoPreview: null }
    setRows(updated)
  }

  const fillFromRankings = () => {
    if (!rankings || rankings.length === 0) return
    const updated = [...rows]
    rankings.forEach((r, i) => {
      if (i >= updated.length) return
      updated[i] = {
        ...updated[i],
        team: r.name || '',
        win: r.wins?.toString() || '0',
        pos: r.positionPts?.toString() || '0',
        kill: r.kills?.toString() || '0',
        total: r.total?.toString() || '0',
      }
    })
    setRows(updated)
  }

  const clearAll = () => {
    setRows(createRows(rows.length))
  }

  // Adjust a single cell position manually
  const adjustCell = (rowIdx, cellKey, prop, value) => {
    if (!cellPositions) return
    const updated = [...cellPositions]
    updated[rowIdx] = {
      ...updated[rowIdx],
      [cellKey]: { ...updated[rowIdx][cellKey], [prop]: parseFloat(value) || 0 }
    }
    setCellPositions(updated)
  }

  const adjustRowY = (rowIdx, value) => {
    if (!cellPositions) return
    const updated = [...cellPositions]
    updated[rowIdx] = { ...updated[rowIdx], y: parseFloat(value) || 0 }
    setCellPositions(updated)
  }

  const adjustRowH = (rowIdx, value) => {
    if (!cellPositions) return
    const updated = [...cellPositions]
    updated[rowIdx] = { ...updated[rowIdx], h: parseFloat(value) || 0 }
    setCellPositions(updated)
  }

  const exportAsImage = async () => {
    const bgImg = bgRef.current
    if (!bgImg || !cellPositions) return

    const canvas = document.createElement('canvas')
    canvas.width = bgImg.naturalWidth
    canvas.height = bgImg.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bgImg, 0, 0)

    const imgW = bgImg.naturalWidth
    const imgH = bgImg.naturalHeight
    const scaledFS = (fontSize / 100) * imgH

    ctx.font = `bold ${scaledFS}px "${fontFamily}", sans-serif`
    ctx.fillStyle = fontColor
    ctx.textBaseline = 'middle'

    for (let i = 0; i < Math.min(rows.length, cellPositions.length); i++) {
      const row = rows[i]
      const cp = cellPositions[i]
      const midY = (cp.y + cp.h / 2) / 100 * imgH

      // # number
      if (cp.num) {
        ctx.textAlign = 'center'
        const cx = (cp.num.x + cp.num.w / 2) / 100 * imgW
        ctx.fillText((i + 1).toString(), cx, midY)
      }

      // Logo
      if (row.logoPreview && cp.logo) {
        try {
          const logoImg = new Image()
          await new Promise((res, rej) => { logoImg.onload = res; logoImg.onerror = rej; logoImg.src = row.logoPreview })
          const logoSize = cp.h / 100 * imgH * 0.75
          const logoX = (cp.logo.x + cp.logo.w / 2) / 100 * imgW - logoSize / 2
          ctx.drawImage(logoImg, logoX, midY - logoSize / 2, logoSize, logoSize)
        } catch {}
      }

      // Team name
      if (cp.team) {
        ctx.textAlign = 'left'
        ctx.fillText(row.team, cp.team.x / 100 * imgW + 4, midY)
      }

      // Stats
      ctx.textAlign = 'center'
      if (cp.win) ctx.fillText(row.win, (cp.win.x + cp.win.w / 2) / 100 * imgW, midY)
      if (cp.pos) ctx.fillText(row.pos, (cp.pos.x + cp.pos.w / 2) / 100 * imgW, midY)
      if (cp.kill) ctx.fillText(row.kill, (cp.kill.x + cp.kill.w / 2) / 100 * imgW, midY)
      if (cp.total) ctx.fillText(row.total, (cp.total.x + cp.total.w / 2) / 100 * imgW, midY)
    }

    const link = document.createElement('a')
    link.download = 'tournament-ranking.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const renderOverlay = () => {
    if (!cellPositions) return null

    return rows.map((row, i) => {
      if (i >= cellPositions.length) return null
      const cp = cellPositions[i]

      const cellStyle = (cell, align = 'center') => ({
        position: 'absolute',
        left: `${cell.x}%`,
        top: `${cp.y}%`,
        width: `${cell.w}%`,
        height: `${cp.h}%`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        paddingLeft: align === 'left' ? '0.3%' : 0,
        fontSize: `${fontSize}vh`,
        fontFamily: `"${fontFamily}", sans-serif`,
        fontWeight: 'bold',
        color: fontColor,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      })

      return (
        <div key={i}>
          {cp.num && <div style={cellStyle(cp.num)}>{i + 1}</div>}
          {cp.logo && row.logoPreview && (
            <div style={{
              position: 'absolute',
              left: `${cp.logo.x}%`,
              top: `${cp.y}%`,
              width: `${cp.logo.w}%`,
              height: `${cp.h}%`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <img src={row.logoPreview} alt="" style={{ height: '75%', objectFit: 'contain' }} />
            </div>
          )}
          {cp.team && <div style={cellStyle(cp.team, 'left')}>{row.team}</div>}
          {cp.win && <div style={cellStyle(cp.win)}>{row.win}</div>}
          {cp.pos && <div style={cellStyle(cp.pos)}>{row.pos}</div>}
          {cp.kill && <div style={cellStyle(cp.kill)}>{row.kill}</div>}
          {cp.total && <div style={cellStyle(cp.total)}>{row.total}</div>}
        </div>
      )
    })
  }

  const renderDataInputRow = (row, i) => (
    <div key={i} style={{
      display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4,
      background: 'var(--bg-input)', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--primary)', fontWeight: 700, width: 20, textAlign: 'center', fontSize: '0.8rem', flexShrink: 0 }}>{i + 1}</span>
      <div style={{ flexShrink: 0 }}>
        {row.logoPreview ? (
          <div style={{ position: 'relative', width: 24, height: 24 }}>
            <img src={row.logoPreview} alt="" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 3 }} />
            <button onClick={() => removeLogo(i)} style={{
              position: 'absolute', top: -3, right: -3, background: 'var(--danger)', color: '#fff',
              border: 'none', borderRadius: '50%', width: 12, height: 12, fontSize: '0.45rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}>x</button>
          </div>
        ) : (
          <label style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            <input type="file" accept="image/*" onChange={e => handleLogoUpload(i, e)} style={{ display: 'none' }} />+
          </label>
        )}
      </div>
      <input type="text" value={row.team} onChange={e => updateRow(i, 'team', e.target.value)} placeholder="Team name" style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', padding: '3px 6px' }} />
      <input type="text" value={row.win} onChange={e => updateRow(i, 'win', e.target.value)} placeholder="W" style={{ width: 28, textAlign: 'center', fontSize: '0.8rem', padding: '3px 2px' }} />
      <input type="text" value={row.pos} onChange={e => updateRow(i, 'pos', e.target.value)} placeholder="P" style={{ width: 28, textAlign: 'center', fontSize: '0.8rem', padding: '3px 2px' }} />
      <input type="text" value={row.kill} onChange={e => updateRow(i, 'kill', e.target.value)} placeholder="K" style={{ width: 28, textAlign: 'center', fontSize: '0.8rem', padding: '3px 2px' }} />
      <input type="text" value={row.total} onChange={e => updateRow(i, 'total', e.target.value)} placeholder="T" style={{ width: 32, textAlign: 'center', fontSize: '0.8rem', padding: '3px 2px', fontWeight: 700 }} />
    </div>
  )

  const halfIdx = Math.ceil(rows.length / 2)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ color: 'var(--primary)' }}>Design Overlay</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {rankings && rankings.length > 0 && (
            <button className="btn btn-primary" onClick={fillFromRankings}>Fill from Rankings</button>
          )}
          <button className="btn btn-primary" onClick={exportAsImage} disabled={!bgImage || !cellPositions}>Export Image</button>
          <button className="btn btn-sm" style={{ background: 'var(--border)', color: 'var(--text)' }} onClick={clearAll}>Clear</button>
        </div>
      </div>

      {/* Step 1: Upload & Analyze */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ color: 'var(--primary)', marginBottom: 12 }}>1. Upload Template & Analyze</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" accept="image/*" onChange={handleBgUpload}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, color: 'var(--text)' }} />
          <button className="btn btn-primary" onClick={analyzeTemplate} disabled={!bgFile || !apiKey || analyzing}>
            {analyzing ? 'AI Analyzing...' : 'Analyze with AI'}
          </button>
        </div>

        {!apiKey && (
          <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: '0.85rem' }}>
            Set your Gemini API key first to enable AI analysis.
          </div>
        )}

        {analyzing && (
          <div style={{ marginTop: 12, textAlign: 'center', padding: 16 }}>
            <div style={{ width: 36, height: 36, border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
            <p style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem' }}>AI is analyzing the template layout...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {error && <div style={{ marginTop: 10, color: 'var(--danger)', fontWeight: 600 }}>{error}</div>}

        {cellPositions && (
          <div style={{ marginTop: 10, color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem' }}>
            AI detected {cellPositions.length} rows with cell positions.
          </div>
        )}
      </div>

      {/* Step 2: Style settings */}
      {cellPositions && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--primary)', marginBottom: 12 }}>2. Style</h3>
            <button className="btn btn-sm" style={{ background: 'var(--border)', color: 'var(--text)' }}
              onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? 'Hide Fine-tune' : 'Fine-tune Positions'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>Font Size (vh)</label>
              <input type="number" min="0.5" max="5" step="0.1" value={fontSize} onChange={e => setFontSize(parseFloat(e.target.value) || 1.4)} style={{ width: 70 }} />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>Color</label>
              <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)} style={{ width: 40, height: 32, padding: 0, border: 'none', cursor: 'pointer' }} />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>Font</label>
              <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                <option value="Arial Black">Arial Black</option>
                <option value="Arial">Arial</option>
                <option value="Impact">Impact</option>
                <option value="Tahoma">Tahoma</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>
          </div>

          {showSettings && cellPositions && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12, maxHeight: 300, overflowY: 'auto' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 8 }}>
                Fine-tune row Y positions and heights (%). Changes update the preview instantly.
              </p>
              {cellPositions.map((cp, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700, width: 22 }}>#{i + 1}</span>
                  <label style={{ color: 'var(--text-muted)' }}>Y:</label>
                  <input type="number" step="0.25" value={cp.y} onChange={e => adjustRowY(i, e.target.value)} style={{ width: 55, fontSize: '0.75rem' }} />
                  <label style={{ color: 'var(--text-muted)' }}>H:</label>
                  <input type="number" step="0.25" value={cp.h} onChange={e => adjustRowH(i, e.target.value)} style={{ width: 55, fontSize: '0.75rem' }} />
                  <label style={{ color: 'var(--text-muted)' }}>Team X:</label>
                  <input type="number" step="0.25" value={cp.team?.x || 0} onChange={e => adjustCell(i, 'team', 'x', e.target.value)} style={{ width: 55, fontSize: '0.75rem' }} />
                  <label style={{ color: 'var(--text-muted)' }}>W:</label>
                  <input type="number" step="0.25" value={cp.team?.w || 0} onChange={e => adjustCell(i, 'team', 'w', e.target.value)} style={{ width: 55, fontSize: '0.75rem' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {bgImage && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ color: 'var(--primary)', marginBottom: 12 }}>Preview</h3>
          <div style={{ position: 'relative', width: '100%' }}>
            <img
              ref={bgRef}
              src={bgImage}
              alt="Background"
              style={{ width: '100%', display: 'block', borderRadius: 8 }}
            />
            {renderOverlay()}
          </div>
        </div>
      )}

      {/* Step 3: Team Data */}
      {cellPositions && (
        <div className="card">
          <h3 style={{ color: 'var(--primary)', marginBottom: 12 }}>3. Fill Team Data</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              {rows.slice(0, halfIdx).map((row, i) => renderDataInputRow(row, i))}
            </div>
            <div>
              {rows.slice(halfIdx).map((row, i) => renderDataInputRow(row, halfIdx + i))}
            </div>
          </div>
        </div>
      )}

      {!bgImage && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            Upload a background template to start designing.
          </p>
        </div>
      )}
    </div>
  )
}
