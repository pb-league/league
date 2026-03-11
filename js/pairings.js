// ============================================================
// pairings.js — Pairing optimizer
// Minimizes repeat partners/opponents and equalizes byes
// ============================================================

const Pairings = (() => {

  // Score a full set of pairings for a week.
  // Lower is better.
  function scorePairings(weekPairings, historyScores, byeCounts) {
    let score = 0;

    weekPairings.forEach(game => {
      if (game.type !== 'game') return;
      const { p1, p2, p3, p4 } = game;

      // Penalty for repeat partner pair
      const partnerKey1 = [p1, p2].sort().join('|');
      const partnerKey2 = [p3, p4].sort().join('|');
      score += (historyScores.partners[partnerKey1] || 0) * 10;
      score += (historyScores.partners[partnerKey2] || 0) * 10;

      // Penalty for repeat opponent pairs
      const oppKey1 = [p1, p3].sort().join('|');
      const oppKey2 = [p1, p4].sort().join('|');
      const oppKey3 = [p2, p3].sort().join('|');
      const oppKey4 = [p2, p4].sort().join('|');
      score += (historyScores.opponents[oppKey1] || 0) * 3;
      score += (historyScores.opponents[oppKey2] || 0) * 3;
      score += (historyScores.opponents[oppKey3] || 0) * 3;
      score += (historyScores.opponents[oppKey4] || 0) * 3;
    });

    // Penalty for unequal byes — variance of bye counts
    const byeValues = Object.values(byeCounts);
    if (byeValues.length > 0) {
      const mean = byeValues.reduce((a, b) => a + b, 0) / byeValues.length;
      const variance = byeValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / byeValues.length;
      score += variance * 20;
    }

    return score;
  }

  // Build history scores from past pairings
  function buildHistory(pastPairings) {
    const partners = {};
    const opponents = {};

    pastPairings.forEach(game => {
      if (game.type !== 'game') return;
      const { p1, p2, p3, p4 } = game;
      if (p1 && p2) {
        const k = [p1, p2].sort().join('|');
        partners[k] = (partners[k] || 0) + 1;
      }
      if (p3 && p4) {
        const k = [p3, p4].sort().join('|');
        partners[k] = (partners[k] || 0) + 1;
      }
      [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a,b]) => {
        if (a && b) {
          const k = [a, b].sort().join('|');
          opponents[k] = (opponents[k] || 0) + 1;
        }
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
      // Shuffle players
      const shuffled = [...presentPlayers].sort(() => Math.random() - 0.5);
      const playersPerRound = courts * 4;
      const playing = shuffled.slice(0, playersPerRound);
      const sitting = shuffled.slice(playersPerRound);

      for (let c = 0; c < courts; c++) {
        const base = c * 4;
        if (base + 3 < playing.length) {
          result.push({
            round,
            court: c + 1,
            p1: playing[base],
            p2: playing[base + 1],
            p3: playing[base + 2],
            p4: playing[base + 3],
            type: 'game'
          });
        }
      }

      // Mark byes
      sitting.forEach(p => {
        result.push({ round, court: 'bye', p1: p, p2: '', p3: '', p4: '', type: 'bye' });
      });
    }

    return result;
  }

  // Main optimizer — tries N iterations, returns best
  function optimize({ presentPlayers, courts, rounds, pastPairings, tries = 50 }) {
    if (presentPlayers.length < 4) {
      return { pairings: [], score: 0, error: 'Not enough players' };
    }

    const history = buildHistory(pastPairings);
    const byeCounts = buildByeCounts(presentPlayers, pastPairings);

    let bestPairings = null;
    let bestScore = Infinity;

    for (let i = 0; i < tries; i++) {
      const candidate = generateRandom(presentPlayers, courts, rounds);

      // Compute tentative bye counts for this candidate
      const candidateByeCounts = { ...byeCounts };
      candidate.forEach(g => {
        if (g.type === 'bye') {
          [g.p1, g.p2, g.p3, g.p4].filter(Boolean).forEach(p => {
            if (candidateByeCounts[p] !== undefined) candidateByeCounts[p]++;
          });
        }
      });

      const score = scorePairings(candidate, history, candidateByeCounts);

      if (score < bestScore) {
        bestScore = score;
        bestPairings = candidate;
      }
    }

    return { pairings: bestPairings, score: bestScore };
  }

  return { optimize, buildHistory, buildByeCounts };
})();
