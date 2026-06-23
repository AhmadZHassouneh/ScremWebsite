import { useRef } from 'react'

export default function RightSidebar({ selectedTeam, onUpdate }) {
  const logoInputRef = useRef(null)

  if (!selectedTeam) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>Properties</div>
        <div style={{
          color: 'var(--text-muted)',
          textAlign: 'center',
          padding: '40px 12px',
          fontSize: '0.85rem',
        }}>
          Select a team block to edit its properties
        </div>
      </div>
    )
  }

  const team = selectedTeam
  const style = team.style

  const update = (changes) => onUpdate(team.id, changes)
  const updateStyle = (changes) => onUpdate(team.id, { style: { ...style, ...changes } })

  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (team.logoSrc) URL.revokeObjectURL(team.logoSrc)
    update({ logoSrc: URL.createObjectURL(file) })
  }

  const removeLogo = () => {
    if (team.logoSrc) URL.revokeObjectURL(team.logoSrc)
    update({ logoSrc: null })
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Properties</div>

      <div style={scrollStyle}>
        {/* Team Name */}
        <PropSection label="Team Name">
          <input
            type="text"
            value={team.name}
            onChange={(e) => update({ name: e.target.value })}
            style={inputStyle}
          />
        </PropSection>

        {/* Logo */}
        <PropSection label="Logo">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {team.logoSrc && (
              <img
                src={team.logoSrc}
                alt=""
                style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4, background: 'var(--bg-input)' }}
              />
            )}
            <button
              className="btn btn-sm btn-primary"
              onClick={() => logoInputRef.current?.click()}
              style={{ fontSize: '0.7rem', padding: '4px 8px' }}
            >
              {team.logoSrc ? 'Replace' : 'Upload'}
            </button>
            {team.logoSrc && (
              <button
                className="btn btn-sm"
                onClick={removeLogo}
                style={{ fontSize: '0.7rem', padding: '4px 8px', background: 'var(--border)', color: 'var(--text)' }}
              >
                Remove
              </button>
            )}
          </div>
        </PropSection>

        <Divider />

        {/* Font */}
        <PropRow label="Font Size">
          <input
            type="number"
            min={6}
            max={200}
            value={Math.round(style.fontSize)}
            onChange={(e) => updateStyle({ fontSize: Math.max(6, parseInt(e.target.value) || 6) })}
            style={numInputStyle}
          />
        </PropRow>

        <PropRow label="Font Color">
          <ColorInput value={style.fontColor} onChange={(v) => updateStyle({ fontColor: v })} />
        </PropRow>

        <Divider />

        {/* Background */}
        <PropRow label="Bg Color">
          <ColorInput value={style.bgColor} onChange={(v) => updateStyle({ bgColor: v })} />
        </PropRow>

        <PropRow label="Bg Opacity">
          <RangeInput
            value={style.bgOpacity}
            min={0} max={1} step={0.05}
            onChange={(v) => updateStyle({ bgOpacity: v })}
          />
        </PropRow>

        <Divider />

        {/* Border */}
        <PropRow label="Border Color">
          <ColorInput value={style.borderColor} onChange={(v) => updateStyle({ borderColor: v })} />
        </PropRow>

        <PropRow label="Border Width">
          <input
            type="number"
            min={0}
            max={20}
            value={style.borderWidth}
            onChange={(e) => updateStyle({ borderWidth: Math.max(0, parseInt(e.target.value) || 0) })}
            style={numInputStyle}
          />
        </PropRow>

        <PropRow label="Border Radius">
          <input
            type="number"
            min={0}
            max={100}
            value={style.borderRadius}
            onChange={(e) => updateStyle({ borderRadius: Math.max(0, parseInt(e.target.value) || 0) })}
            style={numInputStyle}
          />
        </PropRow>

        <Divider />

        {/* Block Opacity */}
        <PropRow label="Opacity">
          <RangeInput
            value={style.opacity}
            min={0} max={1} step={0.05}
            onChange={(v) => updateStyle({ opacity: v })}
          />
        </PropRow>

        <Divider />

        {/* Position & Size */}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>
          Position & Size
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <PosInput label="X" value={team.x} onChange={(v) => update({ x: v })} />
          <PosInput label="Y" value={team.y} onChange={(v) => update({ y: v })} />
          <PosInput label="W" value={team.width} onChange={(v) => update({ width: Math.max(60, v) })} />
          <PosInput label="H" value={team.height} onChange={(v) => update({ height: Math.max(30, v) })} />
        </div>
      </div>
    </div>
  )
}

/* ---- sub-components ---- */

function PropSection({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  )
}

function PropRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  )
}

function ColorInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 28, height: 28,
          padding: 0, border: '1px solid var(--border)',
          borderRadius: 4, cursor: 'pointer',
          background: 'transparent',
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
        }}
        style={{
          ...numInputStyle,
          width: 72,
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
        }}
      />
    </div>
  )
}

function RangeInput({ value, min, max, step, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: 80, accentColor: 'var(--primary)' }}
      />
      <span style={{ color: 'var(--text)', fontSize: '0.75rem', width: 32, textAlign: 'right' }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

function PosInput({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', width: 14 }}>{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ ...numInputStyle, flex: 1 }}
      />
    </div>
  )
}

function Divider() {
  return <div style={{ borderBottom: '1px solid var(--border)', margin: '8px 0' }} />
}

/* ---- styles ---- */

const containerStyle = {
  width: 260,
  minWidth: 220,
  flexShrink: 0,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--primary)',
  fontWeight: 700,
  fontSize: '0.95rem',
}

const scrollStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 14px',
}

const inputStyle = {
  width: '100%',
  fontSize: '0.85rem',
  padding: '5px 8px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
}

const numInputStyle = {
  width: 56,
  fontSize: '0.8rem',
  padding: '4px 6px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  textAlign: 'center',
}

const labelStyle = {
  color: 'var(--text-muted)',
  fontSize: '0.75rem',
  marginBottom: 4,
}
