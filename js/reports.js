// ============================================================
// reports.js — Standings, player reports, stats calculations
// ============================================================

const Reports = (() => {

  function computeStandings(scores, players, pairings, upToWeek = null, rankingMethod = 'avgptdiff') {
    const stats = {};

    players.forEach(p => {
      if (p.role === 'sub') return; // SUBs play but don't appear in standings
      if (p.active === 'pend') return; // Pending players don't appear in standings
      stats[p.name] = {
        name: p.name,
        wins: 0, losses: 0,
        points: 0, pointsAgainst: 0,
        games: 0, byes: 0,
        winPct: 0, ptDiff: 0, rank: 0
      };
    });

    scores.forEach(s => {
      if (upToWeek !== null && parseInt(s.week) > upToWeek) return;
      if (!s.p1 || !s.p3) return;
      // Skip games where scores have not been entered
      if (s.score1 === '' || s.score1 === null || s.score1 === undefined ||
          s.score2 === '' || s.score2 === null || s.score2 === undefined) return;
      const score1 = parseInt(s.score1);
      const score2 = parseInt(s.score2);
      if (isNaN(score1) || isNaN(score2)) return;

      const team1 = [s.p1, s.p2].filter(Boolean);
      const team2 = [s.p3, s.p4].filter(Boolean);
      const t1win = score1 > score2;

      team1.forEach(p => {
        if (!stats[p]) return; // not a registered league player — skip
        stats[p].wins += t1win ? 1 : 0;
        stats[p].losses += t1win ? 0 : 1;
        stats[p].points += score1;
        stats[p].pointsAgainst += score2;
        stats[p].games++;
      });

      team2.forEach(p => {
        if (!stats[p]) return; // not a registered league player — skip
        stats[p].wins += t1win ? 0 : 1;
        stats[p].losses += t1win ? 1 : 0;
        stats[p].points += score2;
        stats[p].pointsAgainst += score1;
        stats[p].games++;
      });
    });

    // Count byes
    pairings.forEach(p => {
      if (p.type === 'bye') {
        if (upToWeek !== null && parseInt(p.week) > upToWeek) return;
        [p.p1, p.p2, p.p3, p.p4].filter(Boolean).forEach(name => {
          if (stats[name]) stats[name].byes++;
        });
      }
    });

    const list = Object.values(stats).map(s => {
      const total = s.wins + s.losses;
      return {
        ...s,
        winPct: total > 0 ? s.wins / total : 0,
        ptDiff:    s.points - s.pointsAgainst,
        avgPtDiff: s.games > 0 ? (s.points - s.pointsAgainst) / s.games : 0,
        ptsPct:    (s.points + s.pointsAgainst) > 0 ? s.points / (s.points + s.pointsAgainst) : 0
      };
    });

    list.sort((a, b) => {
      if (Math.abs(b.winPct - a.winPct) > 0.0001) return b.winPct - a.winPct;
      if (rankingMethod === 'ptspct') return b.ptsPct - a.ptsPct;
      return b.avgPtDiff - a.avgPtDiff;
    });

    list.forEach((s, i) => { s.rank = s.games > 0 ? i + 1 : '-'; });
    return list;
  }

  function computePlayerReport(playerName, scores, standings) {
    const games = [];

    scores.forEach(s => {
      if (!s.p1) return;
      // Skip games where scores have not been entered
      if (s.score1 === '' || s.score1 === null || s.score1 === undefined ||
          s.score2 === '' || s.score2 === null || s.score2 === undefined) return;
      if (isNaN(parseInt(s.score1)) || isNaN(parseInt(s.score2))) return;
      const team1 = [s.p1, s.p2].filter(Boolean);
      const team2 = [s.p3, s.p4].filter(Boolean);

      let partner = '', opponents = [], myScore = 0, oppScore = 0, won = false, inGame = false;

      if (team1.includes(playerName)) {
        inGame = true;
        partner = team1.find(p => p !== playerName) || '';
        opponents = team2;
        myScore = parseInt(s.score1);
        oppScore = parseInt(s.score2);
        won = myScore > oppScore;
      } else if (team2.includes(playerName)) {
        inGame = true;
        partner = team2.find(p => p !== playerName) || '';
        opponents = team1;
        myScore = parseInt(s.score2);
        oppScore = parseInt(s.score1);
        won = myScore > oppScore;
      }

      if (inGame) {
        games.push({
          week: parseInt(s.week),
          round: parseInt(s.round),
          court: s.court,
          partner, opponents, myScore, oppScore, won
        });
      }
    });

    games.sort((a, b) => (a.week * 100 + a.round) - (b.week * 100 + b.round));

    const standing = standings.find(s => s.name === playerName);

    // Partner frequency
    const partnerFreq = {};
    const oppFreq = {};
    games.forEach(g => {
      if (g.partner) partnerFreq[g.partner] = (partnerFreq[g.partner] || 0) + 1;
      g.opponents.forEach(o => { oppFreq[o] = (oppFreq[o] || 0) + 1; });
    });

    return { player: playerName, games, standing, partnerFreq, oppFreq };
  }

  function computeWeeklyStandings(scores, players, pairings, week, rankingMethod = 'avgptdiff') {
    const weekScores   = scores.filter(s => parseInt(s.week) === parseInt(week));
    const weekPairings = pairings.filter(p => parseInt(p.week) === parseInt(week));
    return computeStandings(weekScores, players, weekPairings, null, rankingMethod);
  }

  function pct(val) {
    return (val * 100).toFixed(1) + '%';
  }

  function wl(wins, losses) {
    return `${wins}/${losses}`;
  }

  return { computeStandings, computePlayerReport, computeWeeklyStandings, pct, wl };
})();
