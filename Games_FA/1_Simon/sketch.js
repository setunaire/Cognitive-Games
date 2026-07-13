/* ============================================================================
   SIMON TASK — Assessment Phase (Persian version)
   Project : Evaluation of Unconscious Effect of Music on Cognitive Functions
   Spec    : CogGames_Documentation.docx — Section 1 (+ Section 0 common spec)

   Cognitive function: Spatial stimulus-response compatibility (Simon effect),
   attentional control.

   A direction word appears on screen. The participant presses the arrow key
   matching the word's MEANING, regardless of the word's screen POSITION.
   Meaning/position conflicts (incongruent trials) produce the Simon effect.

   File layout:
     1. CONFIG            — every tunable parameter
     2. STRINGS           — every user-visible text (translate here only)
     3. LEVELS            — level definitions (positions, keys, windows)
     4. STATES            — state machine constants
     5. RUNTIME STATE     — mutable session/trial variables
     6. p5 LIFECYCLE      — setup / draw / windowResized
     7. SCREENS           — menu, metadata, instructions, summary, end
     8. TRIAL GENERATION  — pre-pooled 50/50 congruency (Section 1.3)
     9. TRIAL FLOW        — ITI → stimulus → response/timeout → log
    10. INPUT HANDLERS    — keyboard mapping per level
    11. LOGGING & EXPORT  — common + Simon-specific fields, CSV export
    12. HELPERS           — shuffle, formatting, DOM utilities
   ========================================================================== */

/* ============================================================================
   1. CONFIG — all tunable parameters
   ========================================================================== */
const CONFIG = {
  GAME_NAME: 'simon',                  // short camelCase id used in logs/filenames
  INPUT_DEVICE: 'keyboard_arrow',       // reported in session metadata (Section 0.10)

  // --- Trial structure (Section 0.3 / 1.5) ---
  TRIALS_PER_LEVEL: 40,
  CONGRUENT_TRIALS: 20,                // exact congruent count per level pool
  INCONGRUENT_TRIALS: 20,              // exact incongruent count per level pool

  // --- Timing (Sections 0.5 / 0.6 / 0.8) ---
  ITI_MS: 150,                         // blank inter-trial interval
  RESPONSE_WINDOW_MS: [2000, 1000, 750], // L1 / L2 / L3
  ANTICIPATORY_THRESHOLD_MS: 150,      // RT below this => anticipatoryResponse = 1

  // --- Stimulus geometry ---
  STIMULUS_OFFSET_X: 260,              // horizontal distance of left/right positions from center (px)
  STIMULUS_OFFSET_Y: 190,              // vertical distance of up/down positions from center (px)
  WORD_TEXT_SIZE: 44,                  // direction word font size
  WORD_CARD_PADDING_X: 28,             // solid card behind the word (covers "+" at center)
  WORD_CARD_PADDING_Y: 16,
  PLUS_SIZE: 56,                       // center plus sign text size
  PLUS_VISIBLE_DURING_ITI: true,       // plus is a permanent reference frame (Section 1.1)

  // --- HUD (Section 0.7) ---
  HUD_TEXT_SIZE: 18,
  HUD_MARGIN_TOP: 28,

  // --- Colors (visual theme; stimulus area stays neutral for validity) ---
  COLORS: {
    BG: '#F4F6F8',                     // canvas background
    TEXT: '#212529',                   // primary text
    ACCENT: '#3B5BDB',                 // headings / highlights
    HUD: '#37474F',                    // HUD text
    PLUS: '#5C7CFA',                   // center plus sign (light indigo — neutral for all trial types)
    WORD: '#FFFFFF',                   // direction word text
    WORD_CARD: '#3B5BDB',              // solid card behind the word
    CORRECT: '#2F9E44',               // summary: correct
    INCORRECT: '#E03131',             // summary: incorrect
    TIMEOUT: '#F08C00'                // summary: timeout
  },

  // --- Misc ---
  MENU_TITLE_SIZE: 42,
  INSTRUCTION_TEXT_SIZE: 22,
  SUMMARY_TEXT_SIZE: 24
};

/* ============================================================================
   2. STRINGS — every user-visible text lives here (single translation point)
   ========================================================================== */
