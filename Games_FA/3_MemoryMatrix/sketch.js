/* ============================================================================
   MEMORY MATRIX — Assessment Phase (Persian version)
   Project : Evaluation of Unconscious Effect of Music on Cognitive Functions
   Spec    : CogGames_Documentation.docx — Section 3 (+ Section 0 common spec)

   Cognitive function: Visuospatial working memory, pattern encoding & recall.

   A grid appears with some cells highlighted (targets). After a blank
   retention interval the participant clicks all previously highlighted cells
   on an empty grid, then presses Done. Perfect recall (all targets, no
   false alarms) is required for result = 1.

   Trial phases:  ITI (150 ms) → STIMULUS (1500 ms) → RETENTION (1000 ms)
                  → RECALL (response window) → log

   Mouse handling:
   - The cursor is hidden during STIMULUS and RETENTION.
   - At RECALL onset the cursor reappears at screen center. Browsers cannot
     move the real pointer, so this uses the Pointer Lock API with a virtual
     cursor (CONFIG.USE_POINTER_LOCK). If pointer lock is unavailable or
     lost, the game falls back to the real mouse position transparently.
   - Mouse trajectory is sampled every 100 ms into a separate CSV
     (Section 0.9).

   File layout:
     1. CONFIG            — every tunable parameter
     2. STRINGS           — every user-visible text (translate here only)
     3. LEVELS            — grid size, targets per stage, response windows
     4. STATES            — state machine constants
     5. RUNTIME STATE     — mutable session/trial variables
     6. p5 LIFECYCLE      — setup / draw / windowResized
     7. SCREENS           — menu, metadata, instructions, summary, end
     8. TRIAL GENERATION  — 40 trials/level over 3 stages (13/14/13)
     9. TRIAL FLOW        — phase transitions and trial completion
    10. INPUT HANDLERS    — virtual-cursor clicks, cell selection, Done
    11. LOGGING & EXPORT  — trial CSV + separate mouse trajectory CSV
    12. HELPERS           — shuffle, formatting, cursor, DOM utilities
   ========================================================================== */

/* ============================================================================
   1. CONFIG — all tunable parameters
   ========================================================================== */
const CONFIG = {
  GAME_NAME: 'memoryMatrix',           // short camelCase id used in logs/filenames
  INPUT_DEVICE: 'mouse',                // reported in session metadata (Section 0.10)

  // --- Trial structure (Sections 0.3 / 3.2) ---
  TRIALS_PER_STAGE: [7, 6, 7],         // stages 1..3 — totals 20 per level (pilot: 40 made the game far too long)

  // --- Timing (Sections 0.5 / 0.6 / 3.5) ---
  ITI_MS: 150,                         // blank inter-trial interval
  STIMULUS_MS: 2000,                   // grid + highlighted targets
  RETENTION_MS: 1000,                  // blank retention interval
  RESPONSE_WINDOW_MS: [7000, 7000, 7000], // flat recall window — memory load is the only difficulty axis; 6 s leaves motor slack even at 10 targets
  ANTICIPATORY_THRESHOLD_MS: 150,      // RT below this => anticipatoryResponse = 1

  // --- Mouse handling (Sections 0.9 / 3.3 / 3.4) ---
  USE_POINTER_LOCK: true,              // virtual cursor recentered at recall onset
  TRAJECTORY_SAMPLE_MS: 100,           // trajectory sampling period
  CURSOR_SIZE: 16,                     // drawn virtual cursor size (px)

  // --- Grid geometry ---
  MAX_CELL_PX: 90,                     // upper bound for cell size
  GRID_CANVAS_FRACTION: 0.55,          // grid fits within this fraction of the shorter screen side
  CELL_CORNER_RADIUS: 6,

  // --- Grid colors ---
  GRID: {
    LINE: '#ADB5BD',                   // cell borders
    EMPTY: '#FFFFFF',                  // empty cell fill
    TARGET: '#1971C2',                 // highlighted target during stimulus
    SELECTED: '#1971C2'                // participant-selected cell during recall
  },

  // --- Done button (canvas-drawn: DOM buttons don't work under pointer lock) ---
  DONE_BTN_W: 160,
  DONE_BTN_H: 48,
  DONE_BTN_MARGIN: 40,                 // gap below the grid

  // --- HUD (Section 0.7) ---
  HUD_TEXT_SIZE: 18,
  HUD_MARGIN_TOP: 28,

  // --- Colors (visual theme) ---
  COLORS: {
    BG: '#F4F6F8',
    TEXT: '#212529',
    ACCENT: '#3B5BDB',
    HUD: '#37474F',
    CURSOR: '#212529',
    DONE_BG: '#3B5BDB',
    DONE_TEXT: '#FFFFFF',
    CORRECT: '#2F9E44',
    INCORRECT: '#E03131',
    TIMEOUT: '#F08C00'
  },

  // --- Misc ---
  MENU_TITLE_SIZE: 42,
  INSTRUCTION_TEXT_SIZE: 22
};

