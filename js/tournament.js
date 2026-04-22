// ============================================================
// tournament.js — Single and double elimination bracket generator
// ============================================================

const Tournament = (() => {

  // ── Helpers ────────────────────────────────────────────────

  // Next power of 2 >= n
  function nextPow2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  // Assign matches to courts round-robin
  function assignCourts(matches, courts) {
    return matches.map((m, i) => ({ ...m, court: (i % courts) + 1 }));
  }

  // Return a player's gender group from the players array
  function getGroup(name, players) {
    if (!players) return 'Either';
    const p = players.find(pl => pl.name === name);
    return p ? (p.group || 'Either') : 'Either';
  }

  // A doubles pair is "mixed" (acceptable) unless both players are M or both are F.
  // Either counts as compatible with anyone.
  function isMixedPair(nameA, nameB, players) {
    const ga = getGroup(nameA, players);
    const gb = getGroup(nameB, players);
    return !(ga === 'M' && gb === 'M') && !(ga === 'F' && gb === 'F');
  }

  // Form mixed-gender doubles teams from a rank-sorted list of individual players.
  // Priority: mixed (MF/ME/FE) > rank proximity.
  // Greedy: for each highest-ranked unpaired player, take the nearest-ranked
  // compatible partner; fall back to nearest-by-rank if no compatible partner exists.
  function formMixedTeams(ranked, players) {
    const remaining = ranked.map(p => ({ ...p }));
    const pairs = [];

    while (remaining.length >= 2) {
      const current = remaining.shift(); // best-ranked unpaired player
      // Find the nearest-ranked compatible (mixed-gender) partner
      let partnerIdx = -1;
      for (let i = 0; i < remaining.length; i++) {
        if (isMixedPair(current.name, remaining[i].name, players)) {
          partnerIdx = i;
          break;
        }
      }
      if (partnerIdx < 0) partnerIdx = 0; // no mixed option — take nearest by rank
      const partner = remaining.splice(partnerIdx, 1)[0];
      pairs.push([current, partner]);
    }

    if (remaining.length === 1) {
      pairs.push([remaining[0], null]); // odd player out — lone team
    }

    return pairs;
  }

  // Build a seeded bracket entry list from standings + present players.
  // For doubles, consecutive pairs of ranked players form teams.
  // When mixedDoubles is true, team pairing uses the mixed-gender algorithm.
  function buildSeeds(presentPlayers, standings, doubles, players, mixedDoubles) {
    // Sort present players by rank.
    // Priority: season standings rank > initialRank > alphabetical
    const ranked = presentPlayers
      .map(name => {
        const s   = standings.find(st => st.name === name);
        const pl  = players  && players.find(p => p.name === name);
        const standRank = s && s.rank && s.rank !== '-' ? s.rank : null;
        const initRank  = pl && pl.initialRank ? pl.initialRank : null;
        return { name, standRank, initRank };
      })
      .sort((a, b) => {
        // Both have season standings — use those
        if (a.standRank && b.standRank) return a.standRank - b.standRank;
        // One has standings, one doesn't — ranked player seeds higher
        if (a.standRank) return -1;
        if (b.standRank) return  1;
        // Neither has standings — use initialRank
        if (a.initRank !== null && b.initRank !== null) {
          return a.initRank !== b.initRank
            ? a.initRank - b.initRank
            : a.name.localeCompare(b.name); // alphabetical tiebreak for duplicates
        }
        if (a.initRank !== null) return -1;
        if (b.initRank !== null) return  1;
        return a.name.localeCompare(b.name);
      });

    if (!doubles) {
      return ranked.map((p, i) => ({
        seed: i + 1,
        name: p.name, name2: '',
        wBracketWins: 0, wBracketLosses: 0,
        lBracketWins: 0, lBracketLosses: 0,
        eliminated: false, inLosersBracket: false,
      }));
    }

    // Doubles: form teams, optionally with mixed-gender pairing
    let pairs;
    if (mixedDoubles) {
      pairs = formMixedTeams(ranked, players);
    } else {
      // Simple adjacent pairing: rank1+rank2, rank3+rank4, ...
      pairs = [];
      for (let i = 0; i < ranked.length; i += 2) {
        pairs.push([ranked[i], ranked[i + 1] || null]);
      }
    }

    return pairs.map(([a, b], i) => ({
      seed: i + 1,
      name:  a.name,
      name2: b ? b.name : '',
      wBracketWins: 0, wBracketLosses: 0,
      lBracketWins: 0, lBracketLosses: 0,
      eliminated: false, inLosersBracket: false,
    }));
  }

  // ── Round 1 generation ─────────────────────────────────────
  // Seed 1 vs lowest, 2 vs second-lowest, etc.
  // Top seeds get byes only if needed to fill courts evenly.
  function generateRound1(seeds, courts, round, week, mode) {
    const n = seeds.length;
    // Use as many courts as possible without exceeding available matches.
    // With n seeds we can have at most floor(n/2) simultaneous matches.
    // Byes go to top seeds only when n is odd (one player/team can't be paired).
    const maxMatches   = Math.floor(n / 2);
    const activeCourts = Math.min(courts, maxMatches);
    // Players/teams that play this round = activeCourts * 2
    // Remaining get byes (always the top seeds)
    const playCount = activeCourts * 2;
    const byeCount  = n - playCount;

    // Top `byeCount` seeds get byes
    const byeSeeds    = seeds.slice(0, byeCount);
    const playSeeds   = seeds.slice(byeCount);

    const pairings = [];

    // Bye entries
    byeSeeds.forEach(s => {
      pairings.push({
        week, round, court: 'bye',
        p1: s.name, p2: s.name2 || '', p3: '', p4: '',
        type: 'tourn-bye'
      });
    });

    // Games: top half of playing seeds vs bottom half (mirrored)
    const half = playSeeds.length / 2;
    const matches = [];
    for (let i = 0; i < half; i++) {
      matches.push({
        week, round,
        p1: playSeeds[i].name,
        p2: playSeeds[i].name2 || '',
        p3: playSeeds[playSeeds.length - 1 - i].name,
        p4: playSeeds[playSeeds.length - 1 - i].name2 || '',
        type: 'tourn-game'
      });
    }

    assignCourts(matches, courts).forEach(m => pairings.push(m));
    return pairings;
  }

  // ── Advance round ──────────────────────────────────────────
  // Given completed scores for current round, determine next round pairings.
  // Returns { pairings, seeds, done, champion }
  function advanceRound(seeds, weekScores, currentRound, courts, week, mode, weekPairings = []) {
    const nextRound = currentRound + 1;

    // Determine winners/losers from this round's scores
    const roundScores = weekScores.filter(s => parseInt(s.round) === currentRound);

    // Update seeds based on results
    const updatedSeeds = seeds.map(s => ({ ...s }));

    // Process byes — teams with a tourn-bye advance automatically with a win

    roundScores.forEach(score => {
      if (score.score1 === '' || score.score2 === '' ||
          score.score1 === null || score.score2 === null) return;

      const s1 = parseInt(score.score1);
      const s2 = parseInt(score.score2);
      const p1won = s1 > s2;

      const winner = p1won ? score.p1 : score.p3;
      const loser  = p1won ? score.p3 : score.p1;

      const wSeed = updatedSeeds.find(s => s.name === winner);
      const lSeed = updatedSeeds.find(s => s.name === loser);

      if (wSeed) {
        if (wSeed.inLosersBracket) wSeed.lBracketWins++;
        else wSeed.wBracketWins++;
      }
      if (lSeed) {
        if (mode === 'double') {
          if (lSeed.inLosersBracket) {
            // Already in losers bracket — second loss, eliminated
            lSeed.lBracketLosses++;
            lSeed.eliminated = true;
          } else {
            // First loss — move to losers bracket
            lSeed.wBracketLosses++;
            lSeed.inLosersBracket = true;
          }
        } else {
          // Single elimination — out
          lSeed.wBracketLosses++;
          lSeed.eliminated = true;
        }
      }
    });

    // Process tourn-bye pairings — bye teams advance with a win, no score needed
    const byePairingsRound = weekPairings.filter(p =>
      parseInt(p.round) === currentRound && (p.type === 'tourn-bye' || p.type === 'bye')
    );
    byePairingsRound.forEach(byePairing => {
      [byePairing.p1, byePairing.p2].filter(Boolean).forEach(name => {
        const seed = updatedSeeds.find(s => s.name === name);
        if (seed && !seed.eliminated) {
          seed.wBracketWins++;  // advance the bye team
        }
      });
    });

    // Who is still playing?
    const winners  = updatedSeeds.filter(s => !s.eliminated && !s.inLosersBracket);
    const losers   = updatedSeeds.filter(s => !s.eliminated && s.inLosersBracket);
    const active   = updatedSeeds.filter(s => !s.eliminated);

    // Check for completion
    if (mode === 'single') {
      if (active.length <= 1) {
        return { pairings: [], seeds: updatedSeeds, done: true, champion: active[0] ? (active[0].name2 ? active[0].name + ' & ' + active[0].name2 : active[0].name) : null };
      }
    } else {
      // Double elimination done when only 1 remains or grand final played
      if (active.length <= 1) {
        return { pairings: [], seeds: updatedSeeds, done: true, champion: active[0] ? (active[0].name2 ? active[0].name + ' & ' + active[0].name2 : active[0].name) : null };
      }
      // Grand final: exactly 1 winner and 1 loser left
      if (winners.length === 1 && losers.length === 1) {
        // Grand final — losers bracket champ vs winners bracket champ
        // Winners bracket champ only needs 1 loss to be eliminated
        const match = assignCourts([{
          week, round: nextRound,
          p1: winners[0].name, p2: winners[0].name2 || '',
          p3: losers[0].name,  p4: losers[0].name2 || '',
          type: 'tourn-grand-final'
        }], courts);
        return { pairings: match, seeds: updatedSeeds, done: false };
      }
    }

    const pairings = [];
    let courtIdx = 0;

    // Winners bracket — pair by seed order
    const wMatches = pairBracket(winners, week, nextRound, 'tourn-game');
    wMatches.forEach(m => { m.court = (courtIdx++ % courts) + 1; pairings.push(m); });

    // Losers bracket (double elim only)
    if (mode === 'double' && losers.length > 0) {
      if (losers.length === 1) {
        // Lone loser gets a bye in losers bracket
        pairings.push({ week, round: nextRound, court: 'bye', p1: losers[0].name, p2: losers[0].name2 || '', p3:'', p4:'', type:'tourn-bye' });
      } else {
        const lMatches = pairBracket(losers, week, nextRound, 'tourn-loser-game');
        lMatches.forEach(m => { m.court = (courtIdx++ % courts) + 1; pairings.push(m); });
      }
    }

    return { pairings, seeds: updatedSeeds, done: false };
  }

  // Pair players/teams: first vs last, second vs second-last.
  // Top seed (players[0]) always gets the bye when count is odd.
  function pairBracket(players, week, round, type) {
    const matches = [];
    let playing = players;

    // Odd team out: top seed gets the bye, remaining seeds pair up
    if (players.length % 2 === 1) {
      const bye = players[0];
      matches.push({ week, round, court: 'bye', p1: bye.name, p2: bye.name2 || '', p3:'', p4:'', type:'tourn-bye' });
      playing = players.slice(1);
    }

    const half = playing.length / 2;
    for (let i = 0; i < half; i++) {
      const a = playing[i];
      const b = playing[playing.length - 1 - i];
      matches.push({
        week, round,
        p1: a.name,  p2: a.name2 || '',
        p3: b.name,  p4: b.name2 || '',
        type
      });
    }
    return matches;
  }


  // ── Round Robin Reseeded ───────────────────────────────────
  // Everyone plays every round. After each round players are
  // re-ranked by wins (initial seed as tiebreak). Teams reform
  // each round. Bye rotates to whoever has sat out fewest times.

  function buildRRSeeds(presentPlayers, standings, players) {
    // Rank individuals (not pairs) by season standings > initialRank > alpha
    return presentPlayers
      .map(name => {
        const s  = standings.find(st => st.name === name);
        const pl = players && players.find(p => p.name === name);
        const standRank = s && s.rank && s.rank !== '-' ? s.rank : null;
        const initRank  = pl && pl.initialRank ? pl.initialRank : null;
        return { name, standRank, initRank };
      })
      .sort((a, b) => {
        if (a.standRank && b.standRank) return a.standRank - b.standRank;
        if (a.standRank) return -1;
        if (b.standRank) return  1;
        if (a.initRank !== null && b.initRank !== null)
          return a.initRank !== b.initRank ? a.initRank - b.initRank : a.name.localeCompare(b.name);
        if (a.initRank !== null) return -1;
        if (b.initRank !== null) return  1;
        return a.name.localeCompare(b.name);
      })
      .map((p, i) => ({
        name: p.name,
        seed: i + 1,     // initial seed (tiebreak, never changes)
        wins: 0,
        losses: 0,
        byes: 0,
      }));
  }

  // Generate one round of round-robin pairings.
  // doubles:      true = form 2-player teams, false = singles matchups
  // mixedDoubles: true = use mixed-gender team pairing (requires players array)
  // players:      full player records (needed for gender lookup)
  function generateRRRound(rrSeeds, courts, round, week, doubles, mixedDoubles, players) {
    // Sort by wins desc, then initial seed asc (lower seed = better)
    const ranked = [...rrSeeds].sort((a, b) =>
      b.wins !== a.wins ? b.wins - a.wins : a.seed - b.seed
    );

    // Choose bye recipient: fewest byes, tiebreak = lowest current rank position
    let byePlayer = null;
    if (ranked.length % 2 === 1) {
      // Find player with fewest byes; among ties pick lowest ranked (last in array)
      const minByes = Math.min(...ranked.map(p => p.byes));
      // Start from the bottom of rankings for the bye (weakest current player)
      for (let i = ranked.length - 1; i >= 0; i--) {
        if (ranked[i].byes === minByes) { byePlayer = ranked[i]; break; }
      }
    }

    const playing = byePlayer ? ranked.filter(p => p.name !== byePlayer.name) : ranked;
    const pairings = [];

    if (byePlayer) {
      pairings.push({
        week, round, court: 'bye',
        p1: byePlayer.name, p2: '', p3: '', p4: '',
        type: 'tourn-bye'
      });
    }

    if (doubles) {
      // Form 2-player teams from ranked players, then match best team vs worst team
      let teamPairs;
      if (mixedDoubles) {
        teamPairs = formMixedTeams(playing, players);
      } else {
        // Simple adjacent pairing: rank1+rank2, rank3+rank4, ...
        teamPairs = [];
        for (let i = 0; i < playing.length; i += 2) {
          teamPairs.push([playing[i], playing[i + 1] || null]);
        }
      }

      // Build team objects [{p1, p2}, ...]
      const teams = teamPairs.map(([a, b]) => ({
        p1: a.name,
        p2: b ? b.name : '',
      }));

      // Best team vs worst team
      const half = Math.floor(teams.length / 2);
      const matches = [];
      for (let i = 0; i < half; i++) {
        matches.push({
          week, round,
          p1: teams[i].p1, p2: teams[i].p2,
          p3: teams[teams.length - 1 - i].p1,
          p4: teams[teams.length - 1 - i].p2,
          type: 'tourn-game'
        });
      }
      assignCourts(matches, courts).forEach(m => pairings.push(m));
    } else {
      // Singles: rank1 vs rankLast, rank2 vs rank2ndLast...
      const half = playing.length / 2;
      const matches = [];
      for (let i = 0; i < half; i++) {
        matches.push({
          week, round,
          p1: playing[i].name, p2: '',
          p3: playing[playing.length - 1 - i].name, p4: '',
          type: 'tourn-game'
        });
      }
      assignCourts(matches, courts).forEach(m => pairings.push(m));
    }

    return pairings;
  }

  function advanceRoundRR(rrSeeds, weekPairings, weekScores, currentRound, courts, week, doubles, mixedDoubles, players) {
    const nextRound = currentRound + 1;

    // Update win/loss/bye counts from current round
    const updated = rrSeeds.map(s => ({ ...s }));
    const roundPairings = weekPairings.filter(p => parseInt(p.round) === currentRound);

    roundPairings.forEach(p => {
      if (p.type === 'tourn-bye' || p.type === 'bye') {
        const pl = updated.find(s => s.name === p.p1);
        if (pl) pl.byes++;
        return;
      }
      const score = weekScores.find(s =>
        parseInt(s.round) === currentRound && String(s.court) === String(p.court)
      );
      if (!score || score.score1 === '' || score.score1 === null) return;

      const s1 = parseInt(score.score1), s2 = parseInt(score.score2);

      if (doubles) {
        // Winners are p1+p2 team
        const t1win = s1 > s2;
        [p.p1, p.p2].filter(Boolean).forEach(name => {
          const pl = updated.find(s => s.name === name);
          if (pl) { if (t1win) pl.wins++; else pl.losses++; }
        });
        [p.p3, p.p4].filter(Boolean).forEach(name => {
          const pl = updated.find(s => s.name === name);
          if (pl) { if (!t1win) pl.wins++; else pl.losses++; }
        });
      } else {
        const winner = s1 > s2 ? p.p1 : p.p3;
        const loser  = s1 > s2 ? p.p3 : p.p1;
        const wp = updated.find(s => s.name === winner);
        const lp = updated.find(s => s.name === loser);
        if (wp) wp.wins++;
        if (lp) lp.losses++;
      }
    });

    const pairings = generateRRRound(updated, courts, nextRound, week, doubles, mixedDoubles, players);
    return { pairings, rrSeeds: updated };
  }

  // ── Entry points ───────────────────────────────────────────

  // mode: 'single' | 'double' | 'rr' (doubles round-robin) | 'rr-singles'
  // doubles:      for 'single'/'double' — whether to use 2-player teams
  // players:      full player records (for initialRank and gender lookup)
  // mixedDoubles: true = prefer mixed-gender teams in doubles pairing
  function generateTournament(presentPlayers, courts, week, mode, standings, doubles, players, mixedDoubles) {
    // Round-robin modes — use separate seed/round structure
    if (mode === 'rr' || mode === 'rr-singles') {
      const isDoubles = mode === 'rr'; // rr-singles forces singles
      const minPlayers = isDoubles ? 4 : 2;
      if (presentPlayers.length < minPlayers) {
        return { error: `Need at least ${minPlayers} players for this tournament format.` };
      }
      const rrSeeds = buildRRSeeds(presentPlayers, standings, players);
      const pairings = generateRRRound(rrSeeds, courts, 1, week, isDoubles, isDoubles && mixedDoubles, players);
      return { pairings, rrSeeds, round: 1, mode, week, doubles: isDoubles };
    }

    // Elimination modes
    const minPlayers = doubles ? 4 : 2;
    if (presentPlayers.length < minPlayers) {
      return { error: `Need at least ${minPlayers} players for a ${doubles ? 'doubles' : 'singles'} tournament.` };
    }
    const seeds = buildSeeds(presentPlayers, standings, doubles, players, mixedDoubles);
    const pairings = generateRound1(seeds, courts, 1, week, mode);
    return { pairings, seeds, round: 1, mode, week, doubles };
  }

  function advanceTournament(seeds, weekScores, currentRound, courts, week, mode, weekPairings = []) {
    return advanceRound(seeds, weekScores, currentRound, courts, week, mode, weekPairings);
  }

  return { generateTournament, advanceTournament, advanceRoundRR };
})();
