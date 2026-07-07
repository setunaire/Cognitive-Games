/* ============================================================================
   STAR SEARCH — Assessment Phase (English version)
   Project : Evaluation of Unconscious Effect of Music on Cognitive Functions
   Spec    : CogGames_Documentation.docx — Section 4 (+ Section 0 common spec)

   Cognitive function: Visual selective attention, Feature Integration Theory
   (Treisman & Gelade, 1980).

   The participant clicks the singleton — the one item that looks different
   from all the others. No cue is shown.
     L1 — Feature pop-out: unique color, parallel search.
     L2 — Conjunction: unique color+shape combination, serial search.
     L3 — Conjunction + crowding: items packed at 5 px (Whitney & Levi, 2011).

   Trial phases:  FIXATION (500–800 ms jitter, timer NOT running)
                  → STIMULUS (timer starts at 0) → click / timeout → log

   Mouse trajectory is sampled every 100 ms into a separate CSV (Section 0.9).

   File layout:
     1. CONFIG            — every tunable parameter
     2. STRINGS           — every user-visible text (translate here only)
     3. STIMULUS SETS     — 10 colors × 10 shapes (Section 4.2)
     4. LEVELS            — search type, set size, padding, distractor pairs
     5. STATES            — state machine constants
     6. RUNTIME STATE     — mutable session/trial variables
     7. p5 LIFECYCLE      — setup / draw / windowResized
     8. SCREENS           — menu, metadata, instructions, summary, end
     9. TRIAL GENERATION  — balanced pool + item placement (Sections 4.4/4.6)
    10. TRIAL FLOW        — fixation → stimulus → click/timeout
    11. INPUT HANDLERS    — singleton click detection
    12. LOGGING & EXPORT  — trial CSV + separate mouse trajectory CSV
    13. SHAPE RENDERING   — the 10 shape primitives
    14. HELPERS           — shuffle, formatting, DOM utilities
   ========================================================================== */

/* ============================================================================
   1. CONFIG — all tunable parameters
   ========================================================================== */
