import { useState } from 'react'
import { useI18n } from '../i18n/index.jsx'

export default function PointSystemPanel({ pointSystem, setPointSystem, killPts, setKillPts }) {
  const { t } = useI18n()
  const [showAddRow, setShowAddRow] = useState(false)
  const [newPosition, setNewPosition] = useState('')
  const [newPoints, setNewPoints] = useState(0)

  const updatePoints = (index, value) => {
    const updated = [...pointSystem]
    updated[index] = { ...updated[index], points: parseInt(value) || 0 }
    setPointSystem(updated)
  }

  // Keep range entries like "9-20" as strings — parseInt("9-20") would
  // silently truncate them to 9
  const toPosition = (value) => {
    const trimmed = String(value).trim()
    return /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : trimmed
  }

  const updatePosition = (index, value) => {
    const updated = [...pointSystem]
    updated[index] = { ...updated[index], position: toPosition(value) }
    setPointSystem(updated)
  }

  const deleteRow = (index) => {
    setPointSystem(pointSystem.filter((_, i) => i !== index))
  }

  const addRow = () => {
    if (!newPosition) return
    setPointSystem([...pointSystem, {
      position: toPosition(newPosition),
      points: parseInt(newPoints) || 0,
    }])
    setNewPosition('')
    setNewPoints(0)
    setShowAddRow(false)
  }

  return (
    <div>
      <div className="card">
        <h2>{t('pointSystemConfig')}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          {t('pointSystemDesc')}
        </p>

        <div className="point-system-grid">
          {pointSystem.map((entry, index) => (
            <div key={index} className="point-entry">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('positionLabel')}</span>
                <input
                  type="text"
                  value={entry.position}
                  onChange={e => updatePosition(index, e.target.value)}
                  style={{ width: 70 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('pointsLabel')}</span>
                <input
                  type="number"
                  min="0"
                  value={entry.points}
                  onChange={e => updatePoints(index, e.target.value)}
                />
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => deleteRow(index)}
                style={{ alignSelf: 'flex-end' }}
              >
                X
              </button>
            </div>
          ))}
        </div>

        <div className="btn-group" style={{ marginTop: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddRow(!showAddRow)}>
            {t('addPosition')}
          </button>
        </div>

        {showAddRow && (
          <div className="add-form" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>{t('positionExample')}</label>
              <input
                type="text"
                value={newPosition}
                onChange={e => setNewPosition(e.target.value)}
                placeholder={t('positionExample')}
              />
            </div>
            <div className="form-group">
              <label>{t('points')}</label>
              <input
                type="number"
                min="0"
                value={newPoints}
                onChange={e => setNewPoints(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={addRow}>{t('add')}</button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>{t('killPoints')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            {t('pointsPerKill')}
          </label>
          <input
            type="number"
            min="0"
            value={killPts}
            onChange={e => setKillPts(parseInt(e.target.value) || 0)}
            style={{ width: 80 }}
          />
        </div>
      </div>

      <div className="card">
        <h2>{t('pointsSummary')}</h2>
        <table>
          <thead>
            <tr>
              <th>{t('position')}</th>
              <th>{t('pointsAwarded')}</th>
            </tr>
          </thead>
          <tbody>
            {pointSystem.map((entry, index) => (
              <tr key={index}>
                <td style={{ fontWeight: 600 }}>
                  {typeof entry.position === 'string' ? `Top ${entry.position}` : `Top ${entry.position}`}
                </td>
                <td>
                  <span className="total-cell">{entry.points}</span>
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ fontWeight: 600, color: 'var(--danger)' }}>{t('eachKill')}</td>
              <td><span className="total-cell">{killPts}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
