import { useState } from 'react'
import TeamImageUpload from './TeamImageUpload'

export default function TeamsPanel({ teams, setTeams, apiKey }) {
  const [editingTeam, setEditingTeam] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newPlayers, setNewPlayers] = useState(['', '', '', ''])

  const handleEditTeam = (team) => {
    setEditingTeam({ ...team, players: [...team.players] })
  }

  const handleSaveEdit = () => {
    setTeams(teams.map(t => t.id === editingTeam.id ? editingTeam : t))
    setEditingTeam(null)
  }

  const handleDeleteTeam = (id) => {
    if (confirm('Are you sure you want to delete this team?')) {
      setTeams(teams.filter(t => t.id !== id))
    }
  }

  const handleAddTeam = () => {
    if (!newTeamName.trim()) return
    const newId = Math.max(0, ...teams.map(t => t.id)) + 1
    setTeams([...teams, {
      id: newId,
      name: newTeamName.trim(),
      players: newPlayers.filter(p => p.trim()),
    }])
    setNewTeamName('')
    setNewPlayers(['', '', '', ''])
    setShowAddForm(false)
  }

  const updateEditPlayer = (index, value) => {
    const players = [...editingTeam.players]
    players[index] = value
    setEditingTeam({ ...editingTeam, players })
  }

  const addEditPlayer = () => {
    if (editingTeam.players.length >= 4) return
    setEditingTeam({ ...editingTeam, players: [...editingTeam.players, ''] })
  }

  const removeEditPlayer = (index) => {
    const players = editingTeam.players.filter((_, i) => i !== index)
    setEditingTeam({ ...editingTeam, players })
  }

  const handleImageTeams = (teamNames) => {
    // teamNames is an array of strings like ["STG ESP", "HOPEESPORT", ...]
    // Skip teams that already exist (case-insensitive match)
    const existingNames = teams.map(t => t.name.toLowerCase().trim())
    const newTeams = []
    let nextId = Math.max(0, ...teams.map(t => t.id))

    for (const name of teamNames) {
      if (existingNames.includes(name.toLowerCase().trim())) continue
      nextId++
      newTeams.push({
        id: nextId,
        name: name,
        players: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
      })
    }

    if (newTeams.length > 0) {
      setTeams([...teams, ...newTeams])
    }
    setShowUpload(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ color: 'var(--primary)' }}>Teams ({teams.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => { setShowUpload(!showUpload); setShowAddForm(false) }}>
            {showUpload ? 'Hide Upload' : 'Upload Screenshot'}
          </button>
          <button className="btn btn-primary" onClick={() => { setShowAddForm(!showAddForm); setShowUpload(false) }}>
            {showAddForm ? 'Cancel' : '+ Add Team'}
          </button>
        </div>
      </div>

      {showUpload && (
        <div style={{ marginBottom: 20 }}>
          <TeamImageUpload onTeamsExtracted={handleImageTeams} apiKey={apiKey} />
        </div>
      )}

      {showAddForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Add New Team</h2>
          <div className="add-form" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="form-group">
              <label>Team Name</label>
              <input
                type="text"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                placeholder="Enter team name"
              />
            </div>
            {newPlayers.map((p, i) => (
              <div key={i} className="form-group">
                <label>Player {i + 1}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={p}
                    onChange={e => {
                      const arr = [...newPlayers]
                      arr[i] = e.target.value
                      setNewPlayers(arr)
                    }}
                    placeholder={`Player ${i + 1} name`}
                  />
                  {newPlayers.length > 1 && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setNewPlayers(newPlayers.filter((_, idx) => idx !== i))}
                    >
                      X
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="btn-group">
              <button className="btn btn-sm btn-primary" onClick={() => { if (newPlayers.length < 4) setNewPlayers([...newPlayers, '']) }} disabled={newPlayers.length >= 4}>
                + Player
              </button>
              <button className="btn btn-primary" onClick={handleAddTeam}>Save Team</button>
            </div>
          </div>
        </div>
      )}

      <div className="teams-grid">
        {teams.map(team => (
          <div key={team.id} className="team-card">
            <h3>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="team-number">{team.id}</span>
                {team.name}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-primary" onClick={() => handleEditTeam(team)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteTeam(team.id)}>Del</button>
              </span>
            </h3>
            <ul className="player-list">
              {team.players.map((player, i) => (
                <li key={i}>
                  <span className="player-icon">&#9654;</span>
                  {player}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editingTeam && (
        <div className="modal-overlay" onClick={() => setEditingTeam(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Edit Team</h2>
            <div className="form-group">
              <label>Team Name</label>
              <input
                type="text"
                value={editingTeam.name}
                onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })}
              />
            </div>
            <h3 style={{ color: 'var(--primary)', margin: '16px 0 8px' }}>Players</h3>
            {editingTeam.players.map((player, i) => (
              <div key={i} className="form-group" style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={player}
                  onChange={e => updateEditPlayer(i, e.target.value)}
                  placeholder={`Player ${i + 1}`}
                />
                <button className="btn btn-danger btn-sm" onClick={() => removeEditPlayer(i)}>X</button>
              </div>
            ))}
            <div className="btn-group">
              {editingTeam.players.length < 4 && (
                <button className="btn btn-sm btn-primary" onClick={addEditPlayer}>+ Player</button>
              )}
              <button className="btn btn-primary" onClick={handleSaveEdit}>Save</button>
              <button className="btn btn-sm" style={{ background: 'var(--border)', color: 'var(--text)' }} onClick={() => setEditingTeam(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
