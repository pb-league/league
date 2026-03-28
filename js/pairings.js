// ============================================================
// pairings.js — Constructive pairing optimizer
//
// Algorithm: builds one round at a time, each round aware of
// all prior rounds. For each round:
//   1. Select who sits out (bye) by preferring players with
//      the most session byes so far, with random tiebreaking.
//   2. From the remaining players, find the court assignment
//      that minimizes the incremental penalty for that round
//      given the session history so far.
//
// The full construction is repeated `tries` times with random
// tiebreaking at each step. The best complete week is kept.
//
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
    rankStdDevWeight:        8,   // penalty for std dev of all four player ranks in a game
    mixedViolationWeight:  500,   // penalty per same-gender partnership in mixed doubles
  };

  // ── Helpers ────────────────────────────────────────────────

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Check if two players are a valid partnership under mixed doubles rules.
  // M+F, M+E, F+E, E+E are valid. M+M and F+F are not.
  function validPartner(a, b, playerGroups) {
    if (!playerGroups) return true;
    const ga = playerGroups[a] || 'M';
    const gb = playerGroups[b] || 'M';
    if (ga === 'Either' || gb === 'Either') return true;
    return ga !== gb; // M+F or F+M valid; M+M or F+F invalid
  }

  // Incremental cost of a single game given current session state
  // p2/p4 may be null in singles mode
  function gameScore(p1, p2, p3, p4, sessionPartners, sessionOpponents, history, w) {
    let s = 0;
    const isSingles = !p2 && !p4;

    // Mixed doubles partnership validity (doubles only)
    if (!isSingles && w.mixedDoubles && w.playerGroups) {
      if (!validPartner(p1, p2, w.playerGroups)) s += 1e6;
      if (!validPartner(p3, p4, w.playerGroups)) s += 1e6;
    }

    // Opponent repeat penalties (applies to singles and doubles)
    const oppPairs = isSingles
      ? [[p1, p3]]
      : [[p1,p3],[p1,p4],[p2,p3],[p2,p4]];

    oppPairs.forEach(([a, b]) => {
      if (a && b) {
        const k = [a,b].sort().join('|');
        s += (history.opponents[k] || 0) * w.historyOpponentWeight;
        s += (sessionOpponents[k] || 0) * w.sessionOpponentWeight;
      }
    });

    if (!isSingles) {
      // Partner repeat penalties (doubles only)
      const pk1 = [p1, p2].sort().join('|');
      const pk2 = [p3, p4].sort().join('|');
      s += (history.partners[pk1] || 0) * w.historyPartnerWeight;
      s += (history.partners[pk2] || 0) * w.historyPartnerWeight;
      s += (sessionPartners[pk1] || 0) * w.sessionPartnerWeight;
      s += (sessionPartners[pk2] || 0) * w.sessionPartnerWeight;

      // Rank balance (doubles)
      if (w.rankBalanceWeight > 0 && w.rankMap) {
        const r1 = w.rankMap[p1]||999, r2 = w.rankMap[p2]||999;
        const r3 = w.rankMap[p3]||999, r4 = w.rankMap[p4]||999;
        s += Math.abs((r1+r2)/2 - (r3+r4)/2) * w.rankBalanceWeight;
      }
    } else {
      // Rank balance (singles — compare individual ranks)
      if (w.rankBalanceWeight > 0 && w.rankMap) {
        s += Math.abs((w.rankMap[p1]||999) - (w.rankMap[p3]||999)) * w.rankBalanceWeight;
      }
    }

    // Rank std dev — penalize standard deviation of all players' ranks in a game
    // Captures overall spread more evenly than range alone
    if (w.rankStdDevWeight > 0 && w.rankMap) {
      const ranks = [p1, p2, p3, p4].filter(Boolean).map(p => w.rankMap[p] || 999).filter(r => r < 999);
      if (ranks.length > 1) {
        const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length;
        const variance = ranks.reduce((a, b) => a + (b - mean) ** 2, 0) / ranks.length;
        s += Math.sqrt(variance) * w.rankStdDevWeight;
      }
    }

    return s;
  }

  // ── Constructive round builder ──────────────────────────────
  //
  // For each court in turn, try all C(pool,4) * 3 team-split
  // combinations. A small random noise is added to each score
  // during construction so different combos win on different
  // iterations — this is the primary source of variation across
  // the `tries` runs. The noise is NOT applied when scoring the
  // final candidate, so the best-of-N comparison is always fair.

  function buildRound(round, playing, courts, sessionPartners, sessionOpponents, history, w, noise = 0) {
    const result = [];
    const ppc = w.playersPerCourt || 4;  // players per court: 2 singles, 4 doubles
    let pool = shuffle(playing);

    for (let c = 1; c <= courts; c++) {
      if (pool.length < ppc) break;

      let bestScore = Infinity;
      let bestCombos = []; // collect all tied-best combos for random selection

      if (ppc === 2) {
        // Singles: pick best 2-player matchup (1v1, no partners)
        for (let i = 0; i < pool.length - 1; i++) {
          for (let j = i + 1; j < pool.length; j++) {
            const sc = gameScore(pool[i], null, pool[j], null, sessionPartners, sessionOpponents, history, w)
                     + Math.random() * noise;
            if (sc < bestScore - 1e-9) {
              bestScore = sc;
              bestCombos = [{ p1: pool[i], p2: null, p3: pool[j], p4: null }];
            } else if (sc < bestScore + 1e-9) {
              bestCombos.push({ p1: pool[i], p2: null, p3: pool[j], p4: null });
            }
          }
        }
      } else {
        // Doubles: pick best 4-player group with best team split
        for (let i = 0; i < pool.length - 3; i++) {
          for (let j = i + 1; j < pool.length - 2; j++) {
            for (let k = j + 1; k < pool.length - 1; k++) {
              for (let l = k + 1; l < pool.length; l++) {
                const four = [pool[i], pool[j], pool[k], pool[l]];
                [
                  [four[0], four[1], four[2], four[3]],
                  [four[0], four[2], four[1], four[3]],
                  [four[0], four[3], four[1], four[2]],
                ].forEach(([a, b, c2, d]) => {
                  const sc = gameScore(a, b, c2, d, sessionPartners, sessionOpponents, history, w)
                           + Math.random() * noise;
                  if (sc < bestScore - 1e-9) {
                    bestScore = sc;
                    bestCombos = [{ p1: a, p2: b, p3: c2, p4: d }];
                  } else if (sc < bestScore + 1e-9) {
                    bestCombos.push({ p1: a, p2: b, p3: c2, p4: d });
                  }
                });
              }
            }
          }
        }
      }

      if (!bestCombos.length) break;

      // Randomly select among all tied-best combos — genuine variation across tries
      const bestCombo = bestCombos[Math.floor(Math.random() * bestCombos.length)];

      result.push({ round, court: c, ...bestCombo, type: 'game' });

      // Remove chosen players from pool
      const used = new Set([bestCombo.p1, bestCombo.p2, bestCombo.p3, bestCombo.p4].filter(Boolean));
      pool = pool.filter(p => !used.has(p));

      // Update session state
      if (ppc === 2) {
        // Singles: only opponent tracking (no partners)
        const key = [bestCombo.p1, bestCombo.p3].sort().join('|');
        sessionOpponents[key] = (sessionOpponents[key] || 0) + 1;
      } else {
        const pk1 = [bestCombo.p1, bestCombo.p2].sort().join('|');
        const pk2 = [bestCombo.p3, bestCombo.p4].sort().join('|');
        sessionPartners[pk1] = (sessionPartners[pk1] || 0) + 1;
        sessionPartners[pk2] = (sessionPartners[pk2] || 0) + 1;
        [[bestCombo.p1,bestCombo.p3],[bestCombo.p1,bestCombo.p4],
         [bestCombo.p2,bestCombo.p3],[bestCombo.p2,bestCombo.p4]].forEach(([a, b]) => {
          const key = [a,b].sort().join('|');
          sessionOpponents[key] = (sessionOpponents[key] || 0) + 1;
        });
      }
    }

    // Any players still in pool couldn't fill a court — return them as unassigned
    return { games: result, unassigned: pool };
  }

  // ── Bye selection ───────────────────────────────────────────
  //
  // Prefer players with the most session byes so far, then by
  // season bye count. Random shuffle before sorting so ties
  // break differently on each attempt.

  function chooseByes(players, courts, sessionByes, seasonByeCounts, playersPerCourt) {
    const needed = players.length - courts * (playersPerCourt || 4);
    if (needed <= 0) return { playing: players, sitting: [] };

    // Sort ascending: players with the FEWEST session byes sit out first,
    // so byes are spread evenly across the session. Break ties by season
    // bye count (ascending), then random (via pre-shuffle).
    const ranked = shuffle(players).sort((a, b) => {
      const sdiff = (sessionByes[a] || 0) - (sessionByes[b] || 0);
      if (sdiff !== 0) return sdiff;
      return (seasonByeCounts[a] || 0) - (seasonByeCounts[b] || 0);
    });

    return {
      sitting: ranked.slice(0, needed),
      playing: ranked.slice(needed),
    };
  }

  // ── Full week construction ──────────────────────────────────

  function constructWeek(presentPlayers, courts, rounds, history, byeCounts, weightsWithRank, initPartners = {}, initOpponents = {}, noise = 0) {
    const result          = [];
    const sessionPartners  = Object.assign({}, initPartners);
    const sessionOpponents = Object.assign({}, initOpponents);
    const sessionByes      = {};

    for (let round = 1; round <= rounds; round++) {
      const { playing, sitting } = chooseByes(
        presentPlayers, courts, sessionByes, byeCounts, weightsWithRank.playersPerCourt
      );

      const { games, unassigned } = buildRound(
        round, playing, courts,
        sessionPartners, sessionOpponents, history, weightsWithRank, noise
      );
      result.push(...games);

      // Record byes for this round — both pre-selected sitters and
      // any players left over because courts couldn't be filled
      const allByes = [...sitting, ...unassigned];
      allByes.forEach(p => {
        result.push({ round, court: 'bye', p1: p, p2: '', p3: '', p4: '', type: 'bye' });
        sessionByes[p] = (sessionByes[p] || 0) + 1;
      });
    }

    return result;
  }

  // ── Full scoring (for comparison and breakdown display) ─────

  function scorePairings(weekPairings, historyScores, byeCounts, weights) {
    const w = Object.assign({}, DEFAULTS, weights);
    const raw = {
      sessionPartner: 0, sessionOpponent: 0,
      historyPartner: 0, historyOpponent: 0,
      sessionBye: 0, byeVariance: 0, rankBalance: 0, rankStdDev: 0,
    };
    const sessionPartners  = {};
    const sessionOpponents = {};
    const sessionByes      = {};

    const gamesByRound = {};
    weekPairings.forEach(g => {
      if (!gamesByRound[g.round]) gamesByRound[g.round] = [];
      gamesByRound[g.round].push(g);
    });

    Object.keys(gamesByRound).sort((a, b) => a - b).forEach(round => {
      const games = gamesByRound[round].filter(g => g.type === 'game');
      const byes  = gamesByRound[round].filter(g => g.type === 'bye');

      games.forEach(game => {
        const { p1, p2, p3, p4 } = game;
        const pk1 = [p1,p2].sort().join('|'), pk2 = [p3,p4].sort().join('|');

        // Mixed doubles violation tracking
        if (w.mixedDoubles && w.playerGroups) {
          if (!validPartner(p1, p2, w.playerGroups)) raw.mixedViolations = (raw.mixedViolations||0) + 1;
          if (!validPartner(p3, p4, w.playerGroups)) raw.mixedViolations = (raw.mixedViolations||0) + 1;
        }

        raw.historyPartner  += (historyScores.partners[pk1] || 0) + (historyScores.partners[pk2] || 0);
        [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a,b]) => {
          raw.historyOpponent += historyScores.opponents[[a,b].sort().join('|')] || 0;
        });
        raw.sessionPartner  += (sessionPartners[pk1] || 0) + (sessionPartners[pk2] || 0);
        [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a,b]) => {
          raw.sessionOpponent += sessionOpponents[[a,b].sort().join('|')] || 0;
        });
        if (w.rankBalanceWeight > 0 && w.rankMap) {
          const r1=w.rankMap[p1]||999, r2=p2?w.rankMap[p2]||999:w.rankMap[p1]||999;
          const r3=w.rankMap[p3]||999, r4=p4?w.rankMap[p4]||999:w.rankMap[p3]||999;
          raw.rankBalance += Math.abs((r1+r2)/2-(r3+r4)/2);
        }
        if (w.rankStdDevWeight > 0 && w.rankMap) {
          const ranks = [p1, p2, p3, p4].filter(Boolean).map(p => w.rankMap[p] || 999).filter(r => r < 999);
          if (ranks.length > 1) {
            const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length;
            raw.rankStdDev += Math.sqrt(ranks.reduce((a, b) => a + (b - mean) ** 2, 0) / ranks.length);
          }
        }
      });

      byes.forEach(g => {
        [g.p1,g.p2,g.p3,g.p4].filter(Boolean).forEach(p => {
          raw.sessionBye += (sessionByes[p]||0) + 1;
        });
      });

      games.forEach(game => {
        const { p1,p2,p3,p4 } = game;
        const pk1=[p1,p2].sort().join('|'), pk2=[p3,p4].sort().join('|');
        sessionPartners[pk1]=(sessionPartners[pk1]||0)+1;
        sessionPartners[pk2]=(sessionPartners[pk2]||0)+1;
        [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a,b]) => {
          const k=[a,b].sort().join('|');
          sessionOpponents[k]=(sessionOpponents[k]||0)+1;
        });
      });
      byes.forEach(g => {
        [g.p1,g.p2,g.p3,g.p4].filter(Boolean).forEach(p => {
          sessionByes[p]=(sessionByes[p]||0)+1;
        });
      });
    });

    const byeValues = Object.values(byeCounts);
    if (byeValues.length > 0) {
      const mean = byeValues.reduce((a,b)=>a+b,0)/byeValues.length;
      raw.byeVariance = byeValues.reduce((a,b)=>a+Math.pow(b-mean,2),0)/byeValues.length;
    }

    const breakdown = {
      mixedViolations: { raw: raw.mixedViolations||0, weight: w.mixedViolationWeight, weighted: (raw.mixedViolations||0) * w.mixedViolationWeight },
      sessionPartner:  { raw: raw.sessionPartner,  weight: w.sessionPartnerWeight,  weighted: raw.sessionPartner  * w.sessionPartnerWeight  },
      sessionOpponent: { raw: raw.sessionOpponent, weight: w.sessionOpponentWeight, weighted: raw.sessionOpponent * w.sessionOpponentWeight },
      historyPartner:  { raw: raw.historyPartner,  weight: w.historyPartnerWeight,  weighted: raw.historyPartner  * w.historyPartnerWeight  },
      historyOpponent: { raw: raw.historyOpponent, weight: w.historyOpponentWeight, weighted: raw.historyOpponent * w.historyOpponentWeight },
      sessionBye:      { raw: raw.sessionBye,      weight: w.sessionByeWeight,      weighted: raw.sessionBye      * w.sessionByeWeight      },
      byeVariance:     { raw: raw.byeVariance,      weight: w.byeVarianceWeight,    weighted: raw.byeVariance     * w.byeVarianceWeight     },
      rankBalance:          { raw: raw.rankBalance,          weight: w.rankBalanceWeight,          weighted: raw.rankBalance          * w.rankBalanceWeight          },
      rankStdDev:           { raw: raw.rankStdDev,           weight: w.rankStdDevWeight,           weighted: raw.rankStdDev           * w.rankStdDevWeight           },
    };

    const total = Object.values(breakdown).reduce((s,v)=>s+v.weighted, 0);
    return { total, breakdown };
  }

  // ── History / bye count helpers ─────────────────────────────

  function buildHistory(pastPairings) {
    const partners = {}, opponents = {};
    pastPairings.forEach(game => {
      if (game.type !== 'game') return;
      const { p1, p2, p3, p4 } = game;
      if (p1&&p2) { const k=[p1,p2].sort().join('|'); partners[k]=(partners[k]||0)+1; }
      if (p3&&p4) { const k=[p3,p4].sort().join('|'); partners[k]=(partners[k]||0)+1; }
      [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].forEach(([a,b]) => {
        if (a&&b) { const k=[a,b].sort().join('|'); opponents[k]=(opponents[k]||0)+1; }
      });
    });
    return { partners, opponents };
  }

  function buildByeCounts(players, pastPairings) {
    const counts = {};
    players.forEach(p => { counts[p] = 0; });
    pastPairings.forEach(game => {
      if (game.type === 'bye') {
        [game.p1,game.p2,game.p3,game.p4].filter(Boolean).forEach(p => {
          if (counts[p] !== undefined) counts[p]++;
        });
      }
    });
    return counts;
  }


  // ── Weight normalization ────────────────────────────────────
  //
  // The raw magnitudes of each scoring criterion vary widely.
  // e.g. sessionOpponent raw may be 18 while rankBalance raw is 0.3.
  // Without normalization a weight of 10 on a high-magnitude criterion
  // dominates a weight of 90 on a low-magnitude one.
  //
  // We calibrate by running CALIBRATION_RUNS random full weeks,
  // measuring the average raw value of each criterion, then computing
  // a scale factor = 1 / avgRaw so each criterion's contribution is
  // normalized to "1 unit per occurrence" before the user weight is applied.
  // This makes weights behave as true relative importance values.

  const CALIBRATION_RUNS = 10;

  function calibrateWeights(presentPlayers, courts, rounds, history, byeCounts, weightsWithRank) {
    const CRITERIA = [
      'sessionPartner', 'sessionOpponent',
      'historyPartner', 'historyOpponent',
      'sessionBye', 'byeVariance', 'rankBalance', 'rankStdDev'
    ];

    // Accumulate raw totals across calibration runs
    const totals = {};
    CRITERIA.forEach(k => { totals[k] = 0; });
    let runs = 0;

    for (let i = 0; i < CALIBRATION_RUNS; i++) {
      const candidate = constructWeek(
        presentPlayers, courts, rounds, history, byeCounts, weightsWithRank
      );
      const candidateByeCounts = { ...byeCounts };
      candidate.forEach(g => {
        if (g.type === 'bye') {
          [g.p1,g.p2,g.p3,g.p4].filter(Boolean).forEach(p => {
            if (candidateByeCounts[p] !== undefined) candidateByeCounts[p]++;
          });
        }
      });
      // Score with weight=1 for everything to get pure raw values
      const unitWeights = Object.assign({}, weightsWithRank);
      CRITERIA.forEach(k => {
        const wKey = k + 'Weight';
        unitWeights[wKey] = 1;
      });
      const { breakdown } = scorePairings(candidate, history, candidateByeCounts, unitWeights);
      CRITERIA.forEach(k => {
        if (breakdown[k]) totals[k] += breakdown[k].raw;
      });
      runs++;
    }

    // Compute scale factors: 1 / avgRaw (floor at a small value to avoid div/0)
    const scaleFactors = {};
    CRITERIA.forEach(k => {
      const avg = totals[k] / runs;
      scaleFactors[k] = avg > 0.001 ? 1 / avg : 1;
    });

    // Build normalized weights: normalizedWeight = userWeight * scaleFactor
    const normalized = Object.assign({}, weightsWithRank);
    const criteriaWeightKeys = {
      sessionPartner:  'sessionPartnerWeight',
      sessionOpponent: 'sessionOpponentWeight',
      historyPartner:  'historyPartnerWeight',
      historyOpponent: 'historyOpponentWeight',
      sessionBye:      'sessionByeWeight',
      byeVariance:     'byeVarianceWeight',
      rankBalance:     'rankBalanceWeight',
      rankStdDev:      'rankStdDevWeight',
    };
    CRITERIA.forEach(k => {
      const wKey = criteriaWeightKeys[k];
      normalized[wKey] = weightsWithRank[wKey] * scaleFactors[k];
    });

    return { normalized, scaleFactors };
  }

  // ── Local improvement — hill climbing ──────────────────────
  //
  // After constructWeek builds a candidate, run swap passes to
  // climb to a local optimum. Two swap types:
  //
  //   1. Within-round player swaps: try swapping one player between
  //      two different games in the same round. For doubles this means
  //      one player moves courts; for singles same idea. Tests all
  //      (game_a, game_b, slot_in_a, slot_in_b) combos per round.
  //
  //   2. Cross-round partner swaps: for each pair of rounds, try
  //      swapping the partner of a given player between the two rounds.
  //      Targets the sessionPartner repeat penalty directly.
  //
  // Repeats until no improvement is found or maxPasses is reached.
  // Rescores the full week after each accepted swap (cheap — pure arithmetic).

  function localImprove(pairings, history, byeCounts, weights, maxPasses = 5) {
    const singles = weights.singles;

    // Work on a mutable copy — games only, byes unchanged
    let current = pairings.map(g => ({ ...g }));

    // Helper: rescore full week, return total
    function score(p) {
      const bc = { ...byeCounts };
      p.forEach(g => {
        if (g.type === 'bye') {
          [g.p1, g.p2, g.p3, g.p4].filter(Boolean).forEach(n => { if (bc[n] !== undefined) bc[n]++; });
        }
      });
      return scorePairings(p, history, bc, weights).total;
    }

    // Helper: get all game entries grouped by round
    function gamesByRound(p) {
      const map = {};
      p.forEach(g => {
        if (g.type !== 'game') return;
        if (!map[g.round]) map[g.round] = [];
        map[g.round].push(g);
      });
      return map;
    }

    // Helper: replace two games in the pairings array with updated versions
    function applySwap(p, oldA, newA, oldB, newB) {
      return p.map(g => {
        if (g === oldA) return newA;
        if (g === oldB) return newB;
        return g;
      });
    }

    // Helper: verify no player appears more than once across all games in a round
    function roundIsValid(roundGames) {
      const seen = new Set();
      for (const g of roundGames) {
        for (const p of [g.p1, g.p2, g.p3, g.p4].filter(Boolean)) {
          if (seen.has(p)) return false;
          seen.add(p);
        }
      }
      return true;
    }

    let currentScore = score(current);
    let improved = true;
    let pass = 0;

    while (improved && pass < maxPasses) {
      improved = false;
      pass++;

      // ── 1. Within-round player swaps ─────────────────────
      // For each round, try swapping one player slot between two games.
      // In doubles: slots are p1, p2, p3, p4.
      // In singles: slots are p1, p3 (p2/p4 are null).
      const slots = singles ? ['p1', 'p3'] : ['p1', 'p2', 'p3', 'p4'];
      const rounds = gamesByRound(current);

      for (const roundGames of Object.values(rounds)) {
        if (roundGames.length < 2) continue;

        for (let gi = 0; gi < roundGames.length - 1; gi++) {
          for (let gj = gi + 1; gj < roundGames.length; gj++) {
            const ga = roundGames[gi];
            const gb = roundGames[gj];

            for (const sa of slots) {
              for (const sb of slots) {
                // Don't swap null slots (singles p2/p4)
                if (!ga[sa] || !gb[sb]) continue;
                // Don't swap a player with themselves
                if (ga[sa] === gb[sb]) continue;

                const newA = { ...ga, [sa]: gb[sb] };
                const newB = { ...gb, [sb]: ga[sa] };

                // Reject if either game would have duplicate players
                const playersA = [newA.p1,newA.p2,newA.p3,newA.p4].filter(Boolean);
                const playersB = [newB.p1,newB.p2,newB.p3,newB.p4].filter(Boolean);
                if (new Set(playersA).size < playersA.length) continue;
                if (new Set(playersB).size < playersB.length) continue;

                // Verify the full round has no duplicate players after swap
                const testRound = roundGames.map((g, idx) =>
                  idx === gi ? newA : idx === gj ? newB : g
                );
                if (!roundIsValid(testRound)) continue;

                const candidate = applySwap(current, ga, newA, gb, newB);
                const s = score(candidate);
                if (s < currentScore - 1e-9) {
                  current = candidate;
                  currentScore = s;
                  // Update roundGames references for remainder of this round's loops
                  roundGames[gi] = newA;
                  roundGames[gj] = newB;
                  improved = true;
                }
              }
            }
          }
        }
      }

      // ── 2. Cross-round partner swaps (doubles only) ───────
      // For each pair of rounds, for each player who appears in both,
      // try swapping their partner between the two rounds.
      // i.e. if Alice+Bob vs ... in r1 and Alice+Carol vs ... in r2,
      // try Alice+Carol vs ... in r1 and Alice+Bob vs ... in r2.
      if (!singles) {
        const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);

        for (let ri = 0; ri < roundKeys.length - 1; ri++) {
          for (let rj = ri + 1; rj < roundKeys.length; rj++) {
            const gamesA = gamesByRound(current)[roundKeys[ri]] || [];
            const gamesB = gamesByRound(current)[roundKeys[rj]] || [];

            for (const ga of gamesA) {
              for (const gb of gamesB) {
                // Find a player who appears in both games
                const playersA = [ga.p1, ga.p2, ga.p3, ga.p4].filter(Boolean);
                const playersB = [gb.p1, gb.p2, gb.p3, gb.p4].filter(Boolean);
                const shared = playersA.filter(p => playersB.includes(p));

                for (const pivot of shared) {
                  // Partner of pivot in each game
                  const partnerA = ga.p1 === pivot ? ga.p2
                                 : ga.p2 === pivot ? ga.p1
                                 : ga.p3 === pivot ? ga.p4
                                 : ga.p4 === pivot ? ga.p3 : null;
                  const partnerB = gb.p1 === pivot ? gb.p2
                                 : gb.p2 === pivot ? gb.p1
                                 : gb.p3 === pivot ? gb.p4
                                 : gb.p4 === pivot ? gb.p3 : null;

                  if (!partnerA || !partnerB || partnerA === partnerB) continue;

                  // Swap: pivot gets partnerB in round ri and partnerA in round rj
                  // Build new game objects with partners swapped
                  const newA = { ...ga };
                  const newB = { ...gb };

                  // Substitute partnerA→partnerB in ga
                  if (newA.p1 === partnerA) newA.p1 = partnerB;
                  else if (newA.p2 === partnerA) newA.p2 = partnerB;
                  else if (newA.p3 === partnerA) newA.p3 = partnerB;
                  else if (newA.p4 === partnerA) newA.p4 = partnerB;

                  // Substitute partnerB→partnerA in gb
                  if (newB.p1 === partnerB) newB.p1 = partnerA;
                  else if (newB.p2 === partnerB) newB.p2 = partnerA;
                  else if (newB.p3 === partnerB) newB.p3 = partnerA;
                  else if (newB.p4 === partnerB) newB.p4 = partnerA;

                  // Reject if either game has internal duplicates
                  const newPlayersA = [newA.p1,newA.p2,newA.p3,newA.p4].filter(Boolean);
                  const newPlayersB = [newB.p1,newB.p2,newB.p3,newB.p4].filter(Boolean);
                  if (new Set(newPlayersA).size < newPlayersA.length) continue;
                  if (new Set(newPlayersB).size < newPlayersB.length) continue;

                  // Reject if the swapped player now appears twice in either round
                  const roundAGames = (gamesByRound(current)[roundKeys[ri]] || []).map(g => g === ga ? newA : g);
                  const roundBGames = (gamesByRound(current)[roundKeys[rj]] || []).map(g => g === gb ? newB : g);
                  if (!roundIsValid(roundAGames) || !roundIsValid(roundBGames)) continue;

                  const candidate = applySwap(current, ga, newA, gb, newB);
                  const s = score(candidate);
                  if (s < currentScore - 1e-9) {
                    current = candidate;
                    currentScore = s;
                    improved = true;
                    // Break out to re-fetch fresh round maps on next pass
                    break;
                  }
                }
                if (improved) break;
              }
              if (improved) break;
            }
            if (improved) break;
          }
          if (improved) break;
        }
      }
    }

    return current;
  }

  // ── Main optimizer ──────────────────────────────────────────
  //
  // Runs the constructive algorithm `tries` times — each attempt
  // uses different random tiebreaking so a better solution may
  // be found. Returns the lowest-scoring complete week.
  // Weights are normalized via calibration so user weights reflect
  // true relative importance regardless of criterion magnitude.

  function optimize({ presentPlayers, courts, rounds, pastPairings, tries = 100, weights = {}, standings = [], gameMode = 'doubles', playerGroups = {}, startRound = 1, sessionHistory = [], players = [], useLocalImprove = true, swapPasses = 5, onProgress = null }) {
    const singles      = gameMode === 'singles';
    const mixedDoubles = gameMode === 'mixed-doubles';
    const playersPerCourt = singles ? 2 : 4;
    if (presentPlayers.length < playersPerCourt) {
      return { pairings: [], score: 0, error: 'Not enough players' };
    }

    const history   = buildHistory(pastPairings);
    const byeCounts = buildByeCounts(presentPlayers, pastPairings);

    const rankMap = {};
    standings.forEach(s => { if (s.name && s.rank) rankMap[s.name] = s.rank; });

    // Build an effective rank for players not yet in standings.
    // Use initialRank if set, converting it to a position relative to standings.
    // Duplicate initialRanks: sort those players alphabetically as tiebreak.
    const unranked = presentPlayers.filter(n => !rankMap[n]);
    if (unranked.length) {
      // Collect initialRank for each unranked player
      const withInit = unranked.map(name => {
        const pl = players.find(pl => pl.name === name);
        return { name, initialRank: (pl && pl.initialRank) ? pl.initialRank : null };
      });
      // Sort: those with initialRank first (ascending), then null (alphabetical tiebreak)
      withInit.sort((a, b) => {
        if (a.initialRank !== null && b.initialRank !== null) {
          return a.initialRank !== b.initialRank
            ? a.initialRank - b.initialRank
            : a.name.localeCompare(b.name);
        }
        if (a.initialRank !== null) return -1;
        if (b.initialRank !== null) return  1;
        return a.name.localeCompare(b.name);
      });
      // Assign sequential ranks starting after the last standing rank
      const baseRank = standings.length > 0 ? standings.length : 0;
      withInit.forEach((p, i) => { rankMap[p.name] = baseRank + i + 1; });
    }
    const weightsWithRank = Object.assign({}, DEFAULTS, weights, { rankMap, mixedDoubles, playerGroups, singles, playersPerCourt });

    // Calibrate weights so user values reflect true relative importance
    const { normalized: normalizedWeights, scaleFactors } = calibrateWeights(
      presentPlayers, courts, rounds, history, byeCounts, weightsWithRank
    );

    let bestPairings  = null;
    let bestBreakdown = null;
    let bestScore     = Infinity;

    // Pre-warm session state from already-locked rounds (e.g. when generating remaining/specific rounds)
    const priorSessionPartners  = {};
    const priorSessionOpponents = {};
    sessionHistory.forEach(g => {
      if (g.type !== 'game') return;
      const { p1, p2, p3, p4 } = g;
      if (p2) {
        const pk1 = [p1,p2].sort().join('|');
        const pk2 = [p3,p4].sort().join('|');
        priorSessionPartners[pk1] = (priorSessionPartners[pk1]||0) + 1;
        priorSessionPartners[pk2] = (priorSessionPartners[pk2]||0) + 1;
      }
      [[p1,p3],[p1,p4],[p2,p3],[p2,p4]].filter(([a,b])=>a&&b).forEach(([a,b]) => {
        const k = [a,b].sort().join('|');
        priorSessionOpponents[k] = (priorSessionOpponents[k]||0) + 1;
      });
    });

    // Compute noise level as a fraction of the average noiseless score.
    // Noise is added to game scores during construction only (not final scoring)
    // so different iterations explore genuinely different solutions while the
    // best-of-N comparison remains fair.
    let baselineScore = 0;
    const BASELINE_RUNS = 3;
    for (let i = 0; i < BASELINE_RUNS; i++) {
      const c = constructWeek(presentPlayers, courts, rounds, history, byeCounts, normalizedWeights,
        priorSessionPartners, priorSessionOpponents, 0);
      const bc = { ...byeCounts };
      c.forEach(g => { if (g.type === 'bye') [g.p1,g.p2,g.p3,g.p4].filter(Boolean).forEach(p => { if (bc[p] !== undefined) bc[p]++; }); });
      baselineScore += scorePairings(c, history, bc, normalizedWeights).total;
    }
    baselineScore /= BASELINE_RUNS;
    // Noise = 25% of per-game average score — enough to diversify greedy choices
    // without making the search completely random
    const totalGames = rounds * courts;
    const noise = totalGames > 0 ? (baselineScore / totalGames) * 0.25 : 0;

    for (let i = 0; i < tries; i++) {
      if (onProgress) onProgress({ phase: 'construct', iteration: i + 1, tries });

      // Construct using normalized weights so greedy choices reflect true priorities
      let candidate = constructWeek(
        presentPlayers, courts, rounds, history, byeCounts, normalizedWeights,
        priorSessionPartners, priorSessionOpponents, noise
      );

      // Polish with local swap search — hill-climb to nearest local optimum
      // Only when explicitly enabled (can cause duplicate player assignments in same round)
      if (useLocalImprove) {
        if (onProgress) onProgress({ phase: 'swap', iteration: i + 1, tries });
        candidate = localImprove(candidate, history, byeCounts, normalizedWeights, swapPasses);
      }

      const candidateByeCounts = { ...byeCounts };
      candidate.forEach(g => {
        if (g.type === 'bye') {
          [g.p1,g.p2,g.p3,g.p4].filter(Boolean).forEach(p => {
            if (candidateByeCounts[p] !== undefined) candidateByeCounts[p]++;
          });
        }
      });

      // Score with normalized weights for consistent comparison across iterations
      const { total, breakdown } = scorePairings(
        candidate, history, candidateByeCounts, normalizedWeights
      );

      if (total < bestScore) {
        bestScore     = total;
        bestPairings  = candidate;
        // Score with normalized weights so breakdown shows post-normalization contribution
        const { breakdown: normBreakdown } = scorePairings(
          candidate, history, candidateByeCounts, normalizedWeights
        );
        bestBreakdown = normBreakdown;
      }
    }

    return { pairings: bestPairings, score: bestScore, breakdown: bestBreakdown, normalizedWeights };
  }

  return { optimize, buildHistory, buildByeCounts, DEFAULTS };
})();