const CONFIG = {
  GAME_NAME: 'starSearch',             // short camelCase id used in logs/filenames
  INPUT_DEVICE: 'mouse',                // reported in session metadata (Section 0.10)

  // --- Trial structure (Sections 0.3 / 4.7) ---
  TRIALS_PER_LEVEL: 40,

  // --- Timing (Sections 0.5 / 0.6 / 4.7) ---
  FIXATION_MIN_MS: 500,                // jittered fixation replaces the ITI
  FIXATION_MAX_MS: 800,
  RESPONSE_WINDOW_MS: [5000, 4000, 2500], // L1 / L2 / L3
  ANTICIPATORY_THRESHOLD_MS: 150,      // RT below this => anticipatoryResponse = 1

  // --- Mouse trajectory (Section 0.9) ---
  TRAJECTORY_SAMPLE_MS: 100,

  // --- Item geometry ---
  ITEM_SIZE: 56,                       // bounding size of each item (px) — raised after piloting (34 → 44 → 56)
  CLICK_TOLERANCE: 6,                  // extra radius accepted around an item (px)
  FIELD_MARGIN_TOP: 80,                // stimulus field margins (HUD clearance)
  FIELD_MARGIN_SIDE: 60,
  FIELD_MARGIN_BOTTOM: 50,
  PLACEMENT_MAX_ATTEMPTS: 3000,        // rejection-sampling cap per item (L1/L2)
  GRID_JITTER_PX: 3,                   // random offset in grid-jitter placement (L3)
  FIELD_MAX_W: 980,                    // cap the stimulus field so item density stays high on large monitors
  FIELD_MAX_H: 620,

  // --- Fixation cross ---
  FIXATION_SIZE: 30,

  // --- HUD (Section 0.7) ---
  HUD_TEXT_SIZE: 18,
  HUD_MARGIN_TOP: 28,

  // --- Colors (visual theme; the stimulus field itself stays neutral) ---
  COLORS: {
    BG: '#F4F6F8',
    TEXT: '#212529',
    ACCENT: '#3B5BDB',
    HUD: '#37474F',
    FIXATION: '#495057',
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
  gameTitle: 'Star Search',
  gameSubtitle: 'Find and click the item that looks different from the rest',

  // Menu
  btnFamiliarization: 'Familiarization',
  btnAssessment: 'Assessment',
  familiarizationEmpty: 'The Familiarization phase is not available yet.',

  // Metadata form
  metadataTitle: 'Session Information',
  labelParticipantId: 'Participant ID',
  labelSessionId: 'Session ID',
  labelMusicCondition: 'Music Condition',
  placeholderParticipantId: 'e.g. P001',
  placeholderSessionId: 'e.g. P001_S1',
  placeholderMusicCondition: 'e.g. silence',
  btnStartExperiment: 'Start',
  metadataError: 'Please fill in all three fields.',

  // Instructions
  levelLabel: 'Level',
  ofLabel: 'of',
  instructionsCommon:
    'Many items will appear on the screen.\n' +
    'Exactly ONE of them is different from all the others.\n' +
    'Find it and click it as fast as you can.',
  btnStartLevel: 'Start Level',
  pressSpaceToStart: '(or press SPACE)',

  // HUD
  hudTrial: 'Trial: {i} / {n}',
  hudTime: 'Time: {t}',

  // Level summary
  summaryTitle: 'Level {l} Complete',
  summaryCorrect: 'Correct',
  summaryIncorrect: 'Incorrect',
  summaryTimeout: 'Timeout',
  btnContinue: 'Continue',

  // End screen
  endTitle: 'Assessment Complete',
  endThanks: 'Thank you for participating!',
  btnSaveCsv: 'Save Results (CSV)',
  btnSaveTrajectory: 'Save Mouse Data (CSV)',
  btnReturnMenu: 'Main Menu',
  confirmLeaveUnsaved: 'The results have not been saved yet. Leave anyway?',
  saveReminder: 'Please save both files before closing this window.'
};

/* ============================================================================
   3. STIMULUS SETS — Section 4.2 (all colors are valid CSS color names)
   ========================================================================== */
/* Ten CATEGORICALLY distinct colors (piloting showed maroon/sienna and
   navy/slateblue were confusable: deltaE 26 and 35 in CIELAB). Every pair
   below has deltaE >= 44 and a different color name category, so the L1
   pop-out premise (large feature distance) holds for any random pairing.
   All names remain valid CSS colors and are logged as-is. */
const COLOR_SET = ['red', 'darkorange', 'gold', 'green', 'darkturquoise',
                   'royalblue', 'purple', 'deeppink', 'saddlebrown', 'dimgray'];
const SHAPE_SET = ['circle', 'square', 'triangle', 'diamond', 'pentagon',
                   'hexagon', 'star', 'cross', 'ring', 'semicircle'];

/* ============================================================================
   4. LEVELS — level definitions (Section 4.3)
   distractorPairs: [d1Count, d2Count] options — one is picked per trial.
   d1 = same shape as target, different color.
   d2 = same color as target, different shape (none at L1).
   ========================================================================== */
const LEVELS = [
  {
    id: 1, searchType: 'feature', setSize: 21, paddingPx: 50,
    distractorPairs: [[20, 0]],
    placement: 'rejection',
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[0]
  },
  {
    id: 2, searchType: 'conjunction', setSize: 21, paddingPx: 25,
    distractorPairs: [[10, 10], [11, 9], [12, 8], [13, 7]],
    placement: 'rejection',
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[1]
  },
  {
    id: 3, searchType: 'conjunction', setSize: 41, paddingPx: 5,
    distractorPairs: [[20, 20], [21, 19], [22, 18], [23, 17], [24, 16], [25, 15]],
    placement: 'gridJitter',           // rejection sampling too slow at 5 px (Section 4.6)
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[2]
  }
];

/* ============================================================================
   5. STATES — state machine constants
   ========================================================================== */
const STATES = {
  MENU: 'menu',
  METADATA: 'metadata',
  INSTRUCTIONS: 'instructions',
  FIXATION: 'fixation',
  STIMULUS: 'stimulus',
  LEVEL_SUMMARY: 'level_summary',
  END: 'end'
};

/* ============================================================================
   6. RUNTIME STATE — mutable session / trial variables
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
let trialStartSessionMs = 0;         // = fixation onset (trial start)
let stimulusOnsetMs = 0;
let fixationDurationMs = 0;
let trialEnded = false;
let emptyClicks = 0;                 // background clicks this trial (they do NOT end the trial)

// Items placed for the current trial: {x, y, color, shape, isTarget}
let items = [];

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
   7. p5 LIFECYCLE
   ========================================================================== */
function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  rectMode(CENTER);
  textFont('Segoe UI');
  buildUI();
  showOnly('menu');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layoutUI();
}