const STRINGS = {
  gameTitle: 'آزمون سایمون',
  gameSubtitle: 'به معنای کلمه پاسخ دهید — نه به مکان آن',

  btnFamiliarization: 'آشنایی',
  btnAssessment: 'ارزیابی',
  familiarizationEmpty: 'بخش آشنایی هنوز آماده نیست.',

  metadataTitle: 'اطلاعات جلسه',
  labelParticipantId: 'شناسه شرکت‌کننده',
  labelSessionId: 'شناسه جلسه',
  labelMusicCondition: 'شرایط موسیقی',
  placeholderParticipantId: 'مثلاً P001',
  placeholderSessionId: 'مثلاً P001_S1',
  placeholderMusicCondition: 'مثلاً silence',
  btnStartExperiment: 'شروع',
  metadataError: 'لطفاً هر سه فیلد را پر کنید.',

  // Direction words (the stimuli themselves)
  words: { left: 'چپ', right: 'راست', center: 'مرکز', up: 'بالا', down: 'پایین' },

  levelLabel: 'مرحله',
  ofLabel: 'از',
  instructionsCommon:
    'کلمه‌ای جهت‌دار در جایی از صفحه ظاهر می‌شود.\n' +
    'کلیدِ جهتی را فشار دهید که با «معنای» کلمه مطابقت دارد،\n' +
    'مهم نیست کلمه در کجای صفحه ظاهر شود.',
  keyHints: {
    left: '← چپ', right: '→ راست',
    center: '↓ مرکز', up: '↑ بالا', down: '↓ پایین'
  },
  btnStartLevel: 'شروع مرحله',
  pressSpaceToStart: '(یا کلید فاصله را فشار دهید)',

  hudTrial: 'آزمایش: {i} از {n}',
  hudTime: 'زمان: {t}',

  summaryTitle: 'پایان مرحله {l}',
  summaryCorrect: 'درست',
  summaryIncorrect: 'نادرست',
  summaryTimeout: 'اتمام زمان',
  btnContinue: 'ادامه',

  endTitle: 'پایان ارزیابی',
  endThanks: 'از مشارکت شما سپاسگزاریم!',
  btnSaveCsv: 'ذخیره نتایج (CSV)',
  btnReturnMenu: 'منوی اصلی',
  confirmLeaveUnsaved: 'نتایج هنوز ذخیره نشده‌اند. با این حال خارج می‌شوید؟',
  saveReminder: 'لطفاً پیش از بستن این پنجره نتایج را ذخیره کنید.'
};

/* ============================================================================
   3. LEVELS — level definitions (Section 1.2)
   Each level lists its direction set and the active key map.
   NOTE: at L2 the DOWN arrow means "center"; at L3 it means "down".
   ========================================================================== */
const LEVELS = [
  {
    id: 1,
    directions: ['left', 'right'],
    keyMap: { LEFT: 'left', RIGHT: 'right' },
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[0]
  },
  {
    id: 2,
    directions: ['left', 'right', 'center'],
    keyMap: { LEFT: 'left', RIGHT: 'right', DOWN: 'center' },
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[1]
  },
  {
    id: 3,
    directions: ['left', 'right', 'up', 'down'],
    keyMap: { LEFT: 'left', RIGHT: 'right', UP: 'up', DOWN: 'down' },
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[2]
  }
];

/* ============================================================================
   4. STATES — state machine constants
   ========================================================================== */
const STATES = {
  MENU: 'menu',
  METADATA: 'metadata',
  INSTRUCTIONS: 'instructions',
  ITI: 'iti',
  STIMULUS: 'stimulus',
  LEVEL_SUMMARY: 'level_summary',
  END: 'end'
};

/* ============================================================================
   5. RUNTIME STATE — mutable session / trial variables
   ========================================================================== */
let state = STATES.MENU;

// Session metadata (from the form)
let metaData = { participantId: '', sessionId: '', musicCondition: '' };
let currentPhase = null;               // 'familiarization' | 'assessment'
let sessionStartUtc = null;            // ISO 8601 wall clock at session start
let sessionStartMonotonic = 0;         // performance.now() at session start

