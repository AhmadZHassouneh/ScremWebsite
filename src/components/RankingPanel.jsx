export default function RankingPanel({ rankings, matches }) {
  const totalKills = rankings.reduce((sum, r) => sum + r.kills, 0)
  const totalMatches = matches.length

  return (
    <div>
      <div className="summary-boxes">
        <div className="summary-box">
          <div className="value">{rankings.length}</div>
          <div className="label">Teams</div>
        </div>
        <div className="summary-box">
          <div className="value">{totalMatches}</div>
          <div className="label">Matches Played</div>
        </div>
        <div className="summary-box">
          <div className="value">{totalKills}</div>
          <div className="label">Total Kills</div>
        </div>
        <div className="summary-box">
          <div className="value">{rankings[0]?.total || 0}</div>
          <div className="label">Highest Score</div>
        </div>
      </div>

      <div className="card">
        <h2>Overall Ranking</h2>
        <div className="ranking-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Wins</th>
                <th>Position Pts</th>
                <th>Kills</th>
                <th>Kill Pts</th>
                <th>Total</th>
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
                    <td>{team.killPtsTotal}</td>
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
