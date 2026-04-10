/* ============================================================
   Game Timers — js/timers.js
   Supports up to two independent countdown timers.
   Config persisted in localStorage; runtime state in memory.
   ============================================================ */

const TIMERS_KEY = 'pb_timers';

// Runtime state for each timer slot
const _timerState = [null, null, null];

// Court config supplied by admin.js when the timers page is activated
let _courtConfig = { n: 0, names: {} };

// Session context for push notifications — set by admin.js on nav
let _timerPushCtx = { adminPin: null, vapidPublicKey: null, replyTo: '' };

// Called by admin.js after config loads so the modal knows which courts exist
function setTimerCourtConfig(numCourts, nameMap) {
  _courtConfig = { n: parseInt(numCourts) || 0, names: nameMap || {} };
}

// Called by admin.js to enable automatic push notifications from timer events
function setTimerSessionContext(adminPin, vapidPublicKey, replyTo) {
  _timerPushCtx = { adminPin: adminPin || null, vapidPublicKey: vapidPublicKey || null, replyTo: replyTo || '' };
}

// Lazy Web Audio context (must be created after user interaction)
let _audioCtx = null;
function _getAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

// ── Sounds ────────────────────────────────────────────────────
function _playStartSound() {
  try {
    const ctx = _getAudio();
    const t = ctx.currentTime;
    [[440, 0], [550, 0.14], [660, 0.28]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.28, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.22);
      osc.start(t + delay);
      osc.stop(t + delay + 0.22);
    });
  } catch(e) {}
}

function _playWarnSound() {
  try {
    const ctx = _getAudio();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 900;
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.18);
  } catch(e) {}
}

function _playBuzzerSound() {
  try {
    const ctx = _getAudio();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.value = 110;
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.start(t);
    osc.stop(t + 0.9);
  } catch(e) {}
}

// ── Storage helpers ───────────────────────────────────────────
function _loadConfigs() {
  try { return JSON.parse(localStorage.getItem(TIMERS_KEY)) || []; }
  catch(e) { return []; }
}

function _saveConfigs(configs) {
  localStorage.setItem(TIMERS_KEY, JSON.stringify(configs));
}

function _defaultConfig(index) {
  return {
    title: 'Timer ' + (index + 1),
    startMinutes: 15,
    startSeconds: 0,
    warnEnabled: false,
    warnSeconds: 120,
    warnSound: true,
    countNegative: false,
  };
}

// ── State helpers ─────────────────────────────────────────────
function _initState(index, config) {
  const st = _timerState[index];
  if (st) {
    clearInterval(st.intervalId);
    clearInterval(st.startFlashTimeout);
  }
  _timerState[index] = {
    intervalId: null,
    startFlashTimeout: null,
    running: false,
    muted: false,
    expanded: false,
    currentSeconds: config.startMinutes * 60 + config.startSeconds,
    phase: 'idle',    // idle | start-countdown | running | paused | warning | done | negative
    warnFired: false,
    warnPushFired: false,
    buzzFired: false,
    endPushFired: false,
    countdownRemaining: 0,
  };
}