/* ============================================================================
   2. STRINGS — every user-visible text lives here (single translation point)
   ========================================================================== */
const STRINGS = {
  gameTitle: 'ماتریس حافظه',
  gameSubtitle: 'خانه‌های روشن را به خاطر بسپارید و سپس روی آن‌ها کلیک کنید',

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

  levelLabel: 'مرحله',
  ofLabel: 'از',
  instructionsCommon:
    'شبکه‌ای با چند خانهٔ روشن برای چند لحظه‌ نمایش داده می‌شود.\n' +
    'آن‌ها را به خاطر بسپارید. پس از یک مکث کوتاه، شبکهٔ خالی برمی‌گردد:\n' +
    'روی همهٔ خانه‌هایی که روشن بودند کلیک کنید و سپس دکمهٔ «پایان» را بزنید.\n' +
    'کلیک‌ها قابل لغو نیستند، پس با دقت انتخاب کنید.',
  gridInfo: 'شبکه: {g} × {g}',
  btnStartLevel: 'شروع مرحله',
  pressSpaceToStart: '(یا کلید فاصله را فشار دهید)',

  // Trial UI
  btnDone: 'پایان',

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
  btnSaveTrajectory: 'ذخیره داده ماوس (CSV)',
  btnReturnMenu: 'منوی اصلی',
  confirmLeaveUnsaved: 'نتایج هنوز ذخیره نشده‌اند. با این حال خارج می‌شوید؟',
  saveReminder: 'لطفاً پیش از بستن این پنجره هر دو فایل را ذخیره کنید.'
};

/* ============================================================================
   3. LEVELS — level definitions (Section 3.2)
   targetsPerStage[i] = number of highlighted cells during stage i+1.
   ========================================================================== */
/* Target counts recalibrated after piloting: the original 5-7 / 8-10 / 11-13
   yielded ~60% accuracy at L1 (target: 90-100%). Perfect recall is required,
   so counts sit just below / at / above typical visuospatial span (~4-5). */
const LEVELS = [
  { id: 1, gridSize: 4, targetsPerStage: [4, 5, 6],    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[0] },
  { id: 2, gridSize: 5, targetsPerStage: [6, 7, 8],    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[1] },
  { id: 3, gridSize: 6, targetsPerStage: [8, 9, 10],   responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[2] }
];

/* ============================================================================
   4. STATES — state machine constants
   ========================================================================== */
const STATES = {
  MENU: 'menu',
  METADATA: 'metadata',
  INSTRUCTIONS: 'instructions',
  ITI: 'iti',
  STIMULUS: 'stimulus',        // grid + targets shown (cursor hidden)
  RETENTION: 'retention',      // blank screen (cursor hidden)
  RECALL: 'recall',            // empty grid, clicks accepted, Done button
  LEVEL_SUMMARY: 'level_summary',
  END: 'end'
};

/* ============================================================================
   5. RUNTIME STATE — mutable session / trial variables
   ========================================================================== */
let state = STATES.MENU;

// Session metadata
let metaData = { participantId: '', sessionId: '', musicCondition: '' };
let currentPhase = null;
let sessionStartUtc = null;
let sessionStartMonotonic = 0;

// Level / trial bookkeeping
let levelIdx = 0;
let trialPool = [];
let trialIdxLevel = 0;
let trialIdxGlobal = 0;
let levelStats = { correct: 0, incorrect: 0, timeout: 0 };
let totalStats = { correct: 0, incorrect: 0, timeout: 0 };

// Per-trial timing (session-relative ms)
let itiOnsetMs = 0;
let trialStartSessionMs = 0;         // = stimulus phase onset (trial timer zero)
let recallOnsetMs = 0;
let trialEnded = false;

// Per-trial response data
let selectedCells = [];              // "col,row" keys selected during recall
let clickTimes = [];                 // ms from recall onset, per accepted cell click
let outOfBoundsClicks = 0;

