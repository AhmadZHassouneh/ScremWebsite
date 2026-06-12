import { useState, useEffect } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './services/firebase'
import './App.css'
import AuthPage from './components/AuthPage'
import TeamsPanel from './components/TeamsPanel'
import MatchPanel from './components/MatchPanel'
import RankingPanel from './components/RankingPanel'
import PointSystemPanel from './components/PointSystemPanel'
import DesignPanel from './components/DesignPanel'
import ApiKeyInput from './components/ApiKeyInput'
import { initialTeams, defaultPointSystem, killPoints } from './data/teams'

const STORAGE_KEY = 'pubg-screm-data'
const API_KEY_STORAGE = 'pubg-screm-api-key'

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return null
}

function App() {
  const [user, setUser] = useState(undefined) // undefined = loading, null = not logged in
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  const handleLogout = async () => {
    await signOut(auth)
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{
          width: 40, height: 40,
          border: '4px solid var(--border)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Show auth page if not logged in
  if (!user) {
    return <AuthPage />
  }

  // Main app (logged in)
  return <MainApp user={user} onLogout={handleLogout} />
}

function MainApp({ user, onLogout }) {
  const saved = loadData()
  const [activeTab, setActiveTab] = useState('ranking')
  const [teams, setTeams] = useState(saved?.teams || initialTeams)
  const [pointSystem, setPointSystem] = useState(saved?.pointSystem || defaultPointSystem)
  const [killPts, setKillPts] = useState(saved?.killPts ?? killPoints)
  const [matches, setMatches] = useState(saved?.matches || [])
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ teams, pointSystem, killPts, matches }))
  }, [teams, pointSystem, killPts, matches])

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE, apiKey)
    } else {
      localStorage.removeItem(API_KEY_STORAGE)
    }
  }, [apiKey])

  const getPositionPoints = (position) => {
    const entry = pointSystem.find(p => p.position === position)
    if (entry) return entry.points
    const rangeEntry = pointSystem.find(p => typeof p.position === 'string' && p.position.includes('-'))
    if (rangeEntry) {
      const [min, max] = rangeEntry.position.split('-').map(Number)
      if (position >= min && position <= max) return rangeEntry.points
    }
    return 0
  }

  const calculateRankings = () => {
    return teams.map(team => {
      let totalWins = 0
      let totalPositionPts = 0
      let totalKills = 0

      matches.forEach(match => {
        const teamMatch = match.results.find(r => r.teamId === team.id)
        if (teamMatch) {
          const posPts = getPositionPoints(teamMatch.position)
          totalPositionPts += posPts
          if (teamMatch.position === 1) totalWins++
          const matchKills = (teamMatch.kills || []).reduce((sum, k) => sum + (k.count || 0), 0)
          totalKills += matchKills
        }
      })

      return {
        ...team,
        wins: totalWins,
        positionPts: totalPositionPts,
        kills: totalKills,
        killPtsTotal: totalKills * killPts,
        total: totalPositionPts + (totalKills * killPts),
      }
    }).sort((a, b) => b.total - a.total)
  }

  const tabs = [
    { id: 'ranking', label: 'Overall Ranking' },
    { id: 'matches', label: 'Matches' },
    { id: 'teams', label: 'Teams' },
    { id: 'points', label: 'Point System' },
    { id: 'design', label: 'Design' },
  ]

  return (
    <>
      <header className="app-header">
        <div>
          <h1>PUBG Tournament Tracker</h1>
          <p>Screm Tournament Point Calculator</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {user.displayName || user.email}
          </span>
          <button
            onClick={onLogout}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <ApiKeyInput apiKey={apiKey} setApiKey={setApiKey} />

      <nav className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'ranking' && (
        <RankingPanel rankings={calculateRankings()} matches={matches} />
      )}
      {activeTab === 'matches' && (
        <MatchPanel
          teams={teams}
          matches={matches}
          setMatches={setMatches}
          pointSystem={pointSystem}
          getPositionPoints={getPositionPoints}
          killPts={killPts}
          apiKey={apiKey}
        />
      )}
      {activeTab === 'teams' && (
        <TeamsPanel teams={teams} setTeams={setTeams} apiKey={apiKey} />
      )}
      {activeTab === 'points' && (
        <PointSystemPanel
          pointSystem={pointSystem}
          setPointSystem={setPointSystem}
          killPts={killPts}
          setKillPts={setKillPts}
        />
      )}
      {activeTab === 'design' && (
        <DesignPanel rankings={calculateRankings()} apiKey={apiKey} />
      )}
    </>
  )
}

export default App
