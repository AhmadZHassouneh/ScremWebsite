import { useState, useRef, useEffect } from 'react'

export default function TeamAutocomplete({ teams, value, onChange, excludeIds = [], placeholder = 'Search team...' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const wrapRef = useRef(null)
  const listRef = useRef(null)

  // Current team name for display
  const currentTeam = teams.find(t => t.id === value)
  const displayName = currentTeam?.name || ''

  // Filter teams: exclude already-used ones (except current), match by query
  const filtered = teams.filter(t => {
    if (excludeIds.includes(t.id) && t.id !== value) return false
    if (!query) return true
    return t.name.toLowerCase().includes(query.toLowerCase())
  })

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scroll focused item into view
  useEffect(() => {
    if (focusIdx >= 0 && listRef.current) {
      const el = listRef.current.children[focusIdx]
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [focusIdx])

  const handleSelect = (teamId) => {
    onChange(teamId)
    setOpen(false)
    setQuery('')
    setFocusIdx(-1)
  }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && focusIdx >= 0 && filtered[focusIdx]) {
      e.preventDefault()
      handleSelect(filtered[focusIdx].id)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 140 }}>
      <input
        type="text"
        value={open ? query : displayName}
        onChange={(e) => {
          setQuery(e.target.value)
          setFocusIdx(-1)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          width: '100%',
          fontWeight: 600,
          fontSize: '0.85rem',
          padding: '6px 10px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          color: 'var(--text)',
        }}
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            maxHeight: 200,
            overflowY: 'auto',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {filtered.map((team, i) => (
            <div
              key={team.id}
              onClick={() => handleSelect(team.id)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: team.id === value ? 700 : 400,
                color: team.id === value ? 'var(--primary)' : 'var(--text)',
                background: i === focusIdx ? 'var(--bg-input)' : 'transparent',
              }}
              onMouseEnter={() => setFocusIdx(i)}
            >
              {team.name}
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 2,
          padding: '10px 12px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          zIndex: 50,
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}>
          No teams found
        </div>
      )}
    </div>
  )
}