function draw() {
  background(CONFIG.COLORS.BG);
  sampleTrajectory();

  switch (state) {
    case STATES.MENU:          drawMenuScreen(); break;
    case STATES.METADATA:      drawMetadataScreen(); break;
    case STATES.INSTRUCTIONS:  drawInstructionsScreen(); break;
    case STATES.FIXATION:      drawFixationScreen(); break;
    case STATES.STIMULUS:      drawStimulusScreen(); break;
    case STATES.LEVEL_SUMMARY: drawSummaryScreen(); break;
    case STATES.END:           drawEndScreen(); break;
  }
}

/* ============================================================================
   8. SCREENS
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
  textSize(15);
  text(STRINGS.pressSpaceToStart, width / 2, height / 2 + 250);
}

function drawFixationScreen() {
  // Jittered fixation cross — the trial timer is NOT yet running (Section 4.5)
  noStroke();
  fill(CONFIG.COLORS.FIXATION);
  textSize(CONFIG.FIXATION_SIZE + 10);
  textStyle(BOLD);
  text('+', width / 2, height / 2);
  textStyle(NORMAL);
  drawHUD(false);

  if (nowMs() - trialStartSessionMs >= fixationDurationMs) beginStimulus();
}

function drawStimulusScreen() {
  for (const it of items) drawItem(it);
  drawHUD(true);

  if (nowMs() - stimulusOnsetMs >= LEVELS[levelIdx].responseWindowMs) {
    finishTrial(null);                 // timeout: no click
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

/* ---------- HUD (Section 0.7) ---------- */
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
   9. TRIAL GENERATION — balanced pool + placement (Sections 4.2/4.4/4.6)
   ========================================================================== */

/* Pre-generate 40 trial parameter sets with balanced coverage of target
   colors and shapes (each of the 10 colors and 10 shapes serves as the
   target exactly 4 times). Shuffled once; drawn sequentially. */
function generateTrialPool(level) {
  const n = CONFIG.TRIALS_PER_LEVEL;

  // Balanced target color/shape sequences (40 = 10 × 4)
  let targetColors = [];
  let targetShapes = [];
  for (let i = 0; i < n; i++) {
    targetColors.push(COLOR_SET[i % COLOR_SET.length]);
    targetShapes.push(SHAPE_SET[i % SHAPE_SET.length]);
  }
  targetColors = shuffleArray(targetColors);
  targetShapes = shuffleArray(targetShapes);

  const pool = [];
  for (let i = 0; i < n; i++) {
    const tColor = targetColors[i];
    const tShape = targetShapes[i];

    // d1: same shape as target, different color
    const d1Color = randomOther(COLOR_SET, tColor);
    // d2: same color as target, different shape (L2/L3 only)
    const d2Shape = randomOther(SHAPE_SET, tShape);

    // Distractor pair counts: pick one option randomly per trial (Section 4.3)
    const pair = level.distractorPairs[Math.floor(Math.random() * level.distractorPairs.length)];

    pool.push({
      targetColor: tColor, targetShape: tShape,
      d1Color: d1Color, d2Shape: d2Shape,
      d1Count: pair[0], d2Count: pair[1]
    });
  }
  return shuffleArray(pool);
}

