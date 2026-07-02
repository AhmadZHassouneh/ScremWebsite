import { useState } from 'react'
import { useI18n } from '../i18n/index.jsx'

export default function ApiKeyInput({ apiKey, setApiKey }) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  const [tempKey, setTempKey] = useState(apiKey)

  const save = () => {
    setApiKey(tempKey.trim())
    setShow(false)
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
        {t('aiVisionLabel')}
      </span>
      {apiKey ? (
        <>
          <span style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>
            {t('apiKeySet', { suffix: apiKey.slice(-6) })}
          </span>
          <button className="btn btn-sm" style={{ background: 'var(--border)', color: 'var(--text)' }} onClick={() => { setShow(!show); setTempKey(apiKey) }}>
            {t('change')}
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => setApiKey('')}>
            {t('remove')}
          </button>
        </>
      ) : (
        <>
          <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
            {t('noApiKey')}{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: 'var(--primary)' }}>
              {t('googleAiStudio')}
            </a>
          </span>
          <button className="btn btn-sm btn-primary" onClick={() => setShow(!show)}>
            {t('setKey')}
          </button>
        </>
      )}

      {show && (
        <div style={{ width: '100%', display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="password"
            value={tempKey}
            onChange={e => setTempKey(e.target.value)}
            placeholder="AIza..."
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-sm" onClick={save}>{t('save')}</button>
        </div>
      )}
    </div>
  )
}