// Level / trial bookkeeping
let levelIdx = 0;                      // 0-based index into LEVELS
let trialPool = [];                    // pre-generated trials for current level
let trialIdxLevel = 0;                 // 0-based within level
let trialIdxGlobal = 0;                // 0-based across session
let levelStats = { correct: 0, incorrect: 0, timeout: 0 };
let totalStats = { correct: 0, incorrect: 0, timeout: 0 };

// Per-trial timing / response
let itiOnsetMs = 0;                    // session-relative
let stimulusOnsetMs = 0;               // session-relative
let trialStartSessionMs = 0;           // = stimulusOnsetMs for Simon (trial onset)
let responded = false;

// Logs
let trialLogs = [];
let csvSaved = false;                // set once the results CSV has been downloaded

// UI element references
let ui = {};
let familiarizationNotice = '';
let metadataErrorMsg = '';

/* ============================================================================
   6. p5 LIFECYCLE
   ========================================================================== */
function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  rectMode(CENTER);
  // Vazirmatn comes from the @font-face in index.html. Using the CSS family
  // (not p5's loadFont) keeps native canvas text rendering, which applies
  // Arabic shaping + bidi correctly; loadFont would draw unshaped glyphs.
  textFont('Vazirmatn');   // single family: p5 quotes the whole string, so a CSS fallback list would be invalid
  document.fonts.load('16px Vazirmatn');       // warm up the font for the canvas
  document.fonts.load('bold 16px Vazirmatn');
  drawingContext.direction = 'rtl';   // correct bidi ordering for Persian text
  buildUI();
  showOnly('menu');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  drawingContext.direction = 'rtl';   // canvas context state after resize
  layoutUI();
}

function draw() {
  background(CONFIG.COLORS.BG);

  switch (state) {
    case STATES.MENU:          drawMenuScreen(); break;
    case STATES.METADATA:      drawMetadataScreen(); break;
    case STATES.INSTRUCTIONS:  drawInstructionsScreen(); break;
    case STATES.ITI:           drawItiScreen(); break;
    case STATES.STIMULUS:      drawStimulusScreen(); break;
    case STATES.LEVEL_SUMMARY: drawSummaryScreen(); break;
    case STATES.END:           drawEndScreen(); break;
  }
}

/* ============================================================================
   7. SCREENS
   ========================================================================== */

/* ---------- DOM construction (built once, shown/hidden per state) --------- */
function buildUI() {
  // Menu buttons
  ui.btnFam = createButton(STRINGS.btnFamiliarization).class('game-btn game-btn-secondary');
  ui.btnFam.mousePressed(() => { familiarizationNotice = STRINGS.familiarizationEmpty; });

  ui.btnAssess = createButton(STRINGS.btnAssessment).class('game-btn');
  ui.btnAssess.mousePressed(() => {
    currentPhase = 'assessment';
    familiarizationNotice = '';
    const stored = loadSessionFromStorage();
    if (stored) {
      // Session Information was entered once at the launcher (main.html) —
      // reuse it and skip this game's own metadata form.
      ui.inPart.value(stored.participantId);
      ui.inSess.value(stored.sessionId);
      ui.inMusic.value(stored.musicCondition);
      onSubmitMetadata();
    } else {
      // Fallback: game opened standalone (not via the launcher) — ask here.
      state = STATES.METADATA;
      showOnly('metadata');
    }
  });

  // Metadata form
  ui.lblPart = createSpan(STRINGS.labelParticipantId).class('game-label');
  ui.inPart = createInput('').class('game-input').attribute('placeholder', STRINGS.placeholderParticipantId);
  ui.lblSess = createSpan(STRINGS.labelSessionId).class('game-label');
  ui.inSess = createInput('').class('game-input').attribute('placeholder', STRINGS.placeholderSessionId);
  ui.lblMusic = createSpan(STRINGS.labelMusicCondition).class('game-label');
  ui.inMusic = createInput('').class('game-input').attribute('placeholder', STRINGS.placeholderMusicCondition);

  ui.btnStartExp = createButton(STRINGS.btnStartExperiment).class('game-btn');
  ui.btnStartExp.mousePressed(onSubmitMetadata);

  // Instructions
  ui.btnStartLevel = createButton(STRINGS.btnStartLevel).class('game-btn');
  ui.btnStartLevel.mousePressed(startLevelFromInstructions);

  // Level summary
  ui.btnContinue = createButton(STRINGS.btnContinue).class('game-btn');
  ui.btnContinue.mousePressed(continueFromSummary);

  // End screen
  ui.btnSave = createButton(STRINGS.btnSaveCsv).class('game-btn');
  ui.btnSave.mousePressed(exportCSV);
  ui.btnReturn = createButton(STRINGS.btnReturnMenu).class('game-btn game-btn-secondary');
  ui.btnReturn.mousePressed(() => {
    // Back to the launcher; warn first if the results were never saved
    if (trialLogs.length && !csvSaved && !confirm(STRINGS.confirmLeaveUnsaved)) return;
    window.location.href = '../../main.html';
  });

  layoutUI();
}