/* Build and place the physical items for the current trial. */
function buildItems(trial, level) {
  const specs = [];
  specs.push({ color: trial.targetColor, shape: trial.targetShape, isTarget: true });
  for (let i = 0; i < trial.d1Count; i++) specs.push({ color: trial.d1Color, shape: trial.targetShape, isTarget: false });
  for (let i = 0; i < trial.d2Count; i++) specs.push({ color: trial.targetColor, shape: trial.d2Shape, isTarget: false });

  const shuffledSpecs = shuffleArray(specs);
  const positions = (level.placement === 'gridJitter')
    ? gridJitterPositions(shuffledSpecs.length, level.paddingPx)
    : rejectionPositions(shuffledSpecs.length, level.paddingPx);

  items = shuffledSpecs.map((s, i) => ({ ...s, x: positions[i].x, y: positions[i].y }));
}

/* Stimulus field bounds: clear of the HUD/screen edges AND capped to a
   centered region, so item density stays comparable across monitor sizes. */
function fieldBounds() {
  const availW = width - 2 * CONFIG.FIELD_MARGIN_SIDE;
  const availH = height - CONFIG.FIELD_MARGIN_TOP - CONFIG.FIELD_MARGIN_BOTTOM;
  const w = Math.min(availW, CONFIG.FIELD_MAX_W);
  const h = Math.min(availH, CONFIG.FIELD_MAX_H);
  const cx = width / 2;
  const cy = CONFIG.FIELD_MARGIN_TOP + availH / 2;
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}

/* L1/L2: rejection sampling with min center-to-center distance =
   ITEM_SIZE + padding (Section 4.6). */
function rejectionPositions(count, paddingPx) {
  const b = fieldBounds();
  const minDist = CONFIG.ITEM_SIZE + paddingPx;
  const half = CONFIG.ITEM_SIZE / 2;
  const positions = [];

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < CONFIG.PLACEMENT_MAX_ATTEMPTS; attempt++) {
      const x = random(b.x0 + half, b.x1 - half);
      const y = random(b.y0 + half, b.y1 - half);
      if (positions.every(p => dist(x, y, p.x, p.y) >= minDist)) {
        positions.push({ x, y });
        placed = true;
        break;
      }
    }
    // Extremely unlikely fallback: place anyway to avoid an infinite stall
    if (!placed) positions.push({
      x: random(b.x0 + half, b.x1 - half),
      y: random(b.y0 + half, b.y1 - half)
    });
  }
  return positions;
}

/* L3: grid-jitter placement — one item per cell of a compact grid whose
   footprint is clipped to a disc (Section 4.6).
   The cluster must stay DENSE (cell = ITEM_SIZE + padding + jitter headroom):
   the 5 px spacing IS the crowding manipulation. The disc shape replaces the
   earlier rectangular block, which looked unnatural in piloting — classic
   crowding displays are radial, and a disc has no salient corners that could
   anchor attention. */
function gridJitterPositions(count, paddingPx) {
  const b = fieldBounds();
  const jitter = CONFIG.GRID_JITTER_PX;
  // Guarantees min center-to-center distance ITEM_SIZE + padding after jitter
  const cell = CONFIG.ITEM_SIZE + paddingPx + 2 * jitter;

  // Square grid with enough cells inside its inscribed disc (~78.5% of n²)
  const n = Math.ceil(Math.sqrt(count / 0.785));
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const half = (n - 1) / 2;

  // Keep the `count` cells closest to the grid center — a disc-shaped
  // footprint — then shuffle which item lands in which cell.
  const cells = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      cells.push({ r, c, d: Math.hypot(c - half, r - half) });
  cells.sort((a, b2) => a.d - b2.d);
  const chosen = shuffleArray(cells.slice(0, count));

  return chosen.map(cl => ({
    x: cx + (cl.c - half) * cell + random(-jitter, jitter),
    y: cy + (cl.r - half) * cell + random(-jitter, jitter)
  }));
}