// Grid geometry for the current trial (logged per Section 3.6)
let gridOriginX = 0, gridOriginY = 0, cellSizePx = 0;

// Virtual cursor (pointer lock)
let vCursorX = 0, vCursorY = 0;
let lockActiveAtRecall = 0;          // was pointer lock actually engaged when recall began?

// Mouse trajectory (separate CSV per Section 0.9)
let trajectoryLogs = [];
let lastTrajectorySampleMs = -Infinity;

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
  updateVirtualCursor();
  sampleTrajectory();

  switch (state) {
    case STATES.MENU:          drawMenuScreen(); break;
    case STATES.METADATA:      drawMetadataScreen(); break;
    case STATES.INSTRUCTIONS:  drawInstructionsScreen(); break;
    case STATES.ITI:           drawItiScreen(); break;
    case STATES.STIMULUS:      drawStimulusScreen(); break;
    case STATES.RETENTION:     drawRetentionScreen(); break;
    case STATES.RECALL:        drawRecallScreen(); break;
    case STATES.LEVEL_SUMMARY: drawSummaryScreen(); break;
    case STATES.END:           drawEndScreen(); break;
  }
}

/* ============================================================================
   7. SCREENS
   ========================================================================== */

/* ---------- DOM construction ---------- */
function buildUI() {
  ui.btnFam = createButton(STRINGS.btnFamiliarization).class('game-btn game-btn-secondary');
  ui.btnFam.mousePressed(() => { familiarizationNotice = STRINGS.familiarizationEmpty; });

  ui.btnAssess = createButton(STRINGS.btnAssessment).class('game-btn');
  ui.btnAssess.mousePressed(() => {
    currentPhase = 'assessment';
    familiarizationNotice = '';
    state = STATES.METADATA;
    showOnly('metadata');
  });

  ui.lblPart = createSpan(STRINGS.labelParticipantId).class('game-label');
  ui.inPart = createInput('').class('game-input').attribute('placeholder', STRINGS.placeholderParticipantId);
  ui.lblSess = createSpan(STRINGS.labelSessionId).class('game-label');
  ui.inSess = createInput('').class('game-input').attribute('placeholder', STRINGS.placeholderSessionId);
  ui.lblMusic = createSpan(STRINGS.labelMusicCondition).class('game-label');
  ui.inMusic = createInput('').class('game-input').attribute('placeholder', STRINGS.placeholderMusicCondition);

  ui.btnStartExp = createButton(STRINGS.btnStartExperiment).class('game-btn');
  ui.btnStartExp.mousePressed(onSubmitMetadata);

  ui.btnStartLevel = createButton(STRINGS.btnStartLevel).class('game-btn');
  ui.btnStartLevel.mousePressed(startLevelFromInstructions);

  ui.btnContinue = createButton(STRINGS.btnContinue).class('game-btn');
  ui.btnContinue.mousePressed(continueFromSummary);

  ui.btnSave = createButton(STRINGS.btnSaveCsv).class('game-btn');
  ui.btnSave.mousePressed(exportCSV);
  ui.btnSaveTraj = createButton(STRINGS.btnSaveTrajectory).class('game-btn');
  ui.btnSaveTraj.mousePressed(exportTrajectoryCSV);
  ui.btnReturn = createButton(STRINGS.btnReturnMenu).class('game-btn game-btn-secondary');
  ui.btnReturn.mousePressed(() => {
    // Back to the launcher; warn first if the results were never saved
    if (trialLogs.length && !csvSaved && !confirm(STRINGS.confirmLeaveUnsaved)) return;
    window.location.href = '../../main.html';
  });

  layoutUI();
}

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

  ui.btnSave.size(220, 46);       ui.btnSave.position(cx - 350, cy + 90);
  ui.btnSaveTraj.size(220, 46);   ui.btnSaveTraj.position(cx - 110, cy + 90);
  ui.btnReturn.size(220, 46);     ui.btnReturn.position(cx + 130, cy + 90);
}

