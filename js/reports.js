// ============================================================
// reports.js — Standings, player reports, stats calculations
// ============================================================

const Reports = (() => {

  function computeStandings(scores, players, pairings, upToWeek = null, rankingMethod = 'avgptdiff', attendance = [], pairingMode = 'standard') {
    const stats = {};

    // Tournament weeks are excluded from attendance calculations — eliminated players
    // sitting out later rounds should not be penalised for non-participation.
    const tournWeeks = new Set(
      pairings
        .filter(p => p.type === 'tourn-game')
        .map(p => parseInt(p.week))
    );

    players.forEach(p => {
      if (p.role === 'sub') return;       // SUBs play but don't appear in standings
      if (p.role === 'spectator') return; // Spectators never appear in standings
      if (p.active === 'pend') return; // Pending players don't appear in standings
      stats[p.name] = {
        name: p.name,
        wins: 0, losses: 0,
        points: 0, pointsAgainst: 0,
        games: 0, byes: 0, eligibleRounds: 0,
        leagueGames: 0, leagueByes: 0,
        winPct: 0, ptDiff: 0, rank: 0, participationPct: null
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

      const isTournWeek = tournWeeks.has(parseInt(s.week));
      team1.forEach(p => {
        if (!stats[p]) return; // not a registered league player — skip
        stats[p].wins += t1win ? 1 : 0;
        stats[p].losses += t1win ? 0 : 1;
        stats[p].points += score1;
        stats[p].pointsAgainst += score2;
        stats[p].games++;
        if (!isTournWeek) stats[p].leagueGames++;
      });

      team2.forEach(p => {
        if (!stats[p]) return; // not a registered league player — skip
        stats[p].wins += t1win ? 0 : 1;
        stats[p].losses += t1win ? 1 : 0;
        stats[p].points += score2;
        stats[p].pointsAgainst += score1;
        stats[p].games++;
        if (!isTournWeek) stats[p].leagueGames++;
      });
    });

    // Count byes — deduplicate by (player, week, round) since pairings stores
    // one bye entry per player, so a doubles bye creates two entries per round.
    const byeSeen = new Set();
    pairings.forEach(p => {
      if (p.type !== 'bye') return;
      if (upToWeek !== null && parseInt(p.week) > upToWeek) return;
      const isTournWeek = tournWeeks.has(parseInt(p.week));
      [p.p1, p.p2, p.p3, p.p4].filter(Boolean).forEach(name => {
        const key = `${name}|${p.week}|${p.round}`;
        if (stats[name] && !byeSeen.has(key)) {
          byeSeen.add(key);
          stats[name].byes++;
          if (!isTournWeek) stats[name].leagueByes++;
        }
      });
    });

    // Participation % calculation — method depends on pairing mode.
    //
    // Queue mode: players may sit in the queue for some batches, so we measure
    // participation at the session (week) level — 1 unit if the player played
    // any game that week, regardless of how many batches ran.
    //
    // Standard / tournament mode: round-level — played or had a bye counts as
    // participation. Tournament sessions are excluded entirely so eliminated
    // players are not penalised for sitting out later rounds.

    if (pairingMode === 'queue-based') {
      // Denominator: distinct weeks that had at least one scored game
      const activeWeeks = new Set();
      scores.forEach(s => {
        if (upToWeek !== null && parseInt(s.week) > upToWeek) return;
        if (s.score1 === '' || s.score1 === null || s.score2 === '' || s.score2 === null) return;
        activeWeeks.add(parseInt(s.week));
      });

      // Numerator per player: distinct weeks in which they played ≥ 1 scored game
      const playerWeeks = {};
      scores.forEach(s => {
        if (upToWeek !== null && parseInt(s.week) > upToWeek) return;
        if (s.score1 === '' || s.score1 === null || s.score2 === '' || s.score2 === null) return;
        if (isNaN(parseInt(s.score1)) || isNaN(parseInt(s.score2))) return;
        const wk = parseInt(s.week);
        [s.p1, s.p2, s.p3, s.p4].filter(Boolean).forEach(name => {
          if (!stats[name]) return;
          if (!playerWeeks[name]) playerWeeks[name] = new Set();
          playerWeeks[name].add(wk);
        });
      });

      const totalLeagueWeeks = activeWeeks.size;
      Object.keys(stats).forEach(name => {
        stats[name].eligibleRounds = totalLeagueWeeks;
        stats[name].leagueGames    = playerWeeks[name] ? playerWeeks[name].size : 0;
        stats[name].leagueByes     = 0; // byes are not a concept in queue mode
      });

    } else {
      // Standard mode: round-level participation.
      // Denominator = distinct (week, round) combos with at least one entered score,
      // excluding tournament sessions (eliminated players sit out later rounds).
      // Byes count as full participation.
      const scoredRounds = new Set();
      scores.forEach(s => {
        if (upToWeek !== null && parseInt(s.week) > upToWeek) return;
        if (s.score1 === '' || s.score1 === null || s.score2 === '' || s.score2 === null) return;
        if (tournWeeks.has(parseInt(s.week))) return;
        scoredRounds.add(`${s.week}|${s.round}`);
      });
      const totalLeagueRounds = scoredRounds.size;

      // Each player's eligible rounds = total scored rounds PLUS any bye rounds they
      // had that aren't already in scoredRounds (rare edge: bye in an unscored round).
      Object.keys(stats).forEach(name => {
        stats[name].eligibleRounds = totalLeagueRounds;
      });
      byeSeen.forEach(key => {
        const [name, week, round] = key.split('|');
        if (tournWeeks.has(parseInt(week))) return;
        if (stats[name] && !scoredRounds.has(`${week}|${round}`)) {
          stats[name].eligibleRounds++;
        }
      });
    }

    const list = Object.values(stats).map(s => {
      const total = s.wins + s.losses;
      const participated = s.leagueGames + s.leagueByes;
      return {
        ...s,
        winPct: total > 0 ? s.wins / total : 0,
        ptDiff:    s.points - s.pointsAgainst,
        avgPtDiff: s.games > 0 ? (s.points - s.pointsAgainst) / s.games : 0,
        ptsPct:    (s.points + s.pointsAgainst) > 0 ? s.points / (s.points + s.pointsAgainst) : 0,
        participationPct: s.eligibleRounds > 0 ? participated / s.eligibleRounds : null,
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

    // Build rank lookup for upset / rank-diff calculations
    const rankMap = {};
    standings.forEach(s => { if (s.rank != null) rankMap[s.name] = s.rank; });

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
        // Rank differential: avg rank of player+partner minus avg rank of opponents.
        // Negative = player's side was ranked higher (lower number = better rank).
        const myNames   = [playerName, partner].filter(Boolean);
        const myRanks   = myNames.map(n => rankMap[n]).filter(r => r != null);
        const oppRanks  = opponents.map(n => rankMap[n]).filter(r => r != null);
        const myAvg     = myRanks.length  ? myRanks.reduce((a, b)  => a + b, 0) / myRanks.length  : null;
        const oppAvg    = oppRanks.length ? oppRanks.reduce((a, b) => a + b, 0) / oppRanks.length : null;
        const rankDiff  = (myAvg !== null && oppAvg !== null) ? myAvg - oppAvg : null;
        // Upset: the team with the worse (higher-number) rank won
        const isUpset   = rankDiff !== null && rankDiff !== 0
          ? (rankDiff > 0 ? won : !won)   // diff>0 → opponents ranked higher; if player still won → upset
          : false;

        games.push({
          week: parseInt(s.week),
          round: parseInt(s.round),
          court: s.court,
          partner, opponents, myScore, oppScore, won,
          rankDiff, isUpset
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

  // ── Final round scenario analysis ──────────────────────────
  // Called when on the last round of the last session.
  // Returns an array of { name, currentRank, bestRank, scenarios }
  // where scenarios describes what outcomes allow top-3 finishes.
  function computeFinishScenarios(scores, players, pairings, finalWeek, finalRound, rankingMethod = 'avgptdiff', attendance = []) {
    // All scores except the final round (those are the "fixed" results)
    const priorScores = scores.filter(s =>
      !(parseInt(s.week) === finalWeek && parseInt(s.round) === finalRound)
    );

    // Already-entered scores in the final round
    const finalScores = scores.filter(s =>
      parseInt(s.week) === finalWeek && parseInt(s.round) === finalRound &&
      s.score1 !== '' && s.score1 !== null && s.score2 !== '' && s.score2 !== null
    );

    // Unscored games in the final round
    const finalPairings = pairings.filter(p =>
      parseInt(p.week) === finalWeek && parseInt(p.round) === finalRound &&
      (p.type === 'game' || p.type === 'tourn-game')
    ).filter(p => !finalScores.find(s => String(s.court) === String(p.court)));

    if (!finalPairings.length) {
      // All final round scores entered — just show final standings
      return null;
    }

    // Base stats with all prior scores + already-entered final scores
    const baseScores = [...priorScores, ...finalScores];
    const baseStandings = computeStandings(baseScores, players, pairings, null, rankingMethod, attendance);
    const baseMap = {};
    baseStandings.forEach(s => { baseMap[s.name] = s; });

    // Enumerate all 2^n win/loss outcomes for unscored games
    const n = finalPairings.length;
    const numCombos = 1 << n; // 2^n

    // Track best rank achievable per player across all scenarios
    const bestRank = {};
    // Track which scenarios lead to each player's best rank
    const winningScenarios = {}; // name -> array of combo indices that give best rank

    baseStandings.forEach(s => {
      bestRank[s.name] = s.rank;
      winningScenarios[s.name] = [];
    });

    for (let combo = 0; combo < numCombos; combo++) {
      // Build synthetic scores for this combo
      const syntheticScores = finalPairings.map((p, i) => {
        const t1wins = !!(combo & (1 << i));
        return {
          week: finalWeek, round: finalRound, court: p.court,
          p1: p.p1, p2: p.p2, p3: p.p3, p4: p.p4,
          score1: t1wins ? 11 : 0,
          score2: t1wins ? 0 : 11,
        };
      });

      const comboScores = [...baseScores, ...syntheticScores];
      const comboStandings = computeStandings(comboScores, players, pairings, null, rankingMethod, attendance);

      comboStandings.forEach(s => {
        if (s.rank < bestRank[s.name]) {
          bestRank[s.name] = s.rank;
          winningScenarios[s.name] = [combo];
        } else if (s.rank === bestRank[s.name]) {
          winningScenarios[s.name].push(combo);
        }
      });
    }

    // Build human-readable scenario descriptions for players who can finish top 3
    const results = [];
    baseStandings.forEach(s => {
      if (bestRank[s.name] > 3) return; // can't reach top 3

      const scenarios = [];
      const seenDescriptions = new Set();

      winningScenarios[s.name].forEach(combo => {
        if (bestRank[s.name] > 3) return;
        // Only include combos that achieve the best rank
        const syntheticScores = finalPairings.map((p, i) => {
          const t1wins = !!(combo & (1 << i));
          return {
            week: finalWeek, round: finalRound, court: p.court,
            p1: p.p1, p2: p.p2, p3: p.p3, p4: p.p4,
            score1: t1wins ? 11 : 0,
            score2: t1wins ? 0 : 11,
          };
        });
        const comboScores = [...baseScores, ...syntheticScores];
        const comboStandings = computeStandings(comboScores, players, pairings, null, rankingMethod, attendance);
        const achieved = comboStandings.find(x => x.name === s.name);
        if (!achieved || achieved.rank !== bestRank[s.name]) return;

        // Describe each game outcome for this combo
        const parts = finalPairings.map((p, i) => {
          const t1wins = !!(combo & (1 << i));
          const team1 = [p.p1, p.p2].filter(Boolean).join(' & ');
          const team2 = [p.p3, p.p4].filter(Boolean).join(' & ');
          return t1wins ? `${team1} beat ${team2}` : `${team2} beat ${team1}`;
        });

        // Check if tiebreaker (avgPtDiff) matters for this outcome
        const tieDesc = checkTiebreakerNeeded(s.name, combo, finalPairings, baseScores, pairings, players, rankingMethod, attendance, bestRank[s.name]);

        const desc = parts.join(', ') + (tieDesc ? ` (${tieDesc})` : '');
        if (!seenDescriptions.has(desc)) {
          seenDescriptions.add(desc);
          scenarios.push(desc);
        }
      });

      // Simplify: if ALL scenarios give this rank, just say "guaranteed" or describe remaining games
      const guaranteed = winningScenarios[s.name].length === numCombos;

      results.push({
        name: s.name,
        currentRank: s.rank,
        bestRank: bestRank[s.name],
        guaranteed,
        scenarios: guaranteed ? [] : scenarios,
      });
    });

    results.sort((a, b) => a.bestRank - b.bestRank || a.currentRank - b.currentRank);
    return { results, games: finalPairings, enteredCount: finalScores.length };
  }

  function checkTiebreakerNeeded(playerName, combo, finalPairings, baseScores, pairings, players, rankingMethod, attendance, targetRank) {
    // Check if the win/loss outcome alone secures the rank, or if avgPtDiff matters
    // Run with a worse margin (0-11 for wins) and see if rank changes
    const syntheticWorse = finalPairings.map((p, i) => {
      const t1wins = !!(combo & (1 << i));
      return {
        week: parseInt(pairings[0]?.week || 1), round: parseInt(pairings[0]?.round || 1),
        court: p.court, p1: p.p1, p2: p.p2, p3: p.p3, p4: p.p4,
        score1: t1wins ? 1 : 0,
        score2: t1wins ? 0 : 11,
      };
    });
    const worseScores = [...baseScores, ...syntheticWorse];
    const worseStandings = computeStandings(worseScores, players, pairings, null, rankingMethod, attendance);
    const worsePlayer = worseStandings.find(s => s.name === playerName);
    if (worsePlayer && worsePlayer.rank !== targetRank) {
      return 'margin matters for tiebreaker';
    }
    return null;
  }

  // ── Ladder League Standings ────────────────────────────────
  // Points-based standings calculated from a configurable point schedule.
  // rankMap: {playerName: rankNumber} — built from computeStandings or initialRank by caller.
  // advantage = oppTeamAvgRank - myTeamAvgRank (positive = I'm stronger/better ranked).
  // Upset win: advantage < 0 (I was the underdog).
  // Range wins: advantage falls within a configured [min, max] band.
  function computeLadderStandings(scores, players, pairings, upToWeek, attendance, config, rankMap) {
    const cfg          = config || {};
    const attendPts    = parseFloat(cfg.ladderAttendPts)    || 0;
    const playPts      = parseFloat(cfg.ladderPlayPts)      || 0;
    const ranges = [1, 2, 3, 4, 5, 6].map(i => ({
      min: parseFloat(cfg[`ladderRange${i}Min`]) || 0,
      max: parseFloat(cfg[`ladderRange${i}Max`]) || 0,
      pts: parseFloat(cfg[`ladderRange${i}Pts`]) || 0,
    }));

    // Merge passed-in rankMap with initialRank fallback
    const rm = Object.assign({}, rankMap || {});
    players.forEach(p => { if (rm[p.name] == null && p.initialRank) rm[p.name] = p.initialRank; });

    // Initialise per-player accumulators (exclude subs and pending)
    const stats = {};
    players.forEach(p => {
      if (p.role === 'sub' || p.active === 'pend') return;
      stats[p.name] = {
        name: p.name,
        sessionsAttended: 0, gamesPlayed: 0,
        rangeWins: [0, 0, 0, 0, 0, 0],
      };
    });

    // Attendance: distinct weeks with ≥1 scored game
    const playerSessions = {};
    scores.forEach(s => {
      if (upToWeek !== null && upToWeek !== undefined && parseInt(s.week) > upToWeek) return;
      if (!s.p1 || !s.p3) return;
      if (s.score1 === '' || s.score1 == null || s.score2 === '' || s.score2 == null) return;
      const wk = parseInt(s.week);
      [s.p1, s.p2, s.p3, s.p4].filter(Boolean).forEach(name => {
        if (!stats[name]) return;
        if (!playerSessions[name]) playerSessions[name] = new Set();
        playerSessions[name].add(wk);
      });
    });
    Object.keys(stats).forEach(n => {
      stats[n].sessionsAttended = playerSessions[n] ? playerSessions[n].size : 0;
    });

    // Process scored games
    scores.forEach(s => {
      if (upToWeek !== null && upToWeek !== undefined && parseInt(s.week) > upToWeek) return;
      if (!s.p1 || !s.p3) return;
      if (s.score1 === '' || s.score1 == null || s.score2 === '' || s.score2 == null) return;
      const score1 = parseInt(s.score1);
      const score2 = parseInt(s.score2);
      if (isNaN(score1) || isNaN(score2)) return;

      const team1 = [s.p1, s.p2].filter(Boolean);
      const team2 = [s.p3, s.p4].filter(Boolean);
      const t1win = score1 > score2;

      const avgRank = team => {
        const rs = team.map(n => rm[n]).filter(r => r != null);
        return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
      };
      const r1 = avgRank(team1), r2 = avgRank(team2);

      [[team1, t1win, r1, r2], [team2, !t1win, r2, r1]].forEach(([team, won, myAvg, oppAvg]) => {
        team.forEach(name => { if (stats[name]) stats[name].gamesPlayed++; });

        if (!won) return;
        if (myAvg == null || oppAvg == null) return; // no rank data — skip category

        const advantage = oppAvg - myAvg; // positive = I'm better ranked (stronger); negative = upset win
        team.forEach(name => {
          if (!stats[name]) return;
          // Unified range matching — ranges can have negative min/max (negative = upset win)
          for (let i = 0; i < 4; i++) {
            if (ranges[i].max > ranges[i].min && advantage >= ranges[i].min && advantage <= ranges[i].max) {
              stats[name].rangeWins[i]++;
              break;
            }
          }
        });
      });
    });

    // Session ranking bonus — award extra pts to top 1/2/3 finishers in each session's win% standings
    const rank1Pts = parseFloat(cfg.ladderRank1Pts) || 0;
    const rank2Pts = parseFloat(cfg.ladderRank2Pts) || 0;
    const rank3Pts = parseFloat(cfg.ladderRank3Pts) || 0;
    Object.keys(stats).forEach(n => { stats[n].sessionRankPts = 0; });
    if (rank1Pts || rank2Pts || rank3Pts) {
      const rankBonusArr = [rank1Pts, rank2Pts, rank3Pts];
      const distinctWeeks = new Set();
      scores.forEach(s => {
        if (upToWeek !== null && upToWeek !== undefined && parseInt(s.week) > upToWeek) return;
        if (s.score1 !== '' && s.score1 != null && s.score2 !== '' && s.score2 != null) {
          distinctWeeks.add(parseInt(s.week));
        }
      });
      distinctWeeks.forEach(wk => {
        const wkScores   = scores.filter(s => parseInt(s.week) === wk);
        const wkPairings = pairings.filter(p => parseInt(p.week) === wk);
        const wkStands   = computeStandings(wkScores, players, wkPairings, null,
          cfg.rankingMethod || 'avgptdiff', [], cfg.pairingMode || 'round-based');
        wkStands.forEach(s => {
          if (!s.games || !stats[s.name]) return;
          const bonus = rankBonusArr[s.rank - 1];
          if (bonus) stats[s.name].sessionRankPts += bonus;
        });
      });
    }

    // Compute points and build result list
    const list = Object.values(stats).map(s => {
      const rAttend   = s.sessionsAttended * attendPts;
      const rPlay     = s.gamesPlayed      * playPts;
      const rRange    = s.rangeWins.map((w, i) => w * ranges[i].pts);
      const totalPts  = rAttend + rPlay + rRange.reduce((a, b) => a + b, 0) + (s.sessionRankPts || 0);
      return { ...s, attendPts: rAttend, playPts: rPlay, rangePts: rRange, totalPts };
    });

    list.sort((a, b) => b.totalPts - a.totalPts || b.gamesPlayed - a.gamesPlayed);
    list.forEach((s, i) => { s.rank = i + 1; });
    return list;
  }

  function computeWeeklyLadderStandings(scores, players, pairings, week, attendance, config, rankMap) {
    const weekScores   = scores.filter(s => parseInt(s.week) === parseInt(week));
    const weekPairings = pairings.filter(p => parseInt(p.week) === parseInt(week));
    return computeLadderStandings(weekScores, players, weekPairings, null, attendance, config, rankMap);
  }

  return { computeStandings, computePlayerReport, computeWeeklyStandings, computeFinishScenarios, computeLadderStandings, computeWeeklyLadderStandings, pct, wl };
})();