/* ============================================================================
   10. TRIAL FLOW
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
  beginFixation();
}

function beginFixation() {
  trialStartSessionMs = nowMs();       // trial starts at fixation onset
  fixationDurationMs = random(CONFIG.FIXATION_MIN_MS, CONFIG.FIXATION_MAX_MS);
  trialEnded = false;
  emptyClicks = 0;
  state = STATES.FIXATION;
}

function beginStimulus() {
  const level = LEVELS[levelIdx];
  buildItems(trialPool[trialIdxLevel], level);
  stimulusOnsetMs = nowMs();           // timer starts at 0 here (Section 4.5)
  state = STATES.STIMULUS;
}

/* Trial exit. clickPos = {x, y} or null on timeout. */
function finishTrial(clickPos) {
  if (trialEnded) return;
  trialEnded = true;

  const trial = trialPool[trialIdxLevel];
  const level = LEVELS[levelIdx];
  const windowMs = level.responseWindowMs;
  const isTimeout = clickPos === null;
  const target = items.find(it => it.isTarget);

  // responseMs runs from trial start (fixation onset); on timeout it is the
  // window end. reactionTime = responseMs − fixationDuration (Section 4.8).
  const responseMs = isTimeout
    ? Math.round(fixationDurationMs + windowMs)
    : Math.round(nowMs() - trialStartSessionMs);
  const reactionTime = Math.round(responseMs - fixationDurationMs);

  // Identify what was clicked
  let clickedItemType = 'timeout';
  let clickedItem = null;
  if (!isTimeout) {
    clickedItem = itemAt(clickPos.x, clickPos.y);
    if (clickedItem === null) clickedItemType = 'empty';
    else clickedItemType = clickedItem.isTarget ? 'target' : 'distractor';
  }

  // result: 1 clicked target, −1 wrong click (distractor or empty), 0 timeout
  let result;
  if (isTimeout) result = 0;
  else result = clickedItemType === 'target' ? 1 : -1;

  if (result === 1) { levelStats.correct++; totalStats.correct++; }
  else if (result === -1) { levelStats.incorrect++; totalStats.incorrect++; }
  else { levelStats.timeout++; totalStats.timeout++; }

  // Final trajectory snapshot at trial end (Section 0.9)
  logTrajectoryPoint();

  const targetItemStr = `${trial.targetColor}_${trial.targetShape}`;
  const responseStr = isTimeout
    ? 'timeout'
    : (clickedItem ? `${clickedItem.color}_${clickedItem.shape}` : 'empty');

  trialLogs.push({
    // --- Common per-trial fields (Section 0.10) ---
    level: level.id,
    trialIndexGlobal: trialIdxGlobal + 1,
    trialIndexLevel: trialIdxLevel + 1,
    trialStartMsFromSessionStart: Math.round(trialStartSessionMs),
    response: responseStr,
    correctResponse: targetItemStr,
    result: result,
    responseMs: responseMs,
    reactionTime: reactionTime,
    anticipatoryResponse: (!isTimeout && reactionTime < CONFIG.ANTICIPATORY_THRESHOLD_MS) ? 1 : 0,
    // --- Star Search-specific fields (Section 4.8) ---
    searchType: level.searchType,
    setSize: level.setSize,
    targetItem: targetItemStr,
    distractor1Item: `${trial.d1Color}_${trial.targetShape}`,
    distractor2Item: trial.d2Count > 0 ? `${trial.targetColor}_${trial.d2Shape}` : '',
    distractor1Count: trial.d1Count,
    distractor2Count: trial.d2Count,
    fixationDuration: Math.round(fixationDurationMs),
    targetX: Math.round(target.x),
    targetY: Math.round(target.y),
    clickX: isTimeout ? -1 : Math.round(clickPos.x),
    clickY: isTimeout ? -1 : Math.round(clickPos.y),
    clickDistance: isTimeout ? -1 : Math.round(dist(clickPos.x, clickPos.y, target.x, target.y)),
    clickedItemType: clickedItemType,
    emptyClickCount: emptyClicks
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
    beginFixation();                   // next trial starts with its fixation
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
   11. INPUT HANDLERS
   ========================================================================== */
function keyPressed() {
  if (key === ' ') {
    if (state === STATES.INSTRUCTIONS) { startLevelFromInstructions(); return; }
    if (state === STATES.LEVEL_SUMMARY) { continueFromSummary(); return; }
  }
}

function mousePressed() {
  if (state !== STATES.STIMULUS || trialEnded) return;
  /* Only a click ON an item ends the trial. Background clicks are motor
     noise (worst in the crowded L3 display), not search failures — ending
     the trial on them would mix pointing precision into the attention
     measure. They are tallied in emptyClickCount instead. */
  if (itemAt(mouseX, mouseY) === null) { emptyClicks++; return; }
  finishTrial({ x: mouseX, y: mouseY });
}

/* Item under (x, y): nearest item center within the click radius. */
function itemAt(x, y) {
  const radius = CONFIG.ITEM_SIZE / 2 + CONFIG.CLICK_TOLERANCE;
  let best = null, bestDist = Infinity;
  for (const it of items) {
    const d = dist(x, y, it.x, it.y);
    if (d <= radius && d < bestDist) { best = it; bestDist = d; }
  }
  return best;
}

/* ============================================================================
   12. LOGGING & EXPORT — trial CSV + separate mouse trajectory CSV
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
    ['fixationJitterMs', `${CONFIG.FIXATION_MIN_MS}-${CONFIG.FIXATION_MAX_MS}`],
    ['itemSizePx', CONFIG.ITEM_SIZE],
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

function sampleTrajectory() {
  const inTrial = state === STATES.FIXATION || state === STATES.STIMULUS;
  if (!inTrial) return;
  const t = nowMs();
  if (t - lastTrajectorySampleMs >= CONFIG.TRAJECTORY_SAMPLE_MS) {
    lastTrajectorySampleMs = t;
    logTrajectoryPoint();
  }
}

function logTrajectoryPoint() {
  trajectoryLogs.push({
    trialIndexGlobal: trialIdxGlobal + 1,
    timestampMs: Math.round(nowMs()),
    mouseX: Math.round(mouseX),
    mouseY: Math.round(mouseY)
  });
}

/* ============================================================================
   13. SHAPE RENDERING — the 10 shape primitives (Section 4.2)
   Every shape fits within an ITEM_SIZE × ITEM_SIZE bounding box.
   ========================================================================== */
function drawItem(it) {
  const s = CONFIG.ITEM_SIZE;
  const x = it.x, y = it.y;
  fill(it.color);
  noStroke();

  switch (it.shape) {
    case 'circle':
      ellipse(x, y, s, s);
      break;
    case 'square':
      rect(x, y, s * 0.9, s * 0.9);
      break;
    case 'triangle':
      drawRegularPolygon(x, y, s / 2, 3, -HALF_PI);
      break;
    case 'diamond':
      drawRegularPolygon(x, y, s / 2, 4, -HALF_PI);
      break;
    case 'pentagon':
      drawRegularPolygon(x, y, s / 2, 5, -HALF_PI);
      break;
    case 'hexagon':
      drawRegularPolygon(x, y, s / 2, 6, 0);
      break;
    case 'star':
      drawStar(x, y, s / 2, s / 4, 5);
      break;
    case 'cross':
      rect(x, y, s * 0.9, s * 0.34, 2);
      rect(x, y, s * 0.34, s * 0.9, 2);
      break;
    case 'ring':
      ellipse(x, y, s, s);
      fill(CONFIG.COLORS.BG);           // punch the hole with the background
      ellipse(x, y, s * 0.45, s * 0.45);
      break;
    case 'semicircle':
      arc(x, y - s * 0.1, s, s, PI, TWO_PI, PIE);
      break;
  }
}

function drawRegularPolygon(x, y, radius, npoints, rotation) {
  beginShape();
  for (let i = 0; i < npoints; i++) {
    const a = rotation + TWO_PI * i / npoints;
    vertex(x + cos(a) * radius, y + sin(a) * radius);
  }
  endShape(CLOSE);
}

function drawStar(x, y, outerR, innerR, npoints) {
  beginShape();
  for (let i = 0; i < npoints * 2; i++) {
    const r = (i % 2 === 0) ? outerR : innerR;
    const a = -HALF_PI + PI * i / npoints;
    vertex(x + cos(a) * r, y + sin(a) * r);
  }
  endShape(CLOSE);
}

/* ============================================================================
   14. HELPERS
   ========================================================================== */
function nowMs() {
  return performance.now() - sessionStartMonotonic;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Random element of `set` different from `exclude`. */
function randomOther(set, exclude) {
  const options = set.filter(v => v !== exclude);
  return options[Math.floor(Math.random() * options.length)];
}

function fmtNum(n) {
  return String(n);
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