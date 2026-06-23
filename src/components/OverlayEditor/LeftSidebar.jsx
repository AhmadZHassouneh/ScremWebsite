import { useRef } from 'react'

const MAX_TEAMS = 16

export default function LeftSidebar({
  teams, selectedId,
  onAdd, onUpdate, onDelete, onDuplicate, onSelect,
  onMoveForward, onMoveBackward,
  disabled,
}) {
  const selectedIdx = teams.findIndex((t) => t.id === selectedId)

  return (
    <div style={{
      width: 280,
      minWidth: 220,
      flexShrink: 0,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.95rem' }}>
          Teams ({teams.length}/{MAX_TEAMS})
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={onAdd}
          disabled={disabled || teams.length >= MAX_TEAMS}
        >
          + Add
        </button>
      </div>

      {/* Layer order controls — visible when a team is selected */}
      {selectedId && selectedIdx >= 0 && (
        <div style={{
          padding: '6px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginRight: 'auto' }}>
            Layer
          </span>
          <button
            onClick={() => onDuplicate(selectedId)}
            disabled={teams.length >= MAX_TEAMS}
            style={{ ...layerBtnStyle, fontSize: '0.75rem', fontWeight: 700 }}
            title="Duplicate (Ctrl+D)"
          >D</button>
          <button
            onClick={() => onMoveBackward(selectedId)}
            disabled={selectedIdx <= 0}
            style={layerBtnStyle}
            title="Send backward"
          >&#9660;</button>
          <button
            onClick={() => onMoveForward(selectedId)}
            disabled={selectedIdx >= teams.length - 1}
            style={layerBtnStyle}
            title="Bring forward"
          >&#9650;</button>
        </div>
      )}

      {/* Team list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 8,
      }}>
        {teams.length === 0 && (
          <div style={{
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '24px 12px',
            fontSize: '0.85rem',
          }}>
            {disabled
              ? 'Upload a background first'
              : 'Click "+ Add" to create a team block'}
          </div>
        )}

        {teams.map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            isSelected={selectedId === team.id}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

const layerBtnStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  cursor: 'pointer',
  width: 26,
  height: 26,
  fontSize: '0.7rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function TeamRow({ team, isSelected, onSelect, onUpdate, onDelete }) {
  const logoInputRef = useRef(null)

  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (team.logoSrc) URL.revokeObjectURL(team.logoSrc)
    onUpdate(team.id, { logoSrc: URL.createObjectURL(file) })
  }

  const removeLogo = () => {
    if (team.logoSrc) URL.revokeObjectURL(team.logoSrc)
    onUpdate(team.id, { logoSrc: null })
  }

  return (
    <div
      onClick={() => onSelect(team.id)}
      style={{
        padding: '8px 10px',
        marginBottom: 4,
        borderRadius: 8,
        border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
        background: isSelected ? 'var(--bg-input)' : 'transparent',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Logo thumbnail / upload */}
        <div style={{ flexShrink: 0 }}>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
          {team.logoSrc ? (
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              <img
                src={team.logoSrc}
                alt=""
                style={{
                  width: 32, height: 32,
                  objectFit: 'contain',
                  borderRadius: 4,
                  background: 'var(--bg-input)',
                }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); removeLogo() }}
                style={{
                  position: 'absolute', top: -4, right: -4,
                  background: 'var(--danger)', color: '#fff',
                  border: 'none', borderRadius: '50%',
                  width: 14, height: 14, fontSize: '0.5rem',
                  cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}
              >x</button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click() }}
              style={{
                width: 32, height: 32,
                background: 'var(--bg-input)',
                border: '1px dashed var(--border)',
                borderRadius: 4,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Upload logo"
            >+</button>
          )}
        </div>

        {/* Name input */}
        <input
          type="text"
          value={team.name}
          onChange={(e) => onUpdate(team.id, { name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Team name"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: '0.85rem',
            padding: '4px 8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
          }}
        />

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(team.id) }}
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: 'none',
            color: 'var(--danger)',
            cursor: 'pointer',
            fontSize: '1rem',
            padding: '2px 4px',
            lineHeight: 1,
          }}
          title="Delete team"
        >&times;</button>
      </div>
    </div>
  )
}
