import { useI18n } from '../i18n/index.jsx'

export default function RankingPanel({ rankings, matches }) {
  const { t } = useI18n()
  const totalKills = rankings.reduce((sum, r) => sum + r.kills, 0)
  const totalMatches = matches.length

  return (
    <div>
      <div className="summary-boxes">
        <div className="summary-box">
          <div className="value">{rankings.length}</div>
          <div className="label">{t('teams')}</div>
        </div>
        <div className="summary-box">
          <div className="value">{totalMatches}</div>
          <div className="label">{t('matchesPlayed')}</div>
        </div>
        <div className="summary-box">
          <div className="value">{totalKills}</div>
          <div className="label">{t('totalKillsLabel')}</div>
        </div>
        <div className="summary-box">
          <div className="value">{rankings[0]?.total || 0}</div>
          <div className="label">{t('highestScore')}</div>
        </div>
      </div>

      <div className="card">
        <h2>{t('overallRanking')}</h2>
        <div className="ranking-table">
          <table>
            <thead>
              <tr>
                <th>{t('rank')}</th>
                <th>{t('team')}</th>
                <th>{t('wins')}</th>
                <th>{t('positionPts')}</th>
                <th>{t('totalKills')}</th>
                <th>{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((team, index) => {
                const rank = index + 1
                let rankClass = ''
                if (rank === 1) rankClass = 'rank-1'
                else if (rank === 2) rankClass = 'rank-2'
                else if (rank === 3) rankClass = 'rank-3'

                return (
                  <tr key={team.id}>
                    <td className={rankClass} style={{ fontSize: '1.2rem' }}>
                      {rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                    </td>
                    <td style={{ fontWeight: rank <= 3 ? 700 : 400 }}>
                      {team.name}
                    </td>
                    <td className={rankClass}>{team.wins}</td>
                    <td>{team.positionPts}</td>
                    <td>{team.kills}</td>
                    <td>
                      <span className="total-cell">{team.total}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
