// ============================================================
// pairings.js — Pairing optimizer
// Minimizes repeat partners/opponents, equalizes byes across
// the season, and minimizes byes within each session.
// All penalty weights are configurable via league Setup.
// ============================================================

const Pairings = (() => {

  // Default weights — can be overridden via config
  const DEFAULTS = {
    sessionPartnerWeight:   50,   // repeat partner this session
    sessionOpponentWeight:  20,   // repeat opponent this session
    historyPartnerWeight:   10,   // repeat partner from prior weeks
    historyOpponentWeight:  3,    // repeat opponent from prior weeks
    byeVarianceWeight:      20,   // variance of season bye counts
    sessionByeWeight:       30,   // penalty per bye a player takes this session
    rankBalanceWeight:      15,   // penalty per rank-point difference between team averages
  };

  // Score a full set of pairings for a week. Lower is better.
  function scorePairings(weekPairings, historyScores, byeCounts, weights) {
    const w = Object.assign({}, DEFAULTS, weights);
    let score = 0;

    // Track within-session pairings round by round
    const sessionPartners  = {};
    const sessionOpponents = {};
    const sessionByes      = {};   // how many byes each player has this session

    const gamesByRound = {};
    weekPairings.forEach(g => {
      if (!gamesByRound[g.round]) gamesByRound[g.round] = [];
      gamesByRound[g.round].push(g);
    });

    Object.keys(gamesByRound).sort((a, b) => a - b).forEach(round => {
      const games = gamesByRound[round].filter(g => g.type === 'game');
      const byes  = gamesByRound[round].filter(g => g.type === 'bye');

      // Score games in this round
      games.forEach(game => {
        const { p1, p2, p3, p4 } = game;

        // Cross-season history penalties
        const pk1 = [p1, p2].sort().join('|');
        const pk2 = [p3, p4].sort().join('|');
        score += (historyScores.partners[pk1] || 0) * w.historyPartnerWeight;
        score += (historyScores.partners[pk2] || 0) * w.historyPartnerWeight;

        [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a, b]) => {
          const k = [a, b].sort().join('|');
          score += (historyScores.opponents[k] || 0) * w.historyOpponentWeight;
        });

        // Within-session repeat penalties
        score += (sessionPartners[pk1] || 0) * w.sessionPartnerWeight;
        score += (sessionPartners[pk2] || 0) * w.sessionPartnerWeight;

        [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a, b]) => {
          const k = [a, b].sort().join('|');
          score += (sessionOpponents[k] || 0) * w.sessionOpponentWeight;
        });

        // Rank balance penalty — penalize games where team average ranks differ
        if (w.rankBalanceWeight > 0 && w.rankMap) {
          const r1 = w.rankMap[p1] || 999;
          const r2 = p2 ? (w.rankMap[p2] || 999) : r1;
          const r3 = w.rankMap[p3] || 999;
          const r4 = p4 ? (w.rankMap[p4] || 999) : r3;
          const team1Avg = (r1 + r2) / 2;
          const team2Avg = (r3 + r4) / 2;
          score += Math.abs(team1Avg - team2Avg) * w.rankBalanceWeight;
        }
      });

      // Penalize byes this session — each bye a player takes this week costs points.
      // Penalty scales up for each additional bye the same player takes this session,
      // driving the optimizer to spread byes across different players each round.
      byes.forEach(g => {
        [g.p1, g.p2, g.p3, g.p4].filter(Boolean).forEach(p => {
          const already = sessionByes[p] || 0;
          score += w.sessionByeWeight * (already + 1);
        });
      });

      // Record this round into session history for subsequent rounds
      games.forEach(game => {
        const { p1, p2, p3, p4 } = game;
        const pk1 = [p1, p2].sort().join('|');
        const pk2 = [p3, p4].sort().join('|');
        sessionPartners[pk1] = (sessionPartners[pk1] || 0) + 1;
        sessionPartners[pk2] = (sessionPartners[pk2] || 0) + 1;
        [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a, b]) => {
          const k = [a, b].sort().join('|');
          sessionOpponents[k] = (sessionOpponents[k] || 0) + 1;
        });
      });
      byes.forEach(g => {
        [g.p1, g.p2, g.p3, g.p4].filter(Boolean).forEach(p => {
          sessionByes[p] = (sessionByes[p] || 0) + 1;
        });
      });
    });

    // Season-level bye variance penalty
    const byeValues = Object.values(byeCounts);
    if (byeValues.length > 0) {
      const mean = byeValues.reduce((a, b) => a + b, 0) / byeValues.length;
      const variance = byeValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / byeValues.length;
      score += variance * w.byeVarianceWeight;
    }

    return score;
  }

  // Build history scores from past pairings
  function buildHistory(pastPairings) {
    const partners  = {};
    const opponents = {};
    pastPairings.forEach(game => {
      if (game.type !== 'game') return;
      const { p1, p2, p3, p4 } = game;
      if (p1 && p2) { const k = [p1,p2].sort().join('|'); partners[k] = (partners[k]||0)+1; }
      if (p3 && p4) { const k = [p3,p4].sort().join('|'); partners[k] = (partners[k]||0)+1; }
      [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a,b]) => {
        if (a && b) { const k = [a,b].sort().join('|'); opponents[k] = (opponents[k]||0)+1; }
      });
    });
    return { partners, opponents };
  }

  // Build bye counts from past pairings
  function buildByeCounts(players, pastPairings) {
    const counts = {};
    players.forEach(p => { counts[p] = 0; });
    pastPairings.forEach(game => {
      if (game.type === 'bye') {
        [game.p1, game.p2, game.p3, game.p4].filter(Boolean).forEach(p => {
          if (counts[p] !== undefined) counts[p]++;
        });
      }
    });
    return counts;
  }

  // Generate one random assignment of players to courts/rounds
  function generateRandom(presentPlayers, courts, rounds) {
    const result = [];
    for (let round = 1; round <= rounds; round++) {
      const shuffled = [...presentPlayers].sort(() => Math.random() - 0.5);
      const playersPerRound = courts * 4;
      const playing = shuffled.slice(0, playersPerRound);
      const sitting = shuffled.slice(playersPerRound);

      for (let c = 0; c < courts; c++) {
        const base = c * 4;
        if (base + 3 < playing.length) {
          result.push({
            round, court: c + 1,
            p1: playing[base], p2: playing[base+1],
            p3: playing[base+2], p4: playing[base+3],
            type: 'game'
          });
        }
      }
      sitting.forEach(p => {
        result.push({ round, court: 'bye', p1: p, p2: '', p3: '', p4: '', type: 'bye' });
      });
    }
    return result;
  }

  // Main optimizer — tries N iterations, returns best
  // standings: array of {name, rank} used for rank-balance scoring
  function optimize({ presentPlayers, courts, rounds, pastPairings, tries = 100, weights = {}, standings = [] }) {
    if (presentPlayers.length < 4) {
      return { pairings: [], score: 0, error: 'Not enough players' };
    }

    const history   = buildHistory(pastPairings);
    const byeCounts = buildByeCounts(presentPlayers, pastPairings);

    // Build rank lookup map: playerName -> rank (lower = better)
    const rankMap = {};
    standings.forEach(s => { if (s.name && s.rank) rankMap[s.name] = s.rank; });
    // Assign a neutral mid-rank to any player not yet in standings
    const midRank = standings.length > 0 ? Math.ceil(standings.length / 2) : 5;
    presentPlayers.forEach(p => { if (!rankMap[p]) rankMap[p] = midRank; });
    const weightsWithRank = Object.assign({}, weights, { rankMap });

    let bestPairings = null;
    let bestScore    = Infinity;

    for (let i = 0; i < tries; i++) {
      const candidate = generateRandom(presentPlayers, courts, rounds);

      const candidateByeCounts = { ...byeCounts };
      candidate.forEach(g => {
        if (g.type === 'bye') {
          [g.p1,g.p2,g.p3,g.p4].filter(Boolean).forEach(p => {
            if (candidateByeCounts[p] !== undefined) candidateByeCounts[p]++;
          });
        }
      });

      const score = scorePairings(candidate, history, candidateByeCounts, weightsWithRank);
      if (score < bestScore) {
        bestScore    = score;
        bestPairings = candidate;
      }
    }

    return { pairings: bestPairings, score: bestScore };
  }

  return { optimize, buildHistory, buildByeCounts, DEFAULTS };
})();
