/* ============================================================
   timer-player.js — Player-side game timer display
   Polls the backend every 5 s for a timer snapshot published
   by the admin, then reconstructs and renders the live countdown
   locally for the player's assigned court.
   ============================================================ */

let _ptPollId     = null;   // setInterval handle for backend polling
let _ptTickId     = null;   // setInterval handle for local 1-s tick
let _ptSnap       = null;   // latest { timers: [...] } from backend
let _ptCourt      = null;   // current court number for this player
let _ptSoundFired = {};     // keys already fired to avoid repeats
let _ptMuted      = false;  // player-side mute toggle
let _ptDismissed  = new Set(); // "index_snapAt" keys the player closed

// ── Public API ────────────────────────────────────────────────

// Called by player.js whenever the player's court changes.
function _updatePlayerTimerCourt(courtNum) {
  _ptCourt = courtNum != null ? Number(courtNum) : null;
  _renderPlayerTimers();
}

// When a push notification arrives the service worker posts PUSH_RECEIVED to all
// open clients.  React immediately so the player sees timer changes with no lag
// instead of waiting up to 60 s for the next background poll.
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'PUSH_RECEIVED') {
      _fetchPtState();
    }
  });
}

// Start polling — safe to call multiple times (guarded).
// 5 s interval: only runs for players who have opted in via the checkbox,
// so the polling cost is limited to those who explicitly want timer display.
// Push notifications trigger immediate fetches as a bonus when available.
function _startPlayerTimerPolling() {
  if (_ptPollId) return;
  _fetchPtState();
  _ptPollId = setInterval(_fetchPtState, 5000);
  _ptTickId = setInterval(_renderPlayerTimers, 1000);
  document.addEventListener('visibilitychange', _onPtVisibility);
}

function _stopPlayerTimerPolling() {
  clearInterval(_ptPollId);
  clearInterval(_ptTickId);
  _ptPollId = null;
  _ptTickId = null;
  document.removeEventListener('visibilitychange', _onPtVisibility);
}

function _onPtVisibility() {
  if (document.hidden) {
    clearInterval(_ptPollId);
    _ptPollId = null;
  } else {
    _fetchPtState();
    if (!_ptPollId) _ptPollId = setInterval(_fetchPtState, 5000);
  }
}

// Player controls (called from onclick in rendered HTML)
function _ptToggleMute() {
  _ptMuted = !_ptMuted;
  _renderPlayerTimers();
}

function _ptDismiss(index, snapAt) {
  _ptDismissed.add(`${index}_${snapAt}`);
  _renderPlayerTimers();
}

// ── Fetch ─────────────────────────────────────────────────────
async function _fetchPtState() {
  try {
    const data = await API.getTimerState();
    _ptSnap = (data && data.timerState) ? data.timerState : null;
    // Clear dismiss records for timers that have been reset (new snapAt)
    if (_ptSnap && _ptSnap.timers) {
      const currentKeys = new Set(_ptSnap.timers.map(t => `${t.index}_${t.snapAt}`));
      for (const k of _ptDismissed) {
        // Keep only dismissals that still match a live snapshot
        if (!currentKeys.has(k)) _ptDismissed.delete(k);
      }
    }
    _renderPlayerTimers();
  } catch(e) {}
}

// ── Time math ─────────────────────────────────────────────────
// FIX: 'warning', 'start-flash', and 'negative' are all live/running
// phases — elapsed time must be subtracted from valueAtSnap.
// Only 'paused' and 'idle' use the stored value as-is.
function _ptCalcSecs(t) {
  if (!t) return 0;
  const livePhases = ['running', 'warning', 'start-flash', 'negative'];
  if (livePhases.includes(t.phase)) {
    const elapsed = Date.now() / 1000 - t.snapAt;
    const secs    = t.valueAtSnap - elapsed;
    if (!t.countNegative && secs < 0) return 0;
    return Math.round(secs);
  }
  if (t.phase === 'done') return 0;
  return t.valueAtSnap;  // paused / idle — frozen value
}

function _ptFmt(secs) {
  const neg = secs < 0;
  const abs = Math.abs(secs);
  return (neg ? '-' : '') + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0');
}

function _ptEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Sounds ────────────────────────────────────────────────────
let _ptAudioCtx = null;
function _ptAudio() {
  if (!_ptAudioCtx) _ptAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _ptAudioCtx;
}

