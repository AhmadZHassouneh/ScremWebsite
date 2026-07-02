import { useState, useEffect, useCallback, useRef } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './services/firebase'
import './App.css'
import AuthPage from './components/AuthPage'
import TeamsPanel from './components/TeamsPanel'
import MatchPanel from './components/MatchPanel'
import RankingPanel from './components/RankingPanel'
import PointSystemPanel from './components/PointSystemPanel'
import DesignPanel from './components/DesignPanel'
import ApiKeyInput from './components/ApiKeyInput'
import AdminPanel from './components/AdminPanel'
import SubscriptionPanel from './components/SubscriptionPanel'
import { defaultPointSystem, killPoints } from './data/teams'
import { useI18n } from './i18n/index.jsx'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || ''

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

function SettingsDropdown() {
  const { lang, setLang, t, theme, setTheme, languages } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const themes = [
    { id: 'dark', label: t('themeDark') },
    { id: 'light', label: t('themeLight') },
    { id: 'blue', label: t('themeBlue') },
    { id: 'green', label: t('themeGreen') },
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-input)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {languages.find(l => l.code === lang)?.flag || 'EN'} / {themes.find(th => th.id === theme)?.label}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 6,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 14,
          zIndex: 1000,
          minWidth: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              {t('language')}
            </label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', fontSize: '0.85rem' }}
            >
              {languages.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              {t('theme')}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {themes.map(th => (
                <button
                  key={th.id}
                  onClick={() => setTheme(th.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: theme === th.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: theme === th.id ? 'var(--bg-input)' : 'transparent',
                    color: theme === th.id ? 'var(--primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {th.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MainApp({ user, onLogout }) {
  const { t } = useI18n()
  const uid = user.uid
  const isAdmin = !!(ADMIN_EMAIL && user.email === ADMIN_EMAIL)
  const [dataLoading, setDataLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ranking')
  const [teams, setTeams] = useState([])
  const [pointSystem, setPointSystem] = useState(defaultPointSystem)
  const [killPts, setKillPts] = useState(killPoints)
  const [matches, setMatches] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [subscription, setSubscription] = useState({ plan: 'free', status: 'none' })
  const [banned, setBanned] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const initialLoadDone = useRef(false)

  // Pro while active, and after cancellation until the paid period actually ends
  const canceledButPaid = subscription.status === 'canceled'
    && subscription.currentPeriodEnd
    && new Date(subscription.currentPeriodEnd) > new Date()
  const isPro = isAdmin || ((subscription.status === 'active' || canceledButPaid) && subscription.plan !== 'free')
  const effectiveApiKey = isPro ? apiKey : ''

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
        // Store/update profile info on every login
        await setDoc(doc(db, 'users', uid), {
          email: user.email || '',
          displayName: user.displayName || '',
          lastLogin: new Date().toISOString(),
          ...(!snap.exists() || !snap.data()?.createdAt ? { createdAt: new Date().toISOString() } : {}),
        }, { merge: true })
        initialLoadDone.current = true
      } catch (err) {
        // Do NOT enable saving after a failed load — a save now would
        // overwrite the user's cloud data with empty defaults
        console.error('Failed to load data from Firestore:', err)
        setLoadError(true)
      } finally {
        setDataLoading(false)
      }
    }
    loadFromFirestore()
  }, [uid])

  // Live subscription/ban status (updates instantly after Stripe checkout or admin action)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      setSubscription(data.subscription || { plan: 'free', status: 'none' })
      setBanned(!!data.banned)
    }, (err) => console.error('Subscription listener error:', err))
    return unsubscribe
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
    for (const p of pointSystem) {
      if (typeof p.position === 'string' && p.position.includes('-')) {
        const [min, max] = p.position.split('-').map(Number)
        if (!isNaN(min) && !isNaN(max) && position >= min && position <= max) return p.points
      }
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

  // Loading the user's cloud data failed — block the app so we never
  // overwrite their saved data with empty local state
  if (loadError) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 20,
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--danger)',
          borderRadius: 16,
          padding: 40,
          textAlign: 'center',
          maxWidth: 420,
        }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: 12 }}>{t('loadFailed')}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>{t('loadFailedMsg')}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>{t('retry')}</button>
        </div>
      </div>
    )
  }

  // Show banned screen
  if (banned && !isAdmin) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 20,
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--danger)',
          borderRadius: 16,
          padding: 40,
          textAlign: 'center',
          maxWidth: 420,
        }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: 12 }}>{t('accountSuspended')}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            {t('accountSuspendedMsg')}
          </p>
          <button className="btn btn-primary" onClick={onLogout}>{t('logout')}</button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'ranking', label: t('tabRanking') },
    { id: 'matches', label: t('tabMatches') },
    { id: 'teams', label: t('tabTeams') },
    { id: 'points', label: t('tabPoints') },
    { id: 'design', label: t('tabDesign') },
    { id: 'subscription', label: t('tabPlan') },
    ...(isAdmin ? [{ id: 'admin', label: t('tabAdmin') }] : []),
  ]

  return (
    <>
      <header className="app-header">
        <div>
          <h1>{t('appTitle')}</h1>
          <p>{t('appSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isAdmin && (
            <span style={{
              background: 'var(--primary)',
              color: '#0a0a0a',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              {t('admin')}
            </span>
          )}
          {isPro && !isAdmin && (
            <span style={{
              background: 'var(--gold)',
              color: '#0a0a0a',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              {t('pro')}
            </span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {user.displayName || user.email}
          </span>
          <SettingsDropdown />
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
            {t('logout')}
          </button>
        </div>
      </header>

      {isPro ? (
        <ApiKeyInput apiKey={apiKey} setApiKey={setApiKey} />
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, var(--bg-card), var(--bg-input))',
          border: '1px solid var(--gold)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <span style={{ color: 'var(--gold)', fontSize: '0.9rem', fontWeight: 600 }}>
            {t('upgradeBanner')}
          </span>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--gold)', color: '#0a0a0a', fontWeight: 700 }}
            onClick={() => setActiveTab('subscription')}
          >
            {t('viewPlans')}
          </button>
        </div>
      )}

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
          getPositionPoints={getPositionPoints}
          killPts={killPts}
          apiKey={effectiveApiKey}
        />
      )}
      {activeTab === 'teams' && (
        <TeamsPanel teams={teams} setTeams={setTeams} apiKey={effectiveApiKey} />
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
        <DesignPanel rankings={calculateRankings()} apiKey={effectiveApiKey} />
      )}
      {activeTab === 'subscription' && (
        <SubscriptionPanel subscription={subscription} userEmail={user.email} uid={uid} />
      )}
      {activeTab === 'admin' && isAdmin && (
        <AdminPanel />
      )}
    </>
  )
}

export default App
