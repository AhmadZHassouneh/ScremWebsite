import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useI18n } from '../i18n/index.jsx'

const PLAN_LABELS = { free: 'Free', pro_monthly: 'Pro Monthly', pro_yearly: 'Pro Yearly' }
const MONTHLY_PRICE = 5
const YEARLY_PRICE = 48

export default function AdminPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { t } = useI18n()

  const loadUsers = async () => {
    setLoading(true)
    try {
      const snapshot = await getDocs(collection(db, 'users'))
      setUsers(snapshot.docs.map(d => ({ uid: d.id, ...d.data() })))
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const setPlan = async (uid, plan) => {
    try {
      const status = plan === 'free' ? 'none' : 'active'
      const updatedAt = new Date().toISOString()
      // Dot-path update keeps stripeCustomerId/stripeSubscriptionId intact
      // so Stripe webhooks can still find this user
      await updateDoc(doc(db, 'users', uid), {
        'subscription.plan': plan,
        'subscription.status': status,
        'subscription.updatedAt': updatedAt,
      })
      setUsers(prev => prev.map(u => u.uid === uid
        ? { ...u, subscription: { ...u.subscription, plan, status, updatedAt } }
        : u))
    } catch (err) {
      console.error('Failed to update plan:', err)
    }
  }

  const toggleBan = async (uid, banned) => {
    try {
      await updateDoc(doc(db, 'users', uid), { banned: !banned })
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, banned: !banned } : u))
    } catch (err) {
      console.error('Failed to toggle ban:', err)
    }
  }

  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (u.email || '').toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q)
  })

  const proMonthly = users.filter(u => u.subscription?.plan === 'pro_monthly' && u.subscription?.status === 'active').length
  const proYearly = users.filter(u => u.subscription?.plan === 'pro_yearly' && u.subscription?.status === 'active').length
  const bannedCount = users.filter(u => u.banned).length
  const monthlyRevenue = (proMonthly * MONTHLY_PRICE) + (proYearly * Math.round(YEARLY_PRICE / 12 * 100) / 100)

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ width: 40, height: 40, border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div>
      <div className="summary-boxes">
        <div className="summary-box">
          <div className="value">{users.length}</div>
          <div className="label">{t('totalUsers')}</div>
        </div>
        <div className="summary-box">
          <div className="value">{proMonthly + proYearly}</div>
          <div className="label">{t('proSubscribers')}</div>
        </div>
        <div className="summary-box">
          <div className="value" style={{ color: 'var(--gold)' }}>${monthlyRevenue.toFixed(0)}</div>
          <div className="label">{t('monthlyRevenue')}</div>
        </div>
        <div className="summary-box">
          <div className="value" style={{ color: 'var(--gold)' }}>${(proMonthly * MONTHLY_PRICE * 12 + proYearly * YEARLY_PRICE).toFixed(0)}</div>
          <div className="label">{t('projectedYearly')}</div>
        </div>
        <div className="summary-box">
          <div className="value" style={{ color: bannedCount ? 'var(--danger)' : undefined }}>{bannedCount}</div>
          <div className="label">{t('banned')}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{t('usersCount', { count: filtered.length })}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder={t('searchUsers')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
            <button className="btn btn-sm btn-primary" onClick={loadUsers}>{t('refresh')}</button>
          </div>
        </div>

        <div className="ranking-table">
          <table>
            <thead>
              <tr>
                <th>{t('email')}</th>
                <th>{t('displayName')}</th>
                <th>{t('tabPlan')}</th>
                <th>{t('status')}</th>
                <th>{t('joined')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.uid} style={u.banned ? { opacity: 0.5 } : {}}>
                  <td style={{ fontSize: '0.85rem' }}>{u.email || '-'}</td>
                  <td>{u.displayName || '-'}</td>
                  <td>
                    <select
                      value={u.subscription?.plan || 'free'}
                      onChange={e => setPlan(u.uid, e.target.value)}
                      style={{ width: 'auto', minWidth: 130 }}
                    >
                      {Object.entries(PLAN_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`status-badge status-${u.subscription?.status || 'none'}`}>
                      {u.subscription?.status || 'free'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.banned ? 'btn-primary' : 'btn-danger'}`}
                      onClick={() => toggleBan(u.uid, !!u.banned)}
                    >
                      {u.banned ? t('unban') : t('ban')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>{t('noUsersFound')}</p>
        )}
      </div>
    </div>
  )
}