// ── Time formatting ───────────────────────────────────────────
function _fmt(secs) {
  const neg = secs < 0;
  const abs = Math.abs(secs);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return (neg ? '-' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function _escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Push notifications ────────────────────────────────────────
// Silently sends a push notification to all subscribed players.
// Requires: push to be set up (VAPID keys), admin PIN in context.
// Falls through silently on any error so it never disrupts the timer UI.
async function _sendTimerPush(title, body, timerConfig) {
  try {
    const { adminPin, vapidPublicKey, replyTo } = _timerPushCtx;
    if (!adminPin || !vapidPublicKey) return;              // push not configured
    if (typeof VapidPush === 'undefined') return;          // push.js not loaded

    const privKey = sessionStorage.getItem('pb_vapid_priv');
    if (!privKey) return;                                  // private key not unlocked

    // Build a human-readable court list for the notification body
    const courts = (timerConfig.courts || []);
    const courtStr = courts.length
      ? courts.map(c => (_courtConfig.names[c] && _courtConfig.names[c].trim()) || ('Court ' + c)).join(', ')
      : '';
    const fullBody = courtStr ? `${body} · ${courtStr}` : body;

    const { subscriptions } = await API.getTimerPushSubs(adminPin);
    if (!subscriptions || !subscriptions.length) return;

    const subject       = replyTo ? `mailto:${replyTo}` : 'mailto:noreply@example.com';
    const payload       = JSON.stringify({ title, body: fullBody });
    const notifications = await VapidPush.buildNotifications(
      subscriptions, payload, privKey, vapidPublicKey, subject
    );
    await API.sendTimerPush(adminPin, notifications);
  } catch(e) {
    // Intentionally silent — push failures must never interrupt timer operation
  }
}

// ── Backend sync ─────────────────────────────────────────────
// Build a snapshot that players can use to reconstruct the live countdown.
function _buildTimerSnapshot() {
  const configs = _loadConfigs();
  const now = Date.now() / 1000;
  const timers = configs.map((config, i) => {
    const st = _timerState[i];
    if (!st) return null;
    return {
      index:         i,
      title:         config.title || ('Timer ' + (i + 1)),
      courts:        config.courts || [],
      phase:         st.phase === 'start-countdown' ? 'start-flash' : st.phase,
      valueAtSnap:   st.currentSeconds,
      snapAt:        now,
      warnEnabled:   config.warnEnabled || false,
      warnSeconds:   config.warnEnabled ? (config.warnSeconds || 0) : 0,
      warnSound:     config.warnSound !== false,
      countNegative: config.countNegative || false,
    };
  }).filter(Boolean);
  return { timers };
}

// Fire-and-forget push to backend (swallows errors to never disrupt UI)
function _pushTimerState() {
  try {
    if (typeof API === 'undefined') return;
    API.setTimerState(_buildTimerSnapshot()).catch(() => {});
  } catch(e) {}
}

// ── Render ────────────────────────────────────────────────────
function renderTimersPage() {
  const container = document.getElementById('timers-container');
  if (!container) return;

  const configs = _loadConfigs();

  // Ensure runtime state exists for each configured timer
  configs.forEach((cfg, i) => {
    if (!_timerState[i]) _initState(i, cfg);
  });

  // Update "Add Timer" button visibility
  const addBtn = document.getElementById('btn-add-timer');
  if (addBtn) addBtn.style.display = configs.length >= 3 ? 'none' : '';

  if (configs.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--muted);">
        <div style="font-size:3rem; margin-bottom:12px;">⏱</div>
        <div style="font-size:1rem; font-weight:600; margin-bottom:6px; color:var(--white);">No timers yet</div>
        <div style="font-size:0.85rem;">Click <strong>+ Add Timer</strong> above to create one.</div>
      </div>`;
    return;
  }

  container.innerHTML = configs.map((cfg, i) => _timerBoxHtml(i, cfg)).join('');
}

function _timerBoxHtml(index, config) {
  const st = _timerState[index];
  if (!st) return '';

  const timeStr = _fmt(st.currentSeconds);
  const phase = st.phase;
  const isRunning = st.running;
  const isMuted = st.muted;
  const isExpanded = st.expanded;

  const warnSecs = config.warnEnabled ? (config.warnSeconds || 0) : -1;
  const inWarn = st.currentSeconds > 0 && st.currentSeconds <= warnSecs;
  const isDone  = phase === 'done';
  const isNeg   = phase === 'negative';
  const isCountdown = phase === 'start-countdown';
  const isFlash     = phase === 'start-flash'; // legacy fallback

  let digitColor = 'var(--white)';
  if (inWarn || phase === 'warning') digitColor = 'var(--danger)';
  if (isDone)  digitColor = 'var(--danger)';
  if (isNeg)   digitColor = 'var(--warn)';

  const digitSize = isExpanded ? '5.5rem' : '3.2rem';
  const flashCls  = isDone ? 'tmr-flash' : '';
  const shadowClr = (digitColor !== 'var(--white)') ? digitColor : 'transparent';

  let displayInner;
  // Warning-time annotation: show when configured and not yet in warning/done
  const showWarnHint = config.warnEnabled && warnSecs > 0
    && !inWarn && !isDone && !isNeg && !isCountdown && !isFlash
    && phase !== 'warning';
  const warnHint = showWarnHint
    ? `<div style="font-size:0.7rem; color:rgba(224,85,85,0.6); margin-top:2px; letter-spacing:0.04em;">
        ⚠ warning at ${_fmt(warnSecs)}
       </div>`
    : '';

  if (isCountdown) {
    displayInner = `<span class="tmr-start-pulse" style="font-family:var(--font-display); font-size:${digitSize}; font-weight:800; color:var(--green); letter-spacing:0.06em;">Starting in ${st.countdownRemaining}\u2026</span>`;
  } else if (isFlash) {
    displayInner = `<span class="tmr-start-pulse" style="font-family:var(--font-display); font-size:${digitSize}; font-weight:800; color:var(--green); letter-spacing:0.1em;">START</span>`;
  } else {
    displayInner = `<span class="${flashCls}" style="font-family:'Courier New',monospace; font-size:${digitSize}; font-weight:700; color:${digitColor}; letter-spacing:0.06em; text-shadow:0 0 24px ${shadowClr}40;">${timeStr}</span>${warnHint}`;
  }

  return `
<details id="tmr-box-${index}" open style="margin-bottom:14px;">
  <summary style="list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between;
    background:var(--navy-mid); border-radius:var(--radius); padding:12px 16px;
    border:1px solid rgba(255,255,255,0.08); user-select:none;" onclick="return true;">
    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
      <span style="font-family:var(--font-display); font-weight:700; font-size:0.95rem; text-transform:uppercase; letter-spacing:0.06em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${_escHtml(config.title || ('Timer ' + (index+1)))}
      </span>
      <span id="tmr-summary-time-${index}" style="font-family:'Courier New',monospace; font-size:0.95rem; color:var(--muted);">${timeStr}</span>
    </div>
    <span style="font-size:0.7rem; color:var(--green); opacity:0.55; flex-shrink:0; margin-left:8px;">▼</span>
  </summary>

  <div style="background:var(--navy-mid); border:1px solid rgba(255,255,255,0.08); border-top:none;
    border-bottom-left-radius:var(--radius); border-bottom-right-radius:var(--radius); padding:8px 14px 12px;">

    <!-- Digital display -->
    <div id="tmr-display-${index}" style="text-align:center; padding:${isExpanded ? '6px 0' : '2px 0'}; display:flex; align-items:center; justify-content:center;">
      ${displayInner}
    </div>

    <!-- Controls -->
    <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:4px;">
      <button class="btn btn-secondary" onclick="timerReset(${index})" style="padding:4px 11px; font-size:0.78rem;" title="Reset to start time">
        ↺ Reset
      </button>
      <button id="tmr-btn-start-${index}" class="btn ${isRunning ? 'btn-secondary' : 'btn-primary'}" onclick="timerToggle(${index})" style="padding:4px 15px; font-size:0.78rem;">
        ${isRunning ? '⏸ Pause' : '▶ Start'}
      </button>
      <button id="tmr-btn-mute-${index}" class="btn btn-secondary" onclick="timerToggleMute(${index})" style="padding:4px 11px; font-size:0.78rem;" title="${isMuted ? 'Unmute sounds' : 'Mute sounds'}">
        ${isMuted ? '🔇 Unmute' : '🔊 Mute'}
      </button>
      <button id="tmr-btn-expand-${index}" class="btn btn-secondary" onclick="timerToggleExpand(${index})" style="padding:4px 11px; font-size:0.78rem;" title="${isExpanded ? 'Shrink display' : 'Expand display'}">
        ${isExpanded ? '⊡ Compact' : '⊞ Expand'}
      </button>
      <button class="btn btn-secondary" onclick="openTimerConfig(${index})" style="padding:4px 11px; font-size:0.78rem;" title="Timer settings">
        ⚙ Settings
      </button>
      <button class="btn btn-secondary" onclick="deleteTimer(${index})" style="padding:4px 10px; font-size:0.78rem; color:var(--danger); border-color:rgba(224,90,90,0.3);" title="Delete timer">
        🗑
      </button>
    </div>
  </div>
</details>`;
}

// Update just the live elements (called every tick — no full DOM rebuild)
function _updateTimerLive(index) {
  const configs = _loadConfigs();
  const config = configs[index];
  const st = _timerState[index];
  if (!st || !config) return;

  const phase = st.phase;
  const timeStr = _fmt(st.currentSeconds);
  const isRunning = st.running;
  const isMuted = st.muted;
  const isExpanded = st.expanded;

  const warnSecs = config.warnEnabled ? (config.warnSeconds || 0) : -1;
  const inWarn = st.currentSeconds > 0 && st.currentSeconds <= warnSecs;
  const isDone      = phase === 'done';
  const isNeg       = phase === 'negative';
  const isCountdown = phase === 'start-countdown';
  const isFlash     = phase === 'start-flash'; // legacy fallback

  let digitColor = 'var(--white)';
  if (inWarn || phase === 'warning') digitColor = 'var(--danger)';
  if (isDone)  digitColor = 'var(--danger)';
  if (isNeg)   digitColor = 'var(--warn)';

  const digitSize = isExpanded ? '5.5rem' : '3.2rem';
  const flashCls  = isDone ? 'tmr-flash' : '';
  const shadowClr = (digitColor !== 'var(--white)') ? digitColor : 'transparent';

  // Summary time badge
  const summaryTime = document.getElementById(`tmr-summary-time-${index}`);
  if (summaryTime) summaryTime.textContent = timeStr;

  // Warning-time annotation
  const showWarnHint = config.warnEnabled && warnSecs > 0
    && !inWarn && !isDone && !isNeg && !isCountdown && !isFlash
    && phase !== 'warning';
  const warnHint = showWarnHint
    ? `<div style="font-size:0.7rem; color:rgba(224,85,85,0.6); margin-top:2px; letter-spacing:0.04em;">
        ⚠ warning at ${_fmt(warnSecs)}
       </div>`
    : '';

  // Main display
  const display = document.getElementById(`tmr-display-${index}`);
  if (display) {
    display.style.padding   = isExpanded ? '6px 0' : '2px 0';
    display.style.minHeight = '';
    if (isCountdown) {
      display.innerHTML = `<span class="tmr-start-pulse" style="font-family:var(--font-display); font-size:${digitSize}; font-weight:800; color:var(--green); letter-spacing:0.06em;">Starting in ${st.countdownRemaining}\u2026</span>`;
    } else if (isFlash) {
      display.innerHTML = `<span class="tmr-start-pulse" style="font-family:var(--font-display); font-size:${digitSize}; font-weight:800; color:var(--green); letter-spacing:0.1em;">START</span>`;
    } else {
      display.innerHTML = `<span class="${flashCls}" style="font-family:'Courier New',monospace; font-size:${digitSize}; font-weight:700; color:${digitColor}; letter-spacing:0.06em; text-shadow:0 0 24px ${shadowClr}40;">${timeStr}</span>${warnHint}`;
    }
  }

  // Start/Pause button
  const btnStart = document.getElementById(`tmr-btn-start-${index}`);
  if (btnStart) {
    btnStart.className = `btn ${isRunning ? 'btn-secondary' : 'btn-primary'}`;
    btnStart.innerHTML = isRunning ? '⏸ Pause' : '▶ Start';
  }

  // Mute button
  const btnMute = document.getElementById(`tmr-btn-mute-${index}`);
  if (btnMute) {
    btnMute.innerHTML = isMuted ? '🔇 Unmute' : '🔊 Mute';
    btnMute.title = isMuted ? 'Unmute sounds' : 'Mute sounds';
  }

  // Expand button
  const btnExp = document.getElementById(`tmr-btn-expand-${index}`);
  if (btnExp) {
    btnExp.innerHTML = isExpanded ? '⊡ Compact' : '⊞ Expand';
    btnExp.title = isExpanded ? 'Shrink display' : 'Expand display';
  }
}

// ── Tick ──────────────────────────────────────────────────────
function _timerTick(index) {
  const configs = _loadConfigs();
  const config  = configs[index];
  const st = _timerState[index];
  if (!st || !config) return;

  st.currentSeconds--;

  const warnSecs = config.warnEnabled ? (config.warnSeconds || 0) : -1;
  const pushDelay = (typeof TIMER_PUSH_DELAY_SECS === 'number' && TIMER_PUSH_DELAY_SECS > 0)
    ? TIMER_PUSH_DELAY_SECS : 0;

  // Send warn push early so it arrives right when the visual warning kicks in
  if (config.warnEnabled && !st.warnPushFired && st.currentSeconds <= warnSecs + pushDelay && st.currentSeconds > 0) {
    st.warnPushFired = true;
    _sendTimerPush(
      '⚠️ ' + (config.title || 'Game Timer'),
      _fmt(warnSecs) + ' remaining',
      config
    );
  }

  // Enter warning zone (visual + sound — no push here)
  if (config.warnEnabled && !st.warnFired && st.currentSeconds <= warnSecs && st.currentSeconds > 0) {
    st.warnFired = true;
    st.phase = 'warning';
    if (!st.muted && config.warnSound !== false) _playWarnSound();
    _pushTimerState();
  }

  // Send end push early so it arrives right when the visual buzzer fires
  if (pushDelay > 0 && !st.endPushFired && st.currentSeconds === pushDelay) {
    st.endPushFired = true;
    _sendTimerPush(
      '⏱ Time\'s Up — ' + (config.title || 'Game Timer'),
      'Game timer has ended',
      config
    );
  }

  // Hit zero (visual buzzer + phase change)
  if (st.currentSeconds === 0) {
    st.phase = 'done';
    if (!st.buzzFired) {
      st.buzzFired = true;
      if (!st.muted) _playBuzzerSound();
      // If no push delay configured, send the end push now (original behaviour)
      if (pushDelay === 0) {
        _sendTimerPush(
          '⏱ Time\'s Up — ' + (config.title || 'Game Timer'),
          'Game timer has ended',
          config
        );
      }
    }
    if (!config.countNegative) {
      clearInterval(st.intervalId);
      st.intervalId = null;
      st.running = false;
    }
    _pushTimerState();
  }

  // Negative territory
  if (st.currentSeconds < 0) {
    st.phase = 'negative';
  }

  _updateTimerLive(index);
}

// ── Public controls ───────────────────────────────────────────
function timerToggle(index) {
  const st = _timerState[index];
  if (!st) return;

  if (st.running) {
    // Pause
    clearInterval(st.intervalId);
    st.intervalId = null;
    st.running = false;
    if (st.phase !== 'done' && st.phase !== 'negative') st.phase = 'paused';
    _updateTimerLive(index);
    _pushTimerState();
    return;
  }

  // Start / Resume
  const configs = _loadConfigs();
  const config  = configs[index];
  if (!config) return;

  st.running = true;

  if (st.phase === 'idle') {
    const pushDelay = (typeof TIMER_PUSH_DELAY_SECS === 'number' && TIMER_PUSH_DELAY_SECS > 0)
      ? TIMER_PUSH_DELAY_SECS : 0;
    const countdownSecs = pushDelay > 0 ? pushDelay : 3;

    // Send START push immediately — it will arrive ~pushDelay seconds later,
    // right as the timer begins ticking on the admin screen.
    _sendTimerPush(
      '▶\uFE0F ' + (config.title || 'Game Timer'),
      _fmt(st.currentSeconds) + ' countdown started',
      config
    );

    // Show "Starting in N…" countdown, then begin ticking
    st.phase = 'start-countdown';
    st.countdownRemaining = countdownSecs;
    _updateTimerLive(index);
    _pushTimerState();

    st.startFlashTimeout = setInterval(() => {
      st.countdownRemaining--;
      if (st.countdownRemaining <= 0) {
        clearInterval(st.startFlashTimeout);
        st.startFlashTimeout = null;
        if (!st.running) return;
        const cfgs = _loadConfigs();
        const cfg  = cfgs[index];
        const wSecs = cfg && cfg.warnEnabled ? (cfg.warnSeconds || 0) : -1;
        st.phase = (st.currentSeconds <= wSecs && st.currentSeconds > 0) ? 'warning' : 'running';
        if (!st.muted) _playStartSound(); // beep when timer actually starts
        st.intervalId = setInterval(() => _timerTick(index), 1000);
        _updateTimerLive(index);
        _pushTimerState();
      } else {
        _updateTimerLive(index);
      }
    }, 1000);

  } else {
    // Resume from pause
    const wSecs = config.warnEnabled ? (config.warnSeconds || 0) : -1;
    st.phase = (st.currentSeconds <= wSecs && st.currentSeconds > 0) ? 'warning' : 'running';
    st.intervalId = setInterval(() => _timerTick(index), 1000);
    _updateTimerLive(index);
    _pushTimerState();
  }
}

function timerReset(index) {
  const st = _timerState[index];
  const configs = _loadConfigs();
  const config  = configs[index];
  if (!st || !config) return;

  clearInterval(st.intervalId);
  clearInterval(st.startFlashTimeout);
  st.intervalId = null;
  st.startFlashTimeout = null;
  st.running = false;
  st.currentSeconds = config.startMinutes * 60 + config.startSeconds;
  st.phase = 'idle';
  st.warnFired = false;
  st.warnPushFired = false;
  st.buzzFired = false;
  st.endPushFired = false;
  st.countdownRemaining = 0;
  _updateTimerLive(index);
  _pushTimerState();
}

function timerToggleMute(index) {
  const st = _timerState[index];
  if (!st) return;
  st.muted = !st.muted;
  _updateTimerLive(index);
}

function timerToggleExpand(index) {
  const st = _timerState[index];
  if (!st) return;
  st.expanded = !st.expanded;
  // Ensure the details box stays open when expanding
  const box = document.getElementById(`tmr-box-${index}`);
  if (box && st.expanded) box.open = true;
  _updateTimerLive(index);
}

// ── Config modal ──────────────────────────────────────────────
function openTimerConfig(index) {
  const configs = _loadConfigs();
  const config  = configs[index] || _defaultConfig(index);

  document.getElementById('tmr-cfg-index').value        = index;
  document.getElementById('tmr-cfg-title').value        = config.title || '';
  document.getElementById('tmr-cfg-min').value          = config.startMinutes ?? 15;
  document.getElementById('tmr-cfg-sec').value          = String(config.startSeconds ?? 0).padStart(2, '0');
  document.getElementById('tmr-cfg-warn-on').checked    = config.warnEnabled || false;
  document.getElementById('tmr-cfg-warn-min').value     = Math.floor((config.warnSeconds || 120) / 60);
  document.getElementById('tmr-cfg-warn-sec').value     = String((config.warnSeconds || 120) % 60).padStart(2, '0');
  document.getElementById('tmr-cfg-warn-sound').checked = config.warnSound !== false;
  document.getElementById('tmr-cfg-neg').checked        = config.countNegative || false;

  // Populate court checkboxes
  const courtSection = document.getElementById('tmr-court-section');
  if (courtSection) {
    if (_courtConfig.n > 0) {
      const selectedCourts = config.courts || [];
      let html = '<div style="font-size:0.82rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Courts This Timer Controls</div>';
      html += '<div style="display:flex; flex-wrap:wrap; gap:8px;">';
      for (let c = 1; c <= _courtConfig.n; c++) {
        const name = (_courtConfig.names[c] && _courtConfig.names[c].trim()) ? _courtConfig.names[c] : ('Court ' + c);
        const chk  = selectedCourts.includes(c) ? 'checked' : '';
        html += `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.83rem;background:rgba(255,255,255,0.05);padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);">
          <input type="checkbox" class="tmr-court-cb" value="${c}" ${chk} style="accent-color:var(--green);width:15px;height:15px;">
          ${_escHtml(name)}
        </label>`;
      }
      html += '</div>';
      courtSection.innerHTML = html;
      courtSection.style.display = '';
    } else {
      courtSection.innerHTML = '';
      courtSection.style.display = 'none';
    }
  }

  _syncWarnFields();
  document.getElementById('timer-config-modal').style.display = 'flex';
  document.getElementById('tmr-cfg-title').focus();
}

function _syncWarnFields() {
  const on = document.getElementById('tmr-cfg-warn-on').checked;
  ['tmr-cfg-warn-min', 'tmr-cfg-warn-sec', 'tmr-cfg-warn-sound'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !on;
  });
  const group = document.getElementById('tmr-warn-group');
  if (group) group.style.opacity = on ? '1' : '0.4';
}

function saveTimerConfig() {
  const index = parseInt(document.getElementById('tmr-cfg-index').value);
  const configs = _loadConfigs();

  const startMin = Math.max(0, parseInt(document.getElementById('tmr-cfg-min').value)  || 0);
  const startSec = Math.min(59, Math.max(0, parseInt(document.getElementById('tmr-cfg-sec').value) || 0));
  const warnMin  = Math.max(0, parseInt(document.getElementById('tmr-cfg-warn-min').value) || 0);
  const warnSec  = Math.min(59, Math.max(0, parseInt(document.getElementById('tmr-cfg-warn-sec').value) || 0));

  // Validate at least 1 second
  if (startMin === 0 && startSec === 0) {
    document.getElementById('tmr-cfg-min').value = 15;
    document.getElementById('tmr-cfg-sec').value = '00';
    alert('Starting time must be at least 1 second.');
    return;
  }

  const courts = Array.from(document.querySelectorAll('.tmr-court-cb:checked')).map(cb => parseInt(cb.value));

  const config = {
    title:         document.getElementById('tmr-cfg-title').value.trim() || ('Timer ' + (index + 1)),
    startMinutes:  startMin,
    startSeconds:  startSec,
    warnEnabled:   document.getElementById('tmr-cfg-warn-on').checked,
    warnSeconds:   warnMin * 60 + warnSec,
    warnSound:     document.getElementById('tmr-cfg-warn-sound').checked,
    countNegative: document.getElementById('tmr-cfg-neg').checked,
    courts:        courts,
  };

  configs[index] = config;
  _saveConfigs(configs);
  _initState(index, config);

  document.getElementById('timer-config-modal').style.display = 'none';
  renderTimersPage();
}

function addTimer() {
  const configs = _loadConfigs();
  if (configs.length >= 3) return;
  const newCfg = _defaultConfig(configs.length);
  configs.push(newCfg);
  _saveConfigs(configs);
  _initState(configs.length - 1, newCfg);
  renderTimersPage();
  // Immediately open settings for the new timer
  openTimerConfig(configs.length - 1);
}

function deleteTimer(index) {
  if (!confirm('Remove this timer?')) return;

  const st = _timerState[index];
  if (st) {
    clearInterval(st.intervalId);
    clearTimeout(st.startFlashTimeout);
    _timerState[index] = null;
  }

  const configs = _loadConfigs();
  configs.splice(index, 1);
  _saveConfigs(configs);

  // Compact remaining states into slots 0 and 1
  const remaining = _timerState.filter(Boolean);
  _timerState[0] = remaining[0] || null;
  _timerState[1] = remaining[1] || null;

  renderTimersPage();
  document.getElementById('timer-config-modal').style.display = 'none';
}