function showOnly(group) {
  const all = ['btnFam', 'btnAssess', 'lblPart', 'inPart', 'lblSess', 'inSess',
               'lblMusic', 'inMusic', 'btnStartExp', 'btnStartLevel',
               'btnContinue', 'btnSave', 'btnSaveTraj', 'btnReturn'];
  for (const k of all) ui[k].hide();

  const groups = {
    menu: ['btnFam', 'btnAssess'],
    metadata: ['lblPart', 'inPart', 'lblSess', 'inSess', 'lblMusic', 'inMusic', 'btnStartExp'],
    instructions: ['btnStartLevel'],
    summary: ['btnContinue'],
    end: ['btnSave', 'btnSaveTraj', 'btnReturn'],
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
  text(STRINGS.instructionsCommon, width / 2, height / 2 - 80);

  fill(CONFIG.COLORS.HUD);
  textSize(20);
  text(fmtTemplate(STRINGS.gridInfo, { g: fmtNum(level.gridSize) }), width / 2, height / 2 + 40);

  textSize(15);
  text(STRINGS.pressSpaceToStart, width / 2, height / 2 + 250);
}

function drawItiScreen() {
  drawHUD(false);
  if (nowMs() - itiOnsetMs >= CONFIG.ITI_MS) beginStimulusPhase();
}

function drawStimulusScreen() {
  const trial = trialPool[trialIdxLevel];
  drawGrid(trial, true, false);
  drawHUD(false);

  if (nowMs() - trialStartSessionMs >= CONFIG.STIMULUS_MS) {
    state = STATES.RETENTION;
  }
}

function drawRetentionScreen() {
  // Fully blank retention interval — grid cleared, cursor still hidden
  drawHUD(false);

  if (nowMs() - trialStartSessionMs >= CONFIG.STIMULUS_MS + CONFIG.RETENTION_MS) {
    beginRecallPhase();
  }
}

function drawRecallScreen() {
  const trial = trialPool[trialIdxLevel];
  drawGrid(trial, false, true);
  drawDoneButton();
  drawHUD(true);
  drawVirtualCursor();

  // Response window expiry => timeout
  if (nowMs() - recallOnsetMs >= LEVELS[levelIdx].responseWindowMs) {
    finishTrial('timeout');
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

/* ---------- Grid rendering ----------
   showTargets: highlight target cells (stimulus phase)
   showSelections: highlight participant-selected cells (recall phase) */
function drawGrid(trial, showTargets, showSelections) {
  computeGridGeometry(trial.gridSize);
  const n = trial.gridSize;

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const key = `${col},${row}`;
      let fillColor = CONFIG.GRID.EMPTY;
      if (showTargets && trial.targetSet.has(key)) fillColor = CONFIG.GRID.TARGET;
      if (showSelections && selectedCells.includes(key)) fillColor = CONFIG.GRID.SELECTED;

      const cx = gridOriginX + col * cellSizePx + cellSizePx / 2;
      const cy = gridOriginY + row * cellSizePx + cellSizePx / 2;
      stroke(CONFIG.GRID.LINE);
      strokeWeight(2);
      fill(fillColor);
      rect(cx, cy, cellSizePx - 4, cellSizePx - 4, CONFIG.CELL_CORNER_RADIUS);
    }
  }
}

/* Grid geometry: centered, adaptive cell size (logged per trial). */
function computeGridGeometry(n) {
  const available = Math.min(width, height) * CONFIG.GRID_CANVAS_FRACTION;
  cellSizePx = Math.min(CONFIG.MAX_CELL_PX, Math.floor(available / n));
  const gridW = cellSizePx * n;
  gridOriginX = Math.round(width / 2 - gridW / 2);
  gridOriginY = Math.round(height / 2 - gridW / 2);
}

/* Done button drawn on canvas (usable under pointer lock). */
function doneButtonRect() {
  const n = trialPool[trialIdxLevel].gridSize;
  const gridBottom = gridOriginY + cellSizePx * n;
  return {
    x: width / 2,
    y: gridBottom + CONFIG.DONE_BTN_MARGIN + CONFIG.DONE_BTN_H / 2,
    w: CONFIG.DONE_BTN_W,
    h: CONFIG.DONE_BTN_H
  };
}

function drawDoneButton() {
  const r = doneButtonRect();
  noStroke();
  fill(CONFIG.COLORS.DONE_BG);
  rect(r.x, r.y, r.w, r.h, 12);
  fill(CONFIG.COLORS.DONE_TEXT);
  textSize(20);
  textStyle(BOLD);
  text(STRINGS.btnDone, r.x, r.y - 1);
  textStyle(NORMAL);
}

/* ---------- HUD (Section 0.7): countdown only during recall ---------- */
function drawHUD(showCountdown) {
  noStroke();
  fill(CONFIG.COLORS.HUD);
  textSize(CONFIG.HUD_TEXT_SIZE);

  const trialTxt = fmtTemplate(STRINGS.hudTrial, {
    i: fmtNum(trialIdxLevel + 1),
    n: fmtNum(trialsPerLevel())
  });

  let remainingMs = LEVELS[levelIdx].responseWindowMs;
  if (showCountdown) remainingMs = max(0, LEVELS[levelIdx].responseWindowMs - (nowMs() - recallOnsetMs));
  const timeTxt = fmtTemplate(STRINGS.hudTime, { t: fmtCountdown(remainingMs) });

  text(`${trialTxt}      ${timeTxt}`, width / 2, CONFIG.HUD_MARGIN_TOP);
}

/* ============================================================================
   8. TRIAL GENERATION (Section 3.2)
   40 trials per level across 3 stages (13 / 14 / 13). Target count depends
   on the stage; target cells are drawn uniformly without replacement.
   ========================================================================== */
function generateTrialPool(level) {
  const pool = [];
  for (let stage = 0; stage < CONFIG.TRIALS_PER_STAGE.length; stage++) {
    const nTargets = level.targetsPerStage[stage];
    for (let i = 0; i < CONFIG.TRIALS_PER_STAGE[stage]; i++) {
      pool.push({
        stage: stage + 1,
        gridSize: level.gridSize,
        nTargets: nTargets,
        targetSet: randomTargetSet(level.gridSize, nTargets)
      });
    }
  }
  return pool;   // sequential: stage 1 trials, then stage 2, then stage 3
}

/* Pick nTargets distinct cells uniformly from an n×n grid. */
function randomTargetSet(n, nTargets) {
  const cells = [];
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++)
      cells.push(`${col},${row}`);
  return new Set(shuffleArray(cells).slice(0, nTargets));
}

function trialsPerLevel() {
  return CONFIG.TRIALS_PER_STAGE.reduce((a, b) => a + b, 0);
}

/* ============================================================================
   9. TRIAL FLOW
   ========================================================================== */
function onSubmitMetadata() {
  const p = ui.inPart.value().trim();
  const s = ui.inSess.value().trim();
  const m = ui.inMusic.value().trim();
  if (!p || !s || !m) { metadataErrorMsg = STRINGS.metadataError; return; }

  metaData = { participantId: p, sessionId: s, musicCondition: m };
  metadataErrorMsg = '';
  releaseFocus();

  sessionStartUtc = new Date().toISOString();
  sessionStartMonotonic = performance.now();
  trialLogs = [];
  csvSaved = false;
  trajectoryLogs = [];
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
  // Pointer lock needs a user gesture — the Start click / SPACE press is one.
  if (CONFIG.USE_POINTER_LOCK) requestPointerLock();
  beginIti();
}

function beginIti() {
  itiOnsetMs = nowMs();
  trialEnded = false;
  selectedCells = [];
  clickTimes = [];
  outOfBoundsClicks = 0;
  noCursor();                          // hidden until recall onset (Section 3.4)
  state = STATES.ITI;
}

function beginStimulusPhase() {
  trialStartSessionMs = nowMs();       // trial timer zero = stimulus onset
  computeGridGeometry(trialPool[trialIdxLevel].gridSize);
  state = STATES.STIMULUS;
}

function beginRecallPhase() {
  recallOnsetMs = nowMs();
  lockActiveAtRecall = pointerLockActive() ? 1 : 0;
  // Cursor reappears at screen center (virtual cursor recentering)
  vCursorX = width / 2;
  vCursorY = height / 2;
  if (!pointerLockActive()) cursor();  // fallback: show the real cursor
  state = STATES.RECALL;
}

/* Ends the trial. response: 'done' | 'timeout' (Section 3.7). */
function finishTrial(response) {
  if (trialEnded) return;
  trialEnded = true;

  const trial = trialPool[trialIdxLevel];
  const level = LEVELS[levelIdx];
  const windowMs = level.responseWindowMs;
  const preRecallMs = CONFIG.STIMULUS_MS + CONFIG.RETENTION_MS;   // 2500 ms
  const isTimeout = response === 'timeout';

  // responseMs runs from trial start; recall begins at preRecallMs (Section 3.5)
  const responseMs = isTimeout
    ? preRecallMs + windowMs
    : Math.round(nowMs() - trialStartSessionMs);
  const reactionTime = responseMs - preRecallMs;

  // Score the selections
  const targetSet = trial.targetSet;
  let nHits = 0, nFalseAlarms = 0;
  for (const key of selectedCells) {
    if (targetSet.has(key)) nHits++;
    else nFalseAlarms++;
  }
  const nMisses = trial.nTargets - nHits;

  // result: perfect recall required (Section 3.4); timeout => 0
  let result;
  if (isTimeout) result = 0;
  else result = (nHits === trial.nTargets && nFalseAlarms === 0) ? 1 : -1;

  if (result === 1) { levelStats.correct++; totalStats.correct++; }
  else if (result === -1) { levelStats.incorrect++; totalStats.incorrect++; }
  else { levelStats.timeout++; totalStats.timeout++; }

  // Final trajectory snapshot at trial end (Section 0.9)
  logTrajectoryPoint(true);

  trialLogs.push({
    // --- Common per-trial fields (Section 0.10) ---
    level: level.id,
    trialIndexGlobal: trialIdxGlobal + 1,
    trialIndexLevel: trialIdxLevel + 1,
    trialStartMsFromSessionStart: Math.round(trialStartSessionMs),
    response: response,
    correctResponse: 'done',
    result: result,
    responseMs: responseMs,
    reactionTime: reactionTime,
    anticipatoryResponse: (!isTimeout && reactionTime < CONFIG.ANTICIPATORY_THRESHOLD_MS) ? 1 : 0,
    // --- Memory Matrix-specific fields (Section 3.7) ---
    stage: trial.stage,
    gridSize: trial.gridSize,
    nTargets: trial.nTargets,
    targetCells: [...targetSet].join(';'),
    clickedCells: selectedCells.join(';'),
    nHits: nHits,
    nMisses: nMisses,
    nFalseAlarms: nFalseAlarms,
    score: trial.nTargets > 0 ? +(nHits / trial.nTargets).toFixed(3) : 0,
    clickTimesMs: clickTimes.join(';'),
    outOfBoundsClickCount: outOfBoundsClicks,
    gridOriginX: gridOriginX,
    gridOriginY: gridOriginY,
    cellSizePx: cellSizePx,
    pointerLockActive: lockActiveAtRecall
  });

  advanceTrial();
}

function advanceTrial() {
  trialIdxLevel++;
  trialIdxGlobal++;

  if (trialIdxLevel >= trialPool.length) {
    // DOM buttons need the real cursor — leave pointer lock at the summary
    if (pointerLockActive()) exitPointerLock();
    cursor();
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
  if (key === ' ') {
    if (state === STATES.INSTRUCTIONS) { startLevelFromInstructions(); return; }
    if (state === STATES.LEVEL_SUMMARY) { continueFromSummary(); return; }
  }
}

function mousePressed() {
  if (state !== STATES.RECALL || trialEnded) return;

  // Re-acquire pointer lock if it was lost mid-level (Esc etc.)
  if (CONFIG.USE_POINTER_LOCK && !pointerLockActive()) requestPointerLock();

  // Without pointer lock the virtual cursor mirrors the real one; sync it to
  // this click's exact position (draw() only syncs once per frame).
  if (!pointerLockActive()) { vCursorX = mouseX; vCursorY = mouseY; }

  const px = cursorX(), py = cursorY();

  // Done button?
  const r = doneButtonRect();
  if (Math.abs(px - r.x) <= r.w / 2 && Math.abs(py - r.y) <= r.h / 2) {
    finishTrial('done');
    return;
  }

  // Cell?
  const trial = trialPool[trialIdxLevel];
  const n = trial.gridSize;
  const col = Math.floor((px - gridOriginX) / cellSizePx);
  const row = Math.floor((py - gridOriginY) / cellSizePx);

  if (col >= 0 && col < n && row >= 0 && row < n) {
    const key = `${col},${row}`;
    // No correction rule: a cell can be selected once, never de-selected
    if (!selectedCells.includes(key)) {
      selectedCells.push(key);
      clickTimes.push(Math.round(nowMs() - recallOnsetMs));
    }
  } else {
    outOfBoundsClicks++;               // click outside the grid entirely
  }
}

/* ============================================================================
   11. LOGGING & EXPORT — trial CSV + separate mouse trajectory CSV
   ========================================================================== */
function exportCSV() {
  if (!trialLogs.length) return;

  const sessionDurationMs = Math.round(nowMs());

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
    ['stimulusMs', CONFIG.STIMULUS_MS],
    ['retentionMs', CONFIG.RETENTION_MS],
    ['trialsPerLevel', trialsPerLevel()],
    ['pointerLockUsed', CONFIG.USE_POINTER_LOCK ? 1 : 0]
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

/* Separate trajectory file (Section 0.9):
   trialIndexGlobal, timestampMs (session-relative), mouseX, mouseY. */
function exportTrajectoryCSV() {
  if (!trajectoryLogs.length) return;

  const headers = ['trialIndexGlobal', 'timestampMs', 'mouseX', 'mouseY'];
  let rows = [headers];
  for (const p of trajectoryLogs) rows.push(headers.map(h => p[h]));

  const csvText = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  saveFileToDisk(csvText,
    `${metaData.participantId}_${metaData.sessionId}_${CONFIG.GAME_NAME}_mouseTrajectory.csv`,
    'text/csv');
}

/* Sample the cursor every TRAJECTORY_SAMPLE_MS while a trial is running. */
function sampleTrajectory() {
  const inTrial = state === STATES.STIMULUS || state === STATES.RETENTION || state === STATES.RECALL;
  if (!inTrial) return;
  const t = nowMs();
  if (t - lastTrajectorySampleMs >= CONFIG.TRAJECTORY_SAMPLE_MS) {
    lastTrajectorySampleMs = t;
    logTrajectoryPoint(false);
  }
}

function logTrajectoryPoint(/* isFinalSnapshot */) {
  trajectoryLogs.push({
    trialIndexGlobal: trialIdxGlobal + 1,
    timestampMs: Math.round(nowMs()),
    mouseX: Math.round(cursorX()),
    mouseY: Math.round(cursorY())
  });
}

/* ============================================================================
   12. HELPERS
   ========================================================================== */
function nowMs() {
  return performance.now() - sessionStartMonotonic;
}

/* ---------- Virtual cursor (Pointer Lock) ---------- */
function pointerLockActive() {
  return document.pointerLockElement !== null && document.pointerLockElement !== undefined;
}

/* Accumulate relative mouse movement into the virtual cursor while locked.
   Some browsers deliver an undefined movementX/Y on the first locked event;
   one NaN would otherwise poison the position (NaN + x = NaN) until unlock —
   observed in pilot trajectory data as runs of "NaN,NaN" samples. */
function updateVirtualCursor() {
  if (pointerLockActive()) {
    const dx = Number.isFinite(movedX) ? movedX : 0;
    const dy = Number.isFinite(movedY) ? movedY : 0;
    vCursorX = constrain(vCursorX + dx, 0, width);
    vCursorY = constrain(vCursorY + dy, 0, height);
    if (!Number.isFinite(vCursorX)) vCursorX = width / 2;   // recover if ever poisoned
    if (!Number.isFinite(vCursorY)) vCursorY = height / 2;
  } else {
    vCursorX = mouseX;
    vCursorY = mouseY;
  }
}

/* Effective cursor position: virtual when locked, real otherwise. */
function cursorX() { return vCursorX; }
function cursorY() { return vCursorY; }

/* Draw the virtual cursor during recall (the OS cursor is hidden/locked). */
function drawVirtualCursor() {
  push();
  stroke('#FFFFFF');
  strokeWeight(4);
  line(vCursorX - CONFIG.CURSOR_SIZE / 2, vCursorY, vCursorX + CONFIG.CURSOR_SIZE / 2, vCursorY);
  line(vCursorX, vCursorY - CONFIG.CURSOR_SIZE / 2, vCursorX, vCursorY + CONFIG.CURSOR_SIZE / 2);
  stroke(CONFIG.COLORS.CURSOR);
  strokeWeight(2);
  line(vCursorX - CONFIG.CURSOR_SIZE / 2, vCursorY, vCursorX + CONFIG.CURSOR_SIZE / 2, vCursorY);
  line(vCursorX, vCursorY - CONFIG.CURSOR_SIZE / 2, vCursorX, vCursorY + CONFIG.CURSOR_SIZE / 2);
  pop();
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function fmtNum(n) {
  return String(n).replace(/[0-9]/g, d => PERSIAN_DIGITS[+d]);
}

function fmtCountdown(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${fmtNum(m)}:${fmtNum(s < 10 ? '0' + s : s)}`;
}

function fmtTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

function releaseFocus() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

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
