/* ============================================================================
   CogGames — experiment schedule & music controller
   Shared by the launcher (main.html) and by every game's sketch.js.

   WHAT THIS FILE DECIDES
   ----------------------
   1. Game order per participant  — a 6x6 Williams balanced Latin square, so
      every game appears once in each play position across the six
      participants, AND every game follows every other game equally often
      (first-order carry-over balance). Fixed for a participant across all
      of their sessions.
   2. Music condition per play POSITION per session — three fixed sequences,
      identical for every participant. Because each participant walks the six
      positions in a different game order, a given game still meets all three
      conditions across the three sessions.
   3. Playback — the assigned track starts when the Assessment button is
      pressed, pauses when the assessment ends, and RESUMES from where it
      stopped the next time the same condition comes up in the same session
      (so a repeated condition does not restart from bar one). Positions are
      keyed by participant+session, so every new session starts at 0:00.

   Familiarization is ALWAYS silent and only runs in session 1.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---- Games in canonical (folder) order; `name` matches CONFIG.GAME_NAME --- */
  var GAMES = [
    { folder: '1_Simon',               name: 'simon' },
    { folder: '2_GoNoGo',              name: 'goNogo' },
    { folder: '3_MemoryMatrix',        name: 'memoryMatrix' },
    { folder: '4_StarSearch',          name: 'starSearch' },
    { folder: '5_BrainShift',          name: 'brainShift' },
    { folder: '6_ChalkboardChallenge', name: 'chalkboardChallenge' }
  ];

  /* ---- Participant -> play order (indices into GAMES) ----------------------
     Williams square rows: 1,2,6,3,5,4 then +1 (mod 6) per participant.        */
  var PARTICIPANT_ORDER = {
    '1': [0, 1, 5, 2, 4, 3],
    '2': [1, 2, 0, 3, 5, 4],
    '3': [2, 3, 1, 4, 0, 5],
    '4': [3, 4, 2, 5, 1, 0],
    '5': [4, 5, 3, 0, 2, 1],
    '6': [5, 0, 4, 1, 3, 2]
  };

  /* ---- Session -> music condition by play POSITION (1..6) ------------------
     S = silence, L = LALV (Chopin Prelude), H = HAHV (Mozart Rondo).          */
  var SESSION_SCHEDULE = {
    '1': ['S', 'H', 'L', 'H', 'L', 'S'],
    '2': ['L', 'S', 'H', 'L', 'S', 'H'],
    '3': ['H', 'L', 'S', 'S', 'H', 'L']
  };

  var PARTICIPANT_IDS = ['1', '2', '3', '4', '5', '6'];
  var SESSION_IDS     = ['1', '2', '3'];

  var LABEL = { S: 'silence', L: 'LALV', H: 'HAHV' };
  var FILE  = {
    L: 'audio/Chopin_Prelude_LALV_10min.mp3',
    H: 'audio/Mozart_Rondo_HAHV_10min.mp3'
  };

  /* Absolute base URL of the Cognitive-Games folder, derived from this
     script's own src so the audio resolves from launcher AND game pages. */
  var ROOT = (function () {
    var s = document.currentScript;
    if (!s) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && /experiment\.js(\?|$)/.test(all[i].src)) { s = all[i]; break; }
      }
    }
    return s && s.src ? s.src.replace(/experiment\.js(\?.*)?$/, '') : '';
  })();

  /* ------------------------------------------------------------------ lookups */

  function normalizeId(v) { return String(v == null ? '' : v).trim(); }

  function orderFor(participantId) {
    var idx = PARTICIPANT_ORDER[normalizeId(participantId)];
    if (!idx) idx = [0, 1, 2, 3, 4, 5];          // unknown participant: canonical
    return idx.map(function (i) { return GAMES[i]; });
  }

  /* 1-based play position of a game for this participant (null if unknown). */
  function positionFor(participantId, gameName) {
    var order = orderFor(participantId);
    for (var i = 0; i < order.length; i++) {
      if (order[i].name === gameName) return i + 1;
    }
    return null;
  }

  /* 'S' | 'L' | 'H' — defaults to silence when anything is unknown. */
  function conditionFor(participantId, sessionId, gameName) {
    var sched = SESSION_SCHEDULE[normalizeId(sessionId)];
    var pos = positionFor(participantId, gameName);
    if (!sched || !pos) return 'S';
    return sched[pos - 1] || 'S';
  }

  /* 'silence' | 'LALV' | 'HAHV' — the value written to the CSV metadata. */
  function conditionLabelFor(participantId, sessionId, gameName) {
    return LABEL[conditionFor(participantId, sessionId, gameName)];
  }

  /* Familiarization runs once per participant, in session 1 only. When no
     session is stored (a game opened standalone) it stays available. */
  function familiarizationAllowed(sessionId) {
    var s = normalizeId(sessionId != null ? sessionId : storedSessionId());
    return s === '' || s === '1';
  }

  // sessionStorage on purpose — see the matching comment in main.html.
  function storedSession() {
    try { return JSON.parse(sessionStorage.getItem('cogGamesSession')) || {}; }
    catch (e) { return {}; }
  }
  function storedSessionId()     { return normalizeId(storedSession().sessionId); }
  function storedParticipantId() { return normalizeId(storedSession().participantId); }

  /* ------------------------------------------------------------- music player */

  var audioEl = null;      // current <audio>, null while silent
  var activeKey = null;    // localStorage key holding its resume position
  var activeCond = null;   // 'L' | 'H'
  var saveTimer = null;

  function posKey(p, s, cond) {
    return 'cogGamesMusicPos_' + normalizeId(p) + '_' + normalizeId(s) + '_' + cond;
  }

  function readPos(key) {
    try {
      var v = parseFloat(localStorage.getItem(key));
      return (isFinite(v) && v > 0) ? v : 0;
    } catch (e) { return 0; }
  }

  function persist() {
    if (audioEl && activeKey && isFinite(audioEl.currentTime)) {
      try { localStorage.setItem(activeKey, String(audioEl.currentTime)); } catch (e) {}
    }
  }

  /* Pause the current track and remember exactly where it stopped. */
  function stopMusic() {
    if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
    if (audioEl) {
      persist();
      try { audioEl.pause(); } catch (e) {}
      audioEl = null;
    }
    activeKey = null;
    activeCond = null;
  }

  /* Start (or resume) the condition assigned to this game. Call it from the
     Assessment button handler: that keeps playback inside a real user gesture,
     which is what browser autoplay policies require. Returns the label. */
  function startMusic(participantId, sessionId, gameName) {
    var cond = conditionFor(participantId, sessionId, gameName);
    stopMusic();
    if (cond === 'S') return LABEL.S;

    var key = posKey(participantId, sessionId, cond);
    var startAt = readPos(key);
    var a = new Audio(ROOT + FILE[cond]);
    a.loop = true;      // safety net if a game outruns the 10-minute file
    a.volume = 1.0;     // fixed: loudness is already matched inside the files

    function seekAndPlay() {
      try {
        if (startAt > 0 && (!a.duration || startAt < a.duration)) a.currentTime = startAt;
      } catch (e) {}
      var p = a.play();
      if (p && p.catch) p.catch(function () { /* blocked: stays silent */ });
    }
    if (a.readyState >= 1) seekAndPlay();
    else a.addEventListener('loadedmetadata', seekAndPlay, { once: true });

    audioEl = a;
    activeKey = key;
    activeCond = cond;
    saveTimer = setInterval(persist, 1000);   // survive an unexpected close
    return LABEL[cond];
  }

  /* Wipe stored resume positions for one participant+session (used by the
     launcher when a genuinely new session is selected). */
  function resetSessionMusic(participantId, sessionId) {
    ['L', 'H'].forEach(function (c) {
      try { localStorage.removeItem(posKey(participantId, sessionId, c)); } catch (e) {}
    });
  }

  window.addEventListener('beforeunload', persist);
  window.addEventListener('pagehide', persist);

  /* ---------------------------------------------------------------- exports */
  global.CogGamesExperiment = {
    GAMES: GAMES,
    PARTICIPANT_IDS: PARTICIPANT_IDS,
    SESSION_IDS: SESSION_IDS,
    orderFor: orderFor,
    positionFor: positionFor,
    conditionFor: conditionFor,
    conditionLabelFor: conditionLabelFor,
    familiarizationAllowed: familiarizationAllowed,
    startMusic: startMusic,
    stopMusic: stopMusic,
    resetSessionMusic: resetSessionMusic,
    storedParticipantId: storedParticipantId,
    storedSessionId: storedSessionId
  };
})(window);