/* Position all DOM elements relative to the current canvas size. */
function layoutUI() {
  const cx = windowWidth / 2, cy = windowHeight / 2;

  ui.btnFam.size(220, 46);       ui.btnFam.position(cx - 110, cy - 46);
  ui.btnAssess.size(220, 46);    ui.btnAssess.position(cx - 110, cy + 10);

  const labelX = cx - 230, inputX = cx - 60, rowH = 46;
  ui.lblPart.position(labelX, cy - 80);   ui.inPart.position(inputX, cy - 86);  ui.inPart.size(220, 22);
  ui.lblSess.position(labelX, cy - 80 + rowH);  ui.inSess.position(inputX, cy - 86 + rowH); ui.inSess.size(220, 22);
  ui.lblMusic.position(labelX, cy - 80 + rowH * 2); ui.inMusic.position(inputX, cy - 86 + rowH * 2); ui.inMusic.size(220, 22);
  ui.btnStartExp.size(160, 42);  ui.btnStartExp.position(cx - 80, cy + 70);

  ui.btnStartLevel.size(180, 46); ui.btnStartLevel.position(cx - 90, cy + 190);
  ui.btnContinue.size(180, 46);   ui.btnContinue.position(cx - 90, cy + 130);

  ui.btnSave.size(220, 46);       ui.btnSave.position(cx - 240, cy + 90);
  ui.btnReturn.size(220, 46);     ui.btnReturn.position(cx + 20, cy + 90);
}

/* Show exactly the DOM group needed by the current screen. */
function showOnly(group) {
  const all = ['btnFam', 'btnAssess', 'lblPart', 'inPart', 'lblSess', 'inSess',
               'lblMusic', 'inMusic', 'btnStartExp', 'btnStartLevel',
               'btnContinue', 'btnSave', 'btnReturn'];
  for (const k of all) ui[k].hide();

  const groups = {
    menu: ['btnFam', 'btnAssess'],
    metadata: ['lblPart', 'inPart', 'lblSess', 'inSess', 'lblMusic', 'inMusic', 'btnStartExp'],
    instructions: ['btnStartLevel'],
    summary: ['btnContinue'],
    end: ['btnSave', 'btnReturn'],
    none: []
  };
  for (const k of (groups[group] || [])) ui[k].show();
}

/* ---------- Canvas rendering per screen ---------- */
function drawMenuScreen() {
  noStroke();
  fill(CONFIG.COLORS.ACCENT);
  textSize(CONFIG.MENU_TITLE_SIZE);
  textStyle(BOLD);
  text(STRINGS.gameTitle, width / 2, height / 2 - 150);

  fill(CONFIG.COLORS.HUD);
  textSize(18);
  textStyle(NORMAL);
  text(STRINGS.gameSubtitle, width / 2, height / 2 - 105);

  if (familiarizationNotice) {
    fill(CONFIG.COLORS.TIMEOUT);
    textSize(16);
    text(familiarizationNotice, width / 2, height / 2 + 90);
  }
}

function drawMetadataScreen() {
  noStroke();
  fill(CONFIG.COLORS.ACCENT);
  textSize(28);
  textStyle(BOLD);
  text(STRINGS.metadataTitle, width / 2, height / 2 - 150);
  textStyle(NORMAL);

  if (metadataErrorMsg) {
    fill(CONFIG.COLORS.INCORRECT);
    textSize(15);
    text(metadataErrorMsg, width / 2, height / 2 + 130);
  }
}

