import { useState } from 'react'

export default function PointSystemPanel({ pointSystem, setPointSystem, killPts, setKillPts }) {
  const [showAddRow, setShowAddRow] = useState(false)
  const [newPosition, setNewPosition] = useState('')
  const [newPoints, setNewPoints] = useState(0)

  const updatePoints = (index, value) => {
    const updated = [...pointSystem]
    updated[index] = { ...updated[index], points: parseInt(value) || 0 }
    setPointSystem(updated)
  }

  const updatePosition = (index, value) => {
    const updated = [...pointSystem]
    const numVal = parseInt(value)
    updated[index] = { ...updated[index], position: isNaN(numVal) ? value : numVal }
    setPointSystem(updated)
  }

  const deleteRow = (index) => {
    setPointSystem(pointSystem.filter((_, i) => i !== index))
  }

  const addRow = () => {
    if (!newPosition) return
    const numVal = parseInt(newPosition)
    setPointSystem([...pointSystem, {
      position: isNaN(numVal) ? newPosition : numVal,
      points: parseInt(newPoints) || 0,
    }])
    setNewPosition('')
    setNewPoints(0)
    setShowAddRow(false)
  }

  return (
    <div>
      <div className="card">
        <h2>Point System Configuration</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          Configure how many points each position earns. Each kill is worth additional points.
        </p>

        <div className="point-system-grid">
          {pointSystem.map((entry, index) => (
            <div key={index} className="point-entry">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>POSITION</span>
                <input
                  type="text"
                  value={entry.position}
                  onChange={e => updatePosition(index, e.target.value)}
                  style={{ width: 70 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>POINTS</span>
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
            + Add Position
          </button>
        </div>

        {showAddRow && (
          <div className="add-form" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>Position (e.g. 9 or 9-20)</label>
              <input
                type="text"
                value={newPosition}
                onChange={e => setNewPosition(e.target.value)}
                placeholder="e.g. 9 or 9-20"
              />
            </div>
            <div className="form-group">
              <label>Points</label>
              <input
                type="number"
                min="0"
                value={newPoints}
                onChange={e => setNewPoints(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={addRow}>Add</button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Kill Points</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            Points per kill:
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
        <h2>Points Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Position</th>
              <th>Points Awarded</th>
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
              <td style={{ fontWeight: 600, color: 'var(--danger)' }}>Each Kill (Elimination)</td>
              <td><span className="total-cell">{killPts}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
