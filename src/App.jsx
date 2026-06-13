import { useState, useEffect, useCallback, useRef } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from './services/firebase'
import './App.css'
import AuthPage from './components/AuthPage'
import TeamsPanel from './components/TeamsPanel'
import MatchPanel from './components/MatchPanel'
import RankingPanel from './components/RankingPanel'
import PointSystemPanel from './components/PointSystemPanel'
import DesignPanel from './components/DesignPanel'
import ApiKeyInput from './components/ApiKeyInput'
import { defaultPointSystem, killPoints } from './data/teams'

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
  const uid = user.uid
  const [dataLoading, setDataLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ranking')
  const [teams, setTeams] = useState([])
  const [pointSystem, setPointSystem] = useState(defaultPointSystem)
  const [killPts, setKillPts] = useState(killPoints)
  const [matches, setMatches] = useState([])
  const [apiKey, setApiKey] = useState('')
  const initialLoadDone = useRef(false)

  // Load user data from Firestore on mount
  useEffect(() => {
    async function loadFromFirestore() {
      try {
        const snap = await getDoc(doc(db, 'users', uid))
        if (snap.exists()) {
          const data = snap.data()
          if (data.teams) setTeams(data.teams)
          if (data.pointSystem) setPointSystem(data.pointSystem)
          if (data.killPts != null) setKillPts(data.killPts)
          if (data.matches) setMatches(data.matches)
          if (data.apiKey) setApiKey(data.apiKey)
        }
      } catch (err) {
        console.error('Failed to load data from Firestore:', err)
      } finally {
        setDataLoading(false)
        initialLoadDone.current = true
      }
    }
    loadFromFirestore()
  }, [uid])

  // Save user data to Firestore whenever it changes
  const saveTimeout = useRef(null)
  const saveToFirestore = useCallback((data) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      setDoc(doc(db, 'users', uid), data, { merge: true }).catch(err =>
        console.error('Failed to save data to Firestore:', err)
      )
    }, 500)
  }, [uid])

  useEffect(() => {
    if (!initialLoadDone.current) return
    saveToFirestore({ teams, pointSystem, killPts, matches, apiKey })
  }, [teams, pointSystem, killPts, matches, apiKey, saveToFirestore])

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

  if (dataLoading) {
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
