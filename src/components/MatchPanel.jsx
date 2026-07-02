import { useState, useRef, useCallback } from 'react'
import ImageUpload from './ImageUpload'
import TeamAutocomplete from './TeamAutocomplete'
import { useI18n } from '../i18n/index.jsx'

export default function MatchPanel({ teams, matches, setMatches, getPositionPoints, killPts, apiKey }) {
  const { t } = useI18n()
  const [activeMatch, setActiveMatch] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [manualTeamName, setManualTeamName] = useState('')
  const [manualPosition, setManualPosition] = useState('')
  const [manualPlayers, setManualPlayers] = useState([{ name: '', kills: 0 }])

  // Next number after the highest existing "Match N" so deleting a middle
  // match never creates duplicate names
  const nextMatchNumber = () => {
    const nums = matches.map(m => parseInt((m.name || '').match(/\d+$/)?.[0], 10) || 0)
    return Math.max(matches.length, ...nums, 0) + 1
  }

  const createNewMatch = () => {
    const matchNum = nextMatchNumber()
    const newMatch = {
      id: Date.now(),
      name: `Match ${matchNum}`,
      results: [],
    }
    setMatches([...matches, newMatch])
    setActiveMatch(newMatch.id)
  }

  const matchTeamFromGroup = (group) => {
    const groupName = (group.teamName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!groupName) return null

    for (const team of teams) {
      const teamName = team.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (teamName && (groupName.includes(teamName) || teamName.includes(groupName))) {
        return team
      }
    }
    return null
  }

  const buildResultFromGroup = (group, existingResults) => {
    const bestTeam = matchTeamFromGroup(group)

    if (bestTeam && bestTeam.id > 0) {
      const alreadyUsed = existingResults.find(r => r.teamId === bestTeam.id)
      if (!alreadyUsed) {
        return {
          teamId: bestTeam.id,
          teamName: bestTeam.name,
          position: group.position,
          kills: group.players.map(p => ({ player: p.name, count: p.kills })),
        }
      }
      return null
    }

    return {
      teamId: -(Date.now() + Math.random()),
      teamName: `Team #${group.position}`,
      position: group.position,
      kills: group.players.map(p => ({ player: p.name, count: p.kills })),
    }
  }

  const isDuplicateInMatch = (existingResults, newResult) => {
    if (newResult.teamId > 0 && existingResults.find(r => r.teamId === newResult.teamId)) {
      return true
    }
    return existingResults.some(r => {
      const existingNames = r.kills.map(k => k.player.toLowerCase().replace(/[^a-z0-9]/g, ''))
      const newNames = newResult.kills.map(k => k.player.toLowerCase().replace(/[^a-z0-9]/g, ''))
      const matchCount = newNames.filter(n => n && existingNames.some(e => e && (e.includes(n) || n.includes(e)))).length
      return matchCount >= 2
    })
  }

  const handleImageData = (parsedData) => {
    const newResults = []
    parsedData.teamGroups.forEach(group => {
      const result = buildResultFromGroup(group, [...(currentMatch?.results || []), ...newResults])
      if (result && !isDuplicateInMatch([...(currentMatch?.results || []), ...newResults], result)) {
        newResults.push(result)
      }
    })

    if (activeMatch && currentMatch) {
      setMatches(matches.map(m => {
        if (m.id !== activeMatch) return m
        return { ...m, results: [...m.results, ...newResults] }
      }))
    } else {
      const newMatch = {
        id: Date.now(),
        name: `Match ${nextMatchNumber()}`,
        results: newResults,
      }
      setMatches([...matches, newMatch])
      setActiveMatch(newMatch.id)
    }
    setShowUpload(false)
  }

  const addManualTeam = () => {
    if (!manualTeamName.trim() || !activeMatch) return

    const currentResults = currentMatch?.results || []
    const pos = parseInt(manualPosition) || (Math.max(0, ...currentResults.map(r => r.position)) + 1)
    const players = manualPlayers.filter(p => p.name.trim())

    const existingTeam = teams.find(t => t.name.toLowerCase() === manualTeamName.trim().toLowerCase())
    const teamId = existingTeam ? existingTeam.id : -(Date.now() + Math.random())

    if (existingTeam && currentResults.find(r => r.teamId === existingTeam.id)) return

    setMatches(matches.map(m => {
      if (m.id !== activeMatch) return m
      return {
        ...m,
        results: [...m.results, {
          teamId,
          teamName: manualTeamName.trim(),
          position: pos,
          kills: players.length > 0
            ? players.map(p => ({ player: p.name.trim(), count: p.kills }))
            : [{ player: '', count: 0 }],
        }],
      }
    }))
    setManualTeamName('')
    setManualPosition('')
    setManualPlayers([{ name: '', kills: 0 }])
    setShowAddTeam(false)
  }

  const removeTeamFromMatch = (matchId, teamId) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m
      return { ...m, results: m.results.filter(r => r.teamId !== teamId) }
    }))
  }

  const deleteMatch = (id) => {
    if (confirm(t('confirmDeleteMatch'))) {
      setMatches(matches.filter(m => m.id !== id))
      if (activeMatch === id) setActiveMatch(null)
    }
  }

  const updateResult = (matchId, teamId, field, value) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m
      return {
        ...m,
        results: m.results.map(r => {
          if (r.teamId !== teamId) return r
          return { ...r, [field]: field === 'position' ? parseInt(value) || 0 : value }
        }),
      }
    }))
  }

  const updateKill = (matchId, teamId, playerIndex, count) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m
      return {
        ...m,
        results: m.results.map(r => {
          if (r.teamId !== teamId) return r
          const kills = [...r.kills]
          kills[playerIndex] = { ...kills[playerIndex], count: parseInt(count) || 0 }
          return { ...r, kills }
        }),
      }
    }))
  }

  const updateTeam = (matchId, oldTeamId, newTeamId) => {
    const newTeam = teams.find(t => t.id === newTeamId)
    if (!newTeam) return
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m
      return {
        ...m,
        results: m.results.map(r => {
          if (r.teamId !== oldTeamId) return r
          return {
            ...r,
            teamId: newTeam.id,
            teamName: newTeam.name,
          }
        }),
      }
    }))
  }

  const updatePlayerName = (matchId, teamId, playerIndex, name) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m
      return {
        ...m,
        results: m.results.map(r => {
          if (r.teamId !== teamId) return r
          const kills = [...r.kills]
          kills[playerIndex] = { ...kills[playerIndex], player: name }
          return { ...r, kills }
        }),
      }
    }))
  }

  const addPlayerToResult = (matchId, teamId) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m
      return {
        ...m,
        results: m.results.map(r => {
          if (r.teamId !== teamId || r.kills.length >= 4) return r
          return { ...r, kills: [...r.kills, { player: '', count: 0 }] }
        }),
      }
    }))
  }

  const removePlayerFromResult = (matchId, teamId, playerIndex) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m
      return {
        ...m,
        results: m.results.map(r => {
          if (r.teamId !== teamId) return r
          return { ...r, kills: r.kills.filter((_, i) => i !== playerIndex) }
        }),
      }
    }))
  }

  const updateMatchName = (matchId, name) => {
    setMatches(matches.map(m => m.id === matchId ? { ...m, name } : m))
  }

  const dragMatchRef = useRef(null)
  const dragOverMatchRef = useRef(null)

  const handleMatchDragStart = useCallback((index) => {
    dragMatchRef.current = index
  }, [])

  const handleMatchDragOver = useCallback((e, index) => {
    e.preventDefault()
    dragOverMatchRef.current = index
  }, [])

  const handleMatchDrop = useCallback((e) => {
    e.preventDefault()
    const from = dragMatchRef.current
    const to = dragOverMatchRef.current
    if (from === null || to === null || from === to) return
    const updated = [...matches]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    setMatches(updated)
    dragMatchRef.current = null
    dragOverMatchRef.current = null
  }, [matches, setMatches])

  const currentMatch = matches.find(m => m.id === activeMatch)

  const getTeamTotalKills = (result) => {
    return (result.kills || []).reduce((sum, k) => sum + (k.count || 0), 0)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ color: 'var(--primary)' }}>{t('matchesCount', { count: matches.length })}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? t('hideUpload') : t('uploadScreenshot')}
          </button>
          <button className="btn btn-primary" onClick={createNewMatch}>
            {t('newMatch')}
          </button>
          {matches.length > 0 && (
            <button className="btn btn-danger" onClick={() => {
              if (confirm(t('confirmDeleteAllMatches'))) {
                setMatches([])
                setActiveMatch(null)
              }
            }}>
              {t('deleteAll')}
            </button>
          )}
        </div>
      </div>

      {showUpload && (
        <div style={{ marginBottom: 16 }}>
          {activeMatch && currentMatch && (
            <div style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--primary)',
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              fontSize: '0.9rem',
              color: 'var(--primary)',
              fontWeight: 600,
            }}>
              {t('teamsAddedTo', { name: currentMatch.name })}
            </div>
          )}
          <ImageUpload onDataExtracted={handleImageData} apiKey={apiKey} />
        </div>
      )}

      {matches.length > 0 && (
        <div className="match-tabs">
          {matches.map((match, idx) => (
            <div
              key={match.id}
              draggable
              onDragStart={() => handleMatchDragStart(idx)}
              onDragOver={(e) => handleMatchDragOver(e, idx)}
              onDrop={handleMatchDrop}
              style={{ display: 'flex', gap: 0, cursor: 'grab' }}
            >
              <button
                className={`match-tab ${activeMatch === match.id ? 'active' : ''}`}
                onClick={() => setActiveMatch(match.id)}
                style={{ borderRadius: '6px 0 0 6px' }}
              >
                {match.name}
              </button>
              <button
                className="match-tab"
                onClick={() => deleteMatch(match.id)}
                style={{
                  borderRadius: '0 6px 6px 0',
                  padding: '8px 10px',
                  color: 'var(--danger)',
                  borderLeft: 'none',
                }}
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}

      {currentMatch && (
        <div className="card">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            <label style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('matchName')}</label>
            <input
              type="text"
              value={currentMatch.name}
              onChange={e => updateMatchName(currentMatch.id, e.target.value)}
              style={{ maxWidth: 250 }}
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowAddTeam(!showAddTeam)}
            >
              {showAddTeam ? t('cancel') : t('addTeam')}
            </button>
          </div>

          {showAddTeam && (
            <div style={{
              background: 'var(--bg-input)',
              padding: 16,
              borderRadius: 8,
              marginBottom: 16,
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{t('teamName')}</label>
                  <div style={{ marginTop: 4 }}>
                    <TeamAutocomplete
                      teams={teams}
                      value={teams.find(t => t.name.toLowerCase() === manualTeamName.toLowerCase())?.id ?? -1}
                      onChange={(id) => {
                        const team = teams.find(t => t.id === id)
                        if (team) setManualTeamName(team.name)
                      }}
                      excludeIds={(currentMatch?.results || []).map(r => r.teamId)}
                      placeholder={t('searchOrTypeTeam')}
                    />
                  </div>
                </div>
                <div style={{ width: 80 }}>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{t('position')}</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={manualPosition}
                    onChange={e => setManualPosition(e.target.value)}
                    placeholder={t('auto')}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </div>
              </div>

              <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{t('players')}</label>
              {manualPlayers.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', width: 20 }}>{i + 1}.</span>
                  <input
                    type="text"
                    value={p.name}
                    onChange={e => {
                      const updated = [...manualPlayers]
                      updated[i] = { ...updated[i], name: e.target.value }
                      setManualPlayers(updated)
                    }}
                    placeholder={t('playerName')}
                    style={{ flex: 1 }}
                  />
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('kills')}</label>
                  <input
                    type="number"
                    min="0"
                    value={p.kills}
                    onChange={e => {
                      const updated = [...manualPlayers]
                      updated[i] = { ...updated[i], kills: parseInt(e.target.value) || 0 }
                      setManualPlayers(updated)
                    }}
                    style={{ width: 60 }}
                  />
                  {manualPlayers.length > 1 && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setManualPlayers(manualPlayers.filter((_, j) => j !== i))}
                      style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                    >X</button>
                  )}
                </div>
              ))}

              <div className="btn-group" style={{ marginTop: 12 }}>
                {manualPlayers.length < 4 && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setManualPlayers([...manualPlayers, { name: '', kills: 0 }])}
                  >{t('addPlayer')}</button>
                )}
                <button className="btn btn-primary btn-sm" onClick={addManualTeam} disabled={!manualTeamName.trim()}>
                  {t('addTeamBtn')}
                </button>
              </div>
            </div>
          )}

          {currentMatch.results.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
              {t('noTeamsYet')}
            </div>
          )}

          {currentMatch.results.length > 0 && (
            <div className="ranking-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('pos')}</th>
                    <th>{t('team')}</th>
                    <th>{t('positionPts')}</th>
                    <th>{t('playersAndKills')}</th>
                    <th>{t('totalKills')}</th>
                    <th>{t('killPts')}</th>
                    <th>{t('total')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...currentMatch.results]
                    .sort((a, b) => a.position - b.position)
                    .map(result => {
                      const posPts = getPositionPoints(result.position)
                      const totalKills = getTeamTotalKills(result)
                      const killPointsVal = totalKills * killPts
                      const total = posPts + killPointsVal

                      return (
                        <tr key={result.teamId}>
                          <td>
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={result.position}
                              onChange={e => updateResult(currentMatch.id, result.teamId, 'position', e.target.value)}
                              style={{ width: 55 }}
                            />
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {result.teamId < 0 ? (
                              <TeamAutocomplete
                                teams={teams}
                                value={result.teamId}
                                onChange={(newId) => updateTeam(currentMatch.id, result.teamId, newId)}
                                excludeIds={currentMatch.results.map(r => r.teamId)}
                                placeholder={result.teamName}
                              />
                            ) : (
                              <TeamAutocomplete
                                teams={teams}
                                value={result.teamId}
                                onChange={(newId) => updateTeam(currentMatch.id, result.teamId, newId)}
                                excludeIds={currentMatch.results.map(r => r.teamId)}
                              />
                            )}
                          </td>
                          <td>
                            <span className={result.position <= 3 ? `rank-${result.position}` : ''}>
                              {posPts}
                            </span>
                          </td>
                          <td>
                            <div className="kill-inputs">
                              {(result.kills || []).map((kill, ki) => (
                                <div key={ki} className="kill-row">
                                  <input
                                    type="text"
                                    value={kill.player}
                                    onChange={e => updatePlayerName(currentMatch.id, result.teamId, ki, e.target.value)}
                                    placeholder={t('playerName')}
                                    style={{ flex: 1, minWidth: 80 }}
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    value={kill.count}
                                    onChange={e => updateKill(currentMatch.id, result.teamId, ki, e.target.value)}
                                  />
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => removePlayerFromResult(currentMatch.id, result.teamId, ki)}
                                    style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                                  >X</button>
                                </div>
                              ))}
                              {(result.kills || []).length < 4 && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => addPlayerToResult(currentMatch.id, result.teamId)}
                                  style={{ marginTop: 4, padding: '2px 8px', fontSize: '0.7rem' }}
                                >{t('addPlayer')}</button>
                              )}
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: totalKills > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                            {totalKills}
                          </td>
                          <td>{killPointsVal}</td>
                          <td>
                            <span className="total-cell">{total}</span>
                          </td>
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => removeTeamFromMatch(currentMatch.id, result.teamId)}
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            >{t('del')}</button>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {matches.length === 0 && !showUpload && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            {t('noMatchesYet')}
          </p>
        </div>
      )}
    </div>
  )
}
