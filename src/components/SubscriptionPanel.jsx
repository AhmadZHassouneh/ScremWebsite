import { useState, useEffect } from 'react'
import { useI18n } from '../i18n/index.jsx'

export default function SubscriptionPanel({ subscription, userEmail, uid }) {
  const { t } = useI18n()
  const currentPlan = subscription?.plan || 'free'
  const [selectedPlan, setSelectedPlan] = useState(currentPlan)

  // Follow the current plan when it changes (e.g. after checkout completes)
  useEffect(() => {
    setSelectedPlan(currentPlan)
  }, [currentPlan])
  const monthlyLink = import.meta.env.VITE_STRIPE_MONTHLY_LINK || ''
  const yearlyLink = import.meta.env.VITE_STRIPE_YEARLY_LINK || ''
  const portalLink = import.meta.env.VITE_STRIPE_PORTAL_LINK || ''
  const hasStripe = !!(monthlyLink || yearlyLink)

  const periodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null
  const canceledButPaid = subscription?.status === 'canceled' && periodEnd && periodEnd > new Date()

  const plans = [
    {
      id: 'free',
      name: t('free'),
      price: '$0',
      period: '',
      features: [
        t('feat_manualTeam'),
        t('feat_matchRecording'),
        t('feat_pointConfig'),
        t('feat_rankings'),
        t('feat_manualOverlay'),
      ],
    },
    {
      id: 'pro_monthly',
      name: t('proMonthly'),
      price: '$5',
      period: '/month',
      features: [
        t('feat_everything'),
        t('feat_aiOcr'),
        t('feat_aiTeam'),
        t('feat_aiLayout'),
      ],
    },
    {
      id: 'pro_yearly',
      name: t('proYearly'),
      price: '$48',
      period: '/year',
      badge: t('saveBadge'),
      features: [
        t('feat_everythingPro'),
        t('feat_12months'),
        t('feat_bestValue'),
      ],
    },
  ]

  const handleUpgrade = (planId) => {
    const link = planId === 'pro_monthly' ? monthlyLink : yearlyLink
    if (!link) return
    try {
      const url = new URL(link)
      const allowed = ['buy.stripe.com', 'checkout.stripe.com']
      if (!allowed.includes(url.hostname)) {
        console.error('Invalid payment URL: must be a Stripe domain')
        return
      }
      url.searchParams.set('client_reference_id', uid)
      if (userEmail) url.searchParams.set('prefilled_email', userEmail)
      window.open(url.toString(), '_blank')
    } catch {
      // Invalid URL — do not open
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <h2>{t('yourSubscription')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>{t('currentPlan')}</span>
          <span style={{
            background: currentPlan === 'free' ? 'var(--border)' : 'var(--gold)',
            color: currentPlan === 'free' ? 'var(--text)' : '#0a0a0a',
            padding: '4px 12px',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: '0.9rem',
          }}>
            {currentPlan === 'free' ? t('free') : currentPlan === 'pro_monthly' ? t('proMonthly') : t('proYearly')}
          </span>
          {subscription?.status === 'active' && (
            <span className="status-badge status-active">{t('active')}</span>
          )}
          {canceledButPaid && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t('proUntil', { date: periodEnd.toLocaleDateString() })}
            </span>
          )}
          {portalLink && currentPlan !== 'free' && (
            <a
              href={portalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm"
              style={{ background: 'var(--border)', color: 'var(--text)', textDecoration: 'none' }}
            >
              {t('manageSubscription')}
            </a>
          )}
        </div>
      </div>

      <div className="plans-grid">
        {plans.map(plan => {
          const isCurrent = currentPlan === plan.id
          const isSelected = selectedPlan === plan.id
          return (
            <div
              key={plan.id}
              className={`plan-card ${isSelected ? 'plan-current' : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              {plan.badge && <div className="plan-badge">{plan.badge}</div>}
              <h3>{plan.name}</h3>
              <div className="plan-price">
                {plan.price}
                {plan.period && <span className="plan-period">{plan.period}</span>}
              </div>
              <ul className="plan-features">
                {plan.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              {isCurrent ? (
                <button className="btn btn-primary" disabled style={{ width: '100%', opacity: 0.5 }}>
                  {t('currentPlanBtn')}
                </button>
              ) : plan.id !== 'free' ? (
                <button
                  className="btn"
                  style={{ width: '100%', background: 'var(--gold)', color: '#0a0a0a', fontWeight: 700 }}
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={!(plan.id === 'pro_monthly' ? monthlyLink : yearlyLink)}
                >
                  {(plan.id === 'pro_monthly' ? monthlyLink : yearlyLink) ? t('upgradeNow') : t('upgrade')}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {!hasStripe && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 20, fontSize: '0.9rem' }}>
          {t('paymentSetupMsg')}
        </p>
      )}
    </div>
  )
}
