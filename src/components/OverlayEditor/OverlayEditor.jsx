import { useState, useRef, useCallback, useEffect } from 'react'
import OverlayCanvas from './OverlayCanvas'
import LeftSidebar from './LeftSidebar'
import RightSidebar from './RightSidebar.jsx'
import { saveConfig, loadConfig, listConfigs, deleteConfig } from './persistence.js'

/** Default style for new team blocks */
const defaultStyle = {
  fontSize: 24,
  fontColor: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 0.7,
  borderColor: '#00c9a7',
  borderWidth: 2,
  borderRadius: 8,
  opacity: 1,
}

export default function OverlayEditor() {
  const [backgroundSrc, setBackgroundSrc] = useState(null)
  const [bgFileName, setBgFileName] = useState('')
  const [naturalSize, setNaturalSize] = useState(null)
  const [teams, setTeams] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const fileRef = useRef(null)
  const canvasRef = useRef(null)

  // Export state
  const [showExportMenu, setShowExportMenu] = useState(false)

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return
    const close = () => setShowExportMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [showExportMenu])

  // Save/load state
  const [currentConfigId, setCurrentConfigId] = useState(null)
  const [currentConfigName, setCurrentConfigName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showLoadModal, setShowLoadModal] = useState(false)
  const [savedList, setSavedList] = useState([])
  const [saving, setSaving] = useState(false)
  const [loadingId, setLoadingId] = useState(null)

  // Refresh the saved configs list
  const refreshList = useCallback(async () => {
    const list = await listConfigs()
    setSavedList(list.sort((a, b) => b.savedAt - a.savedAt))
  }, [])

  // Load list when modal opens
  useEffect(() => {
    if (showLoadModal) refreshList()
  }, [showLoadModal, refreshList])

  // ── Background upload ──
  const handleBgUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (backgroundSrc) URL.revokeObjectURL(backgroundSrc)
    setBackgroundSrc(URL.createObjectURL(file))
    setBgFileName(file.name)
  }

  const handleImageLoaded = useCallback((size) => {
    setNaturalSize(size)
  }, [])

  // ── Team CRUD ──
  const addTeam = () => {
    if (teams.length >= 16 || !naturalSize) return
    const id = crypto.randomUUID()
    const index = teams.length
    const w = naturalSize.width
    const h = naturalSize.height
    const blockW = w * 0.13
    const blockH = h * 0.055
    const fontSize = Math.round(h * 0.022)
    const col = index % 4
    const row = Math.floor(index / 4)

    const newTeam = {
      id,
      name: `Team ${index + 1}`,
      logoSrc: null,
      x: w * 0.04 + col * (blockW + w * 0.015),
      y: h * 0.04 + row * (blockH + h * 0.015),
      width: blockW,
      height: blockH,
      style: { ...defaultStyle, fontSize },
    }
    setTeams((prev) => [...prev, newTeam])
    setSelectedId(id)
  }

  const updateTeam = useCallback((id, changes) => {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)))
  }, [])

  const deleteTeam = useCallback((id) => {
    setTeams((prev) => prev.filter((t) => t.id !== id))
    setSelectedId((prev) => (prev === id ? null : prev))
  }, [])

  const handleTeamMove = useCallback((id, x, y) => {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)))
  }, [])

  const handleTeamTransform = useCallback((id, changes) => {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)))
  }, [])

  const moveForward = useCallback((id) => {
    setTeams((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      if (idx < 0 || idx >= prev.length - 1) return prev
      const arr = [...prev]
      ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
      return arr
    })
  }, [])

  const moveBackward = useCallback((id) => {
    setTeams((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      if (idx <= 0) return prev
      const arr = [...prev]
      ;[arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]
      return arr
    })
  }, [])

  // ── Save ──
  const handleSave = async () => {
    if (!backgroundSrc) return
    setSaving(true)
    try {
      const id = currentConfigId || crypto.randomUUID()
      const name = saveName.trim() || currentConfigName || 'Untitled Design'
      await saveConfig({ id, name, backgroundSrc, bgFileName, teams })
      setCurrentConfigId(id)
      setCurrentConfigName(name)
      setShowSaveDialog(false)
      setSaveName('')
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const openSaveDialog = () => {
    setSaveName(currentConfigName || '')
    setShowSaveDialog(true)
  }

  // ── Load ──
  const handleLoad = async (id) => {
    setLoadingId(id)
    try {
      const config = await loadConfig(id)
      if (!config) return

      // Revoke old blob URLs
      if (backgroundSrc) URL.revokeObjectURL(backgroundSrc)
      teams.forEach((t) => { if (t.logoSrc) URL.revokeObjectURL(t.logoSrc) })

      setBackgroundSrc(config.backgroundSrc)
      setBgFileName(config.bgFileName)
      setTeams(config.teams)
      setSelectedId(null)
      setCurrentConfigId(config.id)
      setCurrentConfigName(config.name)
      setShowLoadModal(false)
    } catch (err) {
      console.error('Load failed:', err)
    } finally {
      setLoadingId(null)
    }
  }

  const handleDelete = async (id) => {
    await deleteConfig(id)
    if (currentConfigId === id) {
      setCurrentConfigId(null)
      setCurrentConfigName('')
    }
    refreshList()
  }

  // ── Duplicate ──
  const duplicateTeam = useCallback((id) => {
    setTeams((prev) => {
      if (prev.length >= 16) return prev
      const source = prev.find((t) => t.id === id)
      if (!source) return prev
      const newId = crypto.randomUUID()
      const clone = {
        ...source,
        id: newId,
        name: source.name + ' copy',
        x: source.x + 20,
        y: source.y + 20,
        style: { ...source.style },
        logoSrc: source.logoSrc, // shares same blob URL (read-only)
      }
      setSelectedId(newId)
      return [...prev, clone]
    })
  }, [])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteTeam(selectedId)
        return
      }

      if (e.key === 'Escape') {
        setSelectedId(null)
        return
      }

      if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && selectedId) {
        e.preventDefault()
        duplicateTeam(selectedId)
        return
      }

      const NUDGE = e.shiftKey ? 10 : 1
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedId) {
        e.preventDefault()
        const dx = e.key === 'ArrowLeft' ? -NUDGE : e.key === 'ArrowRight' ? NUDGE : 0
        const dy = e.key === 'ArrowUp' ? -NUDGE : e.key === 'ArrowDown' ? NUDGE : 0
        setTeams((prev) => prev.map((t) =>
          t.id === selectedId ? { ...t, x: t.x + dx, y: t.y + dy } : t
        ))
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedId, deleteTeam, duplicateTeam])

  // ── Export ──
  const handleExport = (pixelRatio, mimeType = 'image/png', quality = 0.92) => {
    const dataURL = canvasRef.current?.exportImage({ pixelRatio, mimeType, quality })
    if (!dataURL) return

    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png'
    const suffix = pixelRatio > 1 ? `@${pixelRatio}x` : ''
    const baseName = (currentConfigName || bgFileName?.replace(/\.[^.]+$/, '') || 'overlay')
    const filename = `${baseName}${suffix}.${ext}`

    const link = document.createElement('a')
    link.download = filename
    link.href = dataURL
    link.click()
    setShowExportMenu(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 14px',
      }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
          onChange={handleBgUpload}
          style={{ display: 'none' }}
        />
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          {backgroundSrc ? 'Replace Background' : 'Upload Background'}
        </button>

        {/* Save / Load buttons */}
        <button
          className="btn btn-sm"
          style={{ background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)' }}
          onClick={openSaveDialog}
          disabled={!backgroundSrc}
        >
          Save
        </button>
        <button
          className="btn btn-sm"
          style={{ background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)' }}
          onClick={() => setShowLoadModal(true)}
        >
          Load
        </button>

        {/* Export dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600 }}
            onClick={(e) => { e.stopPropagation(); setShowExportMenu((v) => !v) }}
            disabled={!backgroundSrc}
          >
            Export
          </button>
          {showExportMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 4,
                minWidth: 170,
                zIndex: 100,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <ExportOption label="PNG" detail="native" onClick={() => handleExport(1)} />
              <ExportOption label="PNG 2x" detail="high-res" onClick={() => handleExport(2)} />
              <ExportOption label="PNG 3x" detail="ultra" onClick={() => handleExport(3)} />
              <div style={{ borderBottom: '1px solid var(--border)', margin: '4px 0' }} />
              <ExportOption label="JPEG" detail="native" onClick={() => handleExport(1, 'image/jpeg', 0.92)} />
              <ExportOption label="JPEG 2x" detail="high-res" onClick={() => handleExport(2, 'image/jpeg', 0.92)} />
            </div>
          )}
        </div>

        {/* Current file info */}
        {(bgFileName || currentConfigName) && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {currentConfigName ? `${currentConfigName} — ` : ''}{bgFileName}
          </span>
        )}

        {/* Keyboard hints */}
        {backgroundSrc && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: 'auto', opacity: 0.6 }}>
            Del remove &middot; Arrows nudge &middot; Ctrl+D duplicate &middot; Esc deselect
          </span>
        )}
      </div>

      {/* Save dialog (inline) */}
      {showSaveDialog && (
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 12px',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>Name:</span>
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="My Design"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            style={{
              flex: 1,
              minWidth: 120,
              fontSize: '0.85rem',
              padding: '5px 8px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text)',
            }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--border)', color: 'var(--text)' }}
            onClick={() => setShowSaveDialog(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Load modal */}
      {showLoadModal && (
        <div className="modal-overlay" onClick={() => setShowLoadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h2 style={{ color: 'var(--primary)', marginBottom: 16 }}>Load Design</h2>

            {savedList.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                No saved designs yet.
              </p>
            ) : (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {savedList.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      marginBottom: 8,
                      background: currentConfigId === item.id ? 'var(--bg-input)' : 'transparent',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem' }}>
                        {item.name}
                        {currentConfigId === item.id && (
                          <span style={{ color: 'var(--primary)', fontSize: '0.75rem', marginLeft: 8 }}>
                            (current)
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
                        {item.teamCount} team{item.teamCount !== 1 ? 's' : ''} &middot;{' '}
                        {new Date(item.savedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleLoad(item.id)}
                      disabled={loadingId === item.id}
                      style={{ flexShrink: 0 }}
                    >
                      {loadingId === item.id ? '...' : 'Load'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(item.id)}
                      style={{ flexShrink: 0, padding: '6px 10px' }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button
                className="btn btn-sm"
                style={{ background: 'var(--border)', color: 'var(--text)' }}
                onClick={() => setShowLoadModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main editor area: sidebar + canvas */}
      <div style={{
        display: 'flex',
        gap: 12,
        minHeight: 500,
        flexWrap: 'wrap',
      }}>
        <LeftSidebar
          teams={teams}
          selectedId={selectedId}
          onAdd={addTeam}
          onUpdate={updateTeam}
          onDelete={deleteTeam}
          onDuplicate={duplicateTeam}
          onSelect={setSelectedId}
          onMoveForward={moveForward}
          onMoveBackward={moveBackward}
          disabled={!naturalSize}
        />
        <OverlayCanvas
          ref={canvasRef}
          backgroundSrc={backgroundSrc}
          teams={teams}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onTeamMove={handleTeamMove}
          onTeamTransform={handleTeamTransform}
          onImageLoaded={handleImageLoaded}
        />
        <RightSidebar
          selectedTeam={teams.find((t) => t.id === selectedId) || null}
          onUpdate={updateTeam}
        />
      </div>
    </div>
  )
}

function ExportOption({ label, detail, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        color: 'var(--text)',
        fontSize: '0.85rem',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{detail}</span>
    </button>
  )
}