function drawInstructionsScreen() {
  const level = LEVELS[levelIdx];
  noStroke();

  fill(CONFIG.COLORS.ACCENT);
  textSize(30);
  textStyle(BOLD);
  text(`${STRINGS.levelLabel} ${fmtNum(level.id)} ${STRINGS.ofLabel} ${fmtNum(LEVELS.length)}`, width / 2, height / 2 - 200);
  textStyle(NORMAL);

  fill(CONFIG.COLORS.TEXT);
  textSize(CONFIG.INSTRUCTION_TEXT_SIZE);
  text(STRINGS.instructionsCommon, width / 2, height / 2 - 110);

  // Key hints for this level, drawn as a row of badges
  const hints = level.directions.map(d => STRINGS.keyHints[d]);
  const badgeW = 170, badgeH = 52, gap = 20;
  const totalW = hints.length * badgeW + (hints.length - 1) * gap;
  let x = width / 2 - totalW / 2 + badgeW / 2;
  const y = height / 2 + 10;
  for (const h of hints) {
    fill('#FFFFFF');
    stroke('#CED4DA');
    strokeWeight(2);
    rect(x, y, badgeW, badgeH, 12);
    noStroke();
    fill(CONFIG.COLORS.TEXT);
    textSize(20);
    text(h, x, y);
    x += badgeW + gap;
  }

  fill(CONFIG.COLORS.HUD);
  textSize(15);
  text(STRINGS.pressSpaceToStart, width / 2, height / 2 + 250);
}

function drawItiScreen() {
  // Blank ITI screen; the permanent plus stays if configured (Section 1.1).
  if (CONFIG.PLUS_VISIBLE_DURING_ITI) drawPlus();
  drawHUD(false);

  if (nowMs() - itiOnsetMs >= CONFIG.ITI_MS) beginStimulus();
}

function drawStimulusScreen() {
  drawPlus();

  const trial = trialPool[trialIdxLevel];
  drawDirectionWord(trial.word, trial.position);
  drawHUD(true);

  // Timeout when the response window expires
  if (nowMs() - stimulusOnsetMs >= LEVELS[levelIdx].responseWindowMs) {
    recordResponse('timeout');
  }
}

function drawSummaryScreen() {
  noStroke();
  fill(CONFIG.COLORS.ACCENT);
  textSize(32);
  textStyle(BOLD);
  text(fmtTemplate(STRINGS.summaryTitle, { l: fmtNum(LEVELS[levelIdx].id) }), width / 2, height / 2 - 150);
  textStyle(NORMAL);

  drawStatCards(levelStats, height / 2 - 20);
}

function drawEndScreen() {
  noStroke();
  fill(CONFIG.COLORS.ACCENT);
  textSize(34);
  textStyle(BOLD);
  text(STRINGS.endTitle, width / 2, height / 2 - 180);
  textStyle(NORMAL);

  fill(CONFIG.COLORS.TEXT);
  textSize(20);
  text(STRINGS.endThanks, width / 2, height / 2 - 135);

  drawStatCards(totalStats, height / 2 - 40);

  fill(CONFIG.COLORS.TIMEOUT);
  textSize(15);
  text(STRINGS.saveReminder, width / 2, height / 2 + 165);
}

/* Three colored stat cards: correct / incorrect / timeout. */
function drawStatCards(stats, y) {
  const entries = [
    { label: STRINGS.summaryCorrect, value: stats.correct, color: CONFIG.COLORS.CORRECT },
    { label: STRINGS.summaryIncorrect, value: stats.incorrect, color: CONFIG.COLORS.INCORRECT },
    { label: STRINGS.summaryTimeout, value: stats.timeout, color: CONFIG.COLORS.TIMEOUT }
  ];
  const cardW = 170, cardH = 110, gap = 24;
  const totalW = entries.length * cardW + (entries.length - 1) * gap;
  let x = width / 2 - totalW / 2 + cardW / 2;

  for (const e of entries) {
    fill('#FFFFFF');
    stroke('#DEE2E6');
    strokeWeight(2);
    rect(x, y, cardW, cardH, 14);
    noStroke();
    fill(e.color);
    textSize(38);
    textStyle(BOLD);
    text(fmtNum(e.value), x, y - 12);
    textStyle(NORMAL);
    fill(CONFIG.COLORS.HUD);
    textSize(16);
    text(e.label, x, y + 32);
    x += cardW + gap;
  }
}

/* ---------- Stimulus drawing ---------- */
function drawPlus() {
  noStroke();
  fill(CONFIG.COLORS.PLUS);
  textSize(CONFIG.PLUS_SIZE);
  textStyle(BOLD);
  text('+', width / 2, height / 2);
  textStyle(NORMAL);
}

/* The direction word on a solid card. At the center position the card
   covers the plus sign completely (Section 1.1). */
function drawDirectionWord(word, position) {
  const pos = stimulusXY(position);
  const label = STRINGS.words[word];

  textSize(CONFIG.WORD_TEXT_SIZE);
  textStyle(BOLD);
  const w = textWidth(label) + CONFIG.WORD_CARD_PADDING_X * 2;
  const h = CONFIG.WORD_TEXT_SIZE + CONFIG.WORD_CARD_PADDING_Y * 2;

  noStroke();
  fill(CONFIG.COLORS.WORD_CARD);
  rect(pos.x, pos.y, w, h, 12);

  fill(CONFIG.COLORS.WORD);
  text(label, pos.x, pos.y - 2);
  textStyle(NORMAL);
}

/* Screen coordinates for each stimulus position. */
function stimulusXY(position) {
  const cx = width / 2, cy = height / 2;
  switch (position) {
    case 'left':   return { x: cx - CONFIG.STIMULUS_OFFSET_X, y: cy };
    case 'right':  return { x: cx + CONFIG.STIMULUS_OFFSET_X, y: cy };
    case 'up':     return { x: cx, y: cy - CONFIG.STIMULUS_OFFSET_Y };
    case 'down':   return { x: cx, y: cy + CONFIG.STIMULUS_OFFSET_Y };
    case 'center': return { x: cx, y: cy };
  }
}

/* ---------- HUD: trial counter + countdown (Section 0.7) ---------- */
function drawHUD(showCountdown) {
  noStroke();
  fill(CONFIG.COLORS.HUD);
  textSize(CONFIG.HUD_TEXT_SIZE);

  const trialTxt = fmtTemplate(STRINGS.hudTrial, {
    i: fmtNum(trialIdxLevel + 1),
    n: fmtNum(CONFIG.TRIALS_PER_LEVEL)
  });

  let remainingMs = LEVELS[levelIdx].responseWindowMs;
  if (showCountdown) remainingMs = max(0, LEVELS[levelIdx].responseWindowMs - (nowMs() - stimulusOnsetMs));
  const timeTxt = fmtTemplate(STRINGS.hudTime, { t: fmtCountdown(remainingMs) });

  text(`${trialTxt}      ${timeTxt}`, width / 2, CONFIG.HUD_MARGIN_TOP);
}

/* ============================================================================
   8. TRIAL GENERATION — pooling method (Section 1.3)
   Pre-generate exactly 20 congruent + 20 incongruent trials, shuffle once,
   then draw sequentially. Guarantees the exact 50/50 split every level.
   ========================================================================== */
function generateTrialPool(level) {
  const dirs = level.directions;
  const pool = [];

  // Congruent templates: word == position (one per direction), cycle-filled.
  const congruentTemplates = shuffleArray(dirs.map(d => ({ word: d, position: d })));
  for (let i = 0; i < CONFIG.CONGRUENT_TRIALS; i++) {
    const t = congruentTemplates[i % congruentTemplates.length];
    pool.push({ word: t.word, position: t.position, congruency: 'congruent' });
  }

  // Incongruent templates: every ordered pair with word != position, cycle-filled.
  const incongruentTemplates = [];
  for (const w of dirs) for (const p of dirs) if (w !== p) incongruentTemplates.push({ word: w, position: p });
  const shuffledInc = shuffleArray(incongruentTemplates);
  for (let i = 0; i < CONFIG.INCONGRUENT_TRIALS; i++) {
    const t = shuffledInc[i % shuffledInc.length];
    pool.push({ word: t.word, position: t.position, congruency: 'incongruent' });
  }

  return shuffleArray(pool);
}