function _ptPlayWarn() {
  if (_ptMuted) return;
  try {
    const ctx = _ptAudio(); const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 900;
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.start(t); osc.stop(t + 0.18);
  } catch(e) {}
}

function _ptPlayBuzz() {
  if (_ptMuted) return;
  try {
    const ctx = _ptAudio(); const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sawtooth'; osc.frequency.value = 110;
    g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.start(t); osc.stop(t + 0.9);
  } catch(e) {}
}

// ── Render ────────────────────────────────────────────────────
function _renderPlayerTimers() {
  const el = document.getElementById('player-timer-widget');
  if (!el) return;

  if (!_ptSnap || !_ptSnap.timers || _ptCourt == null) {
    el.innerHTML = '';
    return;
  }

  // Timers assigned to this court, not idle, and not dismissed by player
  const active = _ptSnap.timers.filter(t =>
    t.courts && t.courts.map(Number).includes(_ptCourt) &&
    t.phase !== 'idle' &&
    !_ptDismissed.has(`${t.index}_${t.snapAt}`)
  );

  if (!active.length) { el.innerHTML = ''; return; }

  let html = '';

  active.forEach(t => {
    const secs    = _ptCalcSecs(t);
    const display = _ptFmt(secs);
    const phase   = t.phase;

    // Sound triggers — fire once per unique timer+session (snapAt changes on reset)
    if (t.warnEnabled && t.warnSeconds > 0 && secs <= t.warnSeconds && secs > 0) {
      const key = `warn_${t.index}_${t.snapAt}`;
      if (!_ptSoundFired[key] && t.warnSound) {
        _ptSoundFired[key] = true;
        _ptPlayWarn();
      }
    }
    if (secs <= 0 && phase !== 'negative') {
      const key = `buzz_${t.index}_${t.snapAt}`;
      if (!_ptSoundFired[key]) {
        _ptSoundFired[key] = true;
        _ptPlayBuzz();
      }
    }

    const inWarn  = t.warnEnabled && t.warnSeconds > 0 && secs <= t.warnSeconds && secs > 0;
    const isDone  = secs <= 0 && phase !== 'negative';
    const isNeg   = phase === 'negative' || secs < 0;
    const isPaused = phase === 'paused';
    const isFlash  = phase === 'start-flash';

    let color = 'var(--white)';
    if (inWarn || phase === 'warning') color = 'var(--danger)';
    if (isDone) color = 'var(--danger)';
    if (isNeg)  color = 'var(--warn)';

    const flashCls = (isDone && !isNeg) ? 'tmr-flash' : '';
    const shadow   = color !== 'var(--white)' ? color : 'transparent';

    let digitHtml;
    if (isFlash) {
      digitHtml = `<span class="tmr-start-pulse" style="font-family:var(--font-display);font-size:2.8rem;font-weight:800;color:var(--green);letter-spacing:0.1em;">START</span>`;
    } else {
      digitHtml = `<span class="${flashCls}" style="font-family:'Courier New',monospace;font-size:2.8rem;font-weight:700;color:${color};letter-spacing:0.06em;text-shadow:0 0 20px ${shadow}40;">${display}</span>`;
    }

    const snapAtJs = JSON.stringify(t.snapAt); // safe for inline onclick

    html += `
    <div class="card" style="margin-bottom:10px; border-left:3px solid var(--green); padding:10px 14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
        <div style="font-family:var(--font-display);font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);">
          ⏱ ${_ptEsc(t.title || 'Game Timer')}${isPaused ? ' <span style="color:var(--warn);">· PAUSED</span>' : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button onclick="_ptToggleMute()" title="${_ptMuted ? 'Unmute' : 'Mute'}"
            style="background:none;border:1px solid rgba(255,255,255,0.12);border-radius:5px;color:${_ptMuted ? 'var(--warn)' : 'var(--muted)'};cursor:pointer;font-size:0.8rem;padding:2px 7px;line-height:1.4;">
            ${_ptMuted ? '🔇' : '🔊'}
          </button>
          <button onclick="_ptDismiss(${t.index}, ${snapAtJs})" title="Close timer"
            style="background:none;border:1px solid rgba(255,255,255,0.12);border-radius:5px;color:var(--muted);cursor:pointer;font-size:0.8rem;padding:2px 7px;line-height:1.4;">
            ✕
          </button>
        </div>
      </div>
      <div style="text-align:center;padding:2px 0 0;">
        ${digitHtml}
      </div>
    </div>`;
  });

  el.innerHTML = html;
}