/* ============================================================================
   9. TRIAL FLOW
   ========================================================================== */
/* Read Session Information stored once by the launcher (main.html) under
   'cogGamesSession'. Returns {participantId, sessionId, musicCondition} when all
   three are present, else null so the game falls back to its own metadata form
   when opened standalone. */
function loadSessionFromStorage() {
  try {
    const s = JSON.parse(localStorage.getItem('cogGamesSession'));
    if (s && s.participantId && s.sessionId && s.musicCondition) return s;
  } catch (e) {}
  return null;
}

function onSubmitMetadata() {
  const p = ui.inPart.value().trim();
  const s = ui.inSess.value().trim();
  const m = ui.inMusic.value().trim();
  if (!p || !s || !m) { metadataErrorMsg = STRINGS.metadataError; return; }

  metaData = { participantId: p, sessionId: s, musicCondition: m };
  metadataErrorMsg = '';
  releaseFocus();

  // Session starts now
  sessionStartUtc = new Date().toISOString();
  sessionStartMonotonic = performance.now();
  trialLogs = [];
  csvSaved = false;
  totalStats = { correct: 0, incorrect: 0, timeout: 0 };
  levelIdx = 0;
  trialIdxGlobal = 0;

  enterInstructions();
}

function enterInstructions() {
  trialPool = generateTrialPool(LEVELS[levelIdx]);
  trialIdxLevel = 0;
  levelStats = { correct: 0, incorrect: 0, timeout: 0 };
  state = STATES.INSTRUCTIONS;
  showOnly('instructions');
}

function startLevelFromInstructions() {
  releaseFocus();
  showOnly('none');
  beginIti();
}

function beginIti() {
  itiOnsetMs = nowMs();
  responded = false;
  state = STATES.ITI;
}

function beginStimulus() {
  stimulusOnsetMs = nowMs();
  trialStartSessionMs = stimulusOnsetMs;   // Simon: trial onset == stimulus onset
  state = STATES.STIMULUS;
}

/* Common exit point for every trial: 'timeout' or a direction meaning. */
function recordResponse(responseMeaning) {
  if (responded) return;
  responded = true;

  const trial = trialPool[trialIdxLevel];
  const windowMs = LEVELS[levelIdx].responseWindowMs;
  const isTimeout = responseMeaning === 'timeout';

  // responseMs: raw timer value at response moment, or window end on timeout (Section 0.10)
  const responseMs = isTimeout ? windowMs : Math.round(nowMs() - stimulusOnsetMs);
  const reactionTime = responseMs;         // Simon: reactionTime = responseMs

  let result;
  if (isTimeout) result = 0;
  else result = (responseMeaning === trial.word) ? 1 : -1;

  if (result === 1) { levelStats.correct++; totalStats.correct++; }
  else if (result === -1) { levelStats.incorrect++; totalStats.incorrect++; }
  else { levelStats.timeout++; totalStats.timeout++; }

  trialLogs.push({
    // --- Common per-trial fields (Section 0.10) ---
    level: LEVELS[levelIdx].id,
    trialIndexGlobal: trialIdxGlobal + 1,
    trialIndexLevel: trialIdxLevel + 1,
    trialStartMsFromSessionStart: Math.round(trialStartSessionMs),
    response: responseMeaning,
    correctResponse: trial.word,
    result: result,
    responseMs: responseMs,
    reactionTime: reactionTime,
    anticipatoryResponse: (!isTimeout && reactionTime < CONFIG.ANTICIPATORY_THRESHOLD_MS) ? 1 : 0,
    // --- Simon-specific fields (Section 1.6) ---
    stimulusPosition: trial.position,
    congruency: trial.congruency
  });

  advanceTrial();
}

function advanceTrial() {
  trialIdxLevel++;
  trialIdxGlobal++;

  if (trialIdxLevel >= trialPool.length) {
    state = STATES.LEVEL_SUMMARY;
    showOnly('summary');
  } else {
    beginIti();
  }
}

function continueFromSummary() {
  releaseFocus();
  levelIdx++;
  if (levelIdx >= LEVELS.length) {
    state = STATES.END;
    showOnly('end');
  } else {
    enterInstructions();
  }
}

/* ============================================================================
   10. INPUT HANDLERS
   ========================================================================== */
function keyPressed() {
  // SPACE advances instruction / summary screens
  if (key === ' ') {
    if (state === STATES.INSTRUCTIONS) { startLevelFromInstructions(); return; }
    if (state === STATES.LEVEL_SUMMARY) { continueFromSummary(); return; }
  }

  if (state !== STATES.STIMULUS || responded) return;

  // Map the pressed arrow key to its meaning at the current level
  const keyMap = LEVELS[levelIdx].keyMap;
  let meaning = null;
  if (keyCode === LEFT_ARROW && keyMap.LEFT) meaning = keyMap.LEFT;
  else if (keyCode === RIGHT_ARROW && keyMap.RIGHT) meaning = keyMap.RIGHT;
  else if (keyCode === UP_ARROW && keyMap.UP) meaning = keyMap.UP;
  else if (keyCode === DOWN_ARROW && keyMap.DOWN) meaning = keyMap.DOWN;

  if (meaning !== null) recordResponse(meaning);
  // Any other key is ignored (not part of the active response set)
}

/* ============================================================================
   11. LOGGING & CSV EXPORT
   ========================================================================== */
function exportCSV() {
  if (!trialLogs.length) return;

  const sessionDurationMs = Math.round(nowMs());

  // Session metadata header block (Section 0.10 + Star Search note on display info)
  const metaRows = [
    ['participantID', metaData.participantId],
    ['sessionID', metaData.sessionId],
    ['musicCondition', metaData.musicCondition],
    ['game', CONFIG.GAME_NAME],
    ['inputDevice', CONFIG.INPUT_DEVICE],
    ['phase', currentPhase],
    ['sessionStartUTC', sessionStartUtc],
    ['sessionDurationMs', sessionDurationMs],
    ['windowWidth', windowWidth],
    ['windowHeight', windowHeight],
    ['devicePixelRatio', window.devicePixelRatio],
    ['responseWindowsMs', CONFIG.RESPONSE_WINDOW_MS.join('/')],
    ['itiMs', CONFIG.ITI_MS],
    ['trialsPerLevel', CONFIG.TRIALS_PER_LEVEL]
  ];

  let rows = [];
  rows.push(['SESSION METADATA']);
  rows = rows.concat(metaRows);
  rows.push([]);
  rows.push(['TRIAL DATA']);

  const headers = Object.keys(trialLogs[0]);
  rows.push(headers);
  for (const log of trialLogs) rows.push(headers.map(h => log[h]));

  const csvText = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  saveFileToDisk(csvText, `${metaData.participantId}_${metaData.sessionId}_${CONFIG.GAME_NAME}.csv`, 'text/csv');
  csvSaved = true;
}

/* ============================================================================
   12. HELPERS
   ========================================================================== */

/* Milliseconds elapsed since assessment start (monotonic clock). */
function nowMs() {
  return performance.now() - sessionStartMonotonic;
}

/* Fisher-Yates shuffle (returns a new array). */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Number formatting hook — the Persian version converts digits here. */
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function fmtNum(n) {
  return String(n).replace(/[0-9]/g, d => PERSIAN_DIGITS[+d]);
}

/* Countdown as m:ss (ceiling of remaining seconds), e.g. 0:07. */
function fmtCountdown(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${fmtNum(m)}:${fmtNum(s < 10 ? '0' + s : s)}`;
}

/* Tiny template substitution: fmtTemplate('T {i}/{n}', {i:1, n:40}). */
function fmtTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

/* Drop keyboard focus from DOM inputs so arrow keys reach the canvas. */
function releaseFocus() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

/* CSV cell escaping. */
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/* Trigger a browser download.
   NOTE: must NOT be named downloadFile — p5.js has a global of that name
   and overwrites same-named sketch functions when it initializes. */
function saveFileToDisk(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke AFTER the download has started: revoking immediately can make the
  // browser report "File wasn't available on site" instead of saving.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}