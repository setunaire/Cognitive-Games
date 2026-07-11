/* ============================================================================
   GO/NO-GO TASK — Assessment Phase (English version)
   Project : Evaluation of Unconscious Effect of Music on Cognitive Functions
   Spec    : CogGames_Documentation.docx — Section 2 (+ Section 0 common spec)

   Cognitive function: Response inhibition, sustained attention,
   signal detection.

   A colored geometric shape appears at screen center. For Go stimuli the
   participant presses SPACE; for No-Go stimuli they withhold the response.
   Outcomes are classified with Signal Detection Theory (Section 2.5):
     hit / miss / falseAlarm / correctRejection.

   File layout:
     1. CONFIG            — every tunable parameter
     2. STRINGS           — every user-visible text (translate here only)
     3. LEVELS            — level definitions (colors, shapes, Go targets)
     4. STATES            — state machine constants
     5. RUNTIME STATE     — mutable session/trial variables
     6. p5 LIFECYCLE      — setup / draw / windowResized
     7. SCREENS           — menu, metadata, instructions, summary, end
     8. TRIAL GENERATION  — pre-pooled 60/40 Go ratio (Section 2.3)
     9. TRIAL FLOW        — ITI → stimulus → response/withhold → log
    10. INPUT HANDLERS    — SPACE = go
    11. LOGGING & EXPORT  — common + Go/No-Go-specific fields, CSV export
    12. HELPERS           — shuffle, formatting, DOM utilities
   ========================================================================== */

/* ============================================================================
   1. CONFIG — all tunable parameters
   ========================================================================== */
const CONFIG = {
  GAME_NAME: 'goNogo',                 // short camelCase id used in logs/filenames
  INPUT_DEVICE: 'keyboard_space',       // reported in session metadata (Section 0.10)

  // --- Trial structure (Sections 0.3 / 2.3 / 2.6) ---
  TRIALS_PER_LEVEL: 40,
  GO_RATIO: 0.6,                       // 60% Go / 40% No-Go, fixed for all levels

  // --- Timing (Sections 0.5 / 0.6 / 0.8) ---
  ITI_MS: 150,                         // blank inter-trial interval
  RESPONSE_WINDOW_MS: [1000, 800, 600], // L1 / L2 / L3
  ANTICIPATORY_THRESHOLD_MS: 150,      // RT below this => anticipatoryResponse = 1

  // --- Stimulus geometry ---
  STIMULUS_SIZE: 150,                  // shape size (px)

  // --- Stimulus colors (log names stay lowercase per spec) ---
  STIMULUS_COLORS: {
    green: '#02db26',
    red: '#E03131',
    blue: '#2247fb'
  },

  // --- HUD (Section 0.7) ---
  HUD_TEXT_SIZE: 18,
  HUD_MARGIN_TOP: 28,

  // --- Colors (visual theme; stimulus area stays neutral for validity) ---
  COLORS: {
    BG: '#F4F6F8',
    TEXT: '#212529',
    ACCENT: '#3B5BDB',
    HUD: '#37474F',
    CORRECT: '#2F9E44',
    INCORRECT: '#E03131',
    TIMEOUT: '#F08C00'
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
  gameTitle: 'Go / No-Go Task',
  gameSubtitle: 'Press SPACE for targets — hold back for everything else',

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
  goStimulusLabel: 'GO targets — press SPACE:',
  instructionsCommon:
    'Press SPACE as fast as you can when a GO target appears.\n' +
    'Do NOT press anything for any other shape.',
  btnStartLevel: 'Start Level',
  pressSpaceToStart: '(or press SPACE)',

  // HUD
  hudTrial: 'Trial: {i} / {n}',
  hudTime: 'Time: {t}',

  // Level summary
  summaryTitle: 'Level {l} Complete',
  summaryCorrect: 'Correct',
  summaryIncorrect: 'Incorrect',
  summaryTimeout: 'Missed',
  btnContinue: 'Continue',

  // End screen
  endTitle: 'Assessment Complete',
  endThanks: 'Thank you for participating!',
  btnSaveCsv: 'Save Results (CSV)',
  btnReturnMenu: 'Main Menu',
  confirmLeaveUnsaved: 'The results have not been saved yet. Leave anyway?',
  saveReminder: 'Please save the results before closing this window.'
};

/* ============================================================================
   3. LEVELS — level definitions (Section 2.2)
   Go targets accumulate: Green Circle → + Blue Square → + Red Triangle.
   ========================================================================== */
const LEVELS = [
  {
    id: 1,
    colors: ['green', 'red'],
    shapes: ['circle', 'square'],
    goTargets: [{ color: 'green', shape: 'circle' }],
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[0]
  },
  {
    id: 2,
    colors: ['green', 'red', 'blue'],
    shapes: ['circle', 'square'],
    goTargets: [
      { color: 'green', shape: 'circle' },
      { color: 'blue', shape: 'square' }
    ],
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[1]
  },
  {
    id: 3,
    colors: ['green', 'red', 'blue'],
    shapes: ['circle', 'square', 'triangle'],
    goTargets: [
      { color: 'green', shape: 'circle' },
      { color: 'blue', shape: 'square' },
      { color: 'red', shape: 'triangle' }
    ],
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

// Per-trial timing / response
let itiOnsetMs = 0;
let stimulusOnsetMs = 0;
let trialStartSessionMs = 0;
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

  ui.btnSave.size(220, 46);       ui.btnSave.position(cx - 240, cy + 90);
  ui.btnReturn.size(220, 46);     ui.btnReturn.position(cx + 20, cy + 90);
}

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
  text(`${STRINGS.levelLabel} ${fmtNum(level.id)} ${STRINGS.ofLabel} ${fmtNum(LEVELS.length)}`, width / 2, height / 2 - 210);
  textStyle(NORMAL);

  fill(CONFIG.COLORS.TEXT);
  textSize(18);
  text(STRINGS.goStimulusLabel, width / 2, height / 2 - 150);

  // Draw the Go targets as example shapes
  const gap = 130, exSize = 80;
  const targets = level.goTargets;
  let x = width / 2 - ((targets.length - 1) * gap) / 2;
  for (const t of targets) {
    drawStimulusShape(t.color, t.shape, x, height / 2 - 75, exSize);
    x += gap;
  }

  fill(CONFIG.COLORS.TEXT);
  textSize(CONFIG.INSTRUCTION_TEXT_SIZE);
  text(STRINGS.instructionsCommon, width / 2, height / 2 + 40);

  fill(CONFIG.COLORS.HUD);
  textSize(15);
  text(STRINGS.pressSpaceToStart, width / 2, height / 2 + 250);
}

function drawItiScreen() {
  drawHUD(false);
  if (nowMs() - itiOnsetMs >= CONFIG.ITI_MS) beginStimulus();
}

function drawStimulusScreen() {
  const trial = trialPool[trialIdxLevel];
  drawStimulusShape(trial.color, trial.shape, width / 2, height / 2, CONFIG.STIMULUS_SIZE);
  drawHUD(true);

  // Window expiry: no press. Correct on No-Go, omission (miss) on Go.
  if (nowMs() - stimulusOnsetMs >= LEVELS[levelIdx].responseWindowMs) {
    recordResponse('nogo');
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

/* ---------- Stimulus drawing ---------- */
function drawStimulusShape(colorName, shapeName, x, y, size) {
  const hex = CONFIG.STIMULUS_COLORS[colorName] || '#000000';
  fill(hex);
  noStroke();

  if (shapeName === 'circle') {
    ellipse(x, y, size, size);
  } else if (shapeName === 'square') {
    rect(x, y, size, size);
  } else if (shapeName === 'triangle') {
    const r = size * 0.6;
    triangle(
      x, y - r,
      x - r * 0.866, y + r * 0.5,
      x + r * 0.866, y + r * 0.5
    );
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
   8. TRIAL GENERATION — pooling method (Section 2.3)
   Pre-generate the pool with the exact 60/40 Go/No-Go split, shuffle once,
   draw sequentially. Go trials are split evenly across the level's Go
   targets; No-Go trials cycle over every non-target combination.
   ========================================================================== */
function generateTrialPool(level) {
  const goCount = Math.round(CONFIG.TRIALS_PER_LEVEL * CONFIG.GO_RATIO);   // 24
  const nogoCount = CONFIG.TRIALS_PER_LEVEL - goCount;                     // 16
  const pool = [];

  // --- Go trials: even split across Go targets (24/1, 12/12, 8/8/8) ---
  const targets = shuffleArray(level.goTargets);
  for (let i = 0; i < goCount; i++) {
    const t = targets[i % targets.length];
    pool.push({ color: t.color, shape: t.shape, trialType: 'go' });
  }

  // --- No-Go trials: cycle over every non-Go-target combination ---
  const nogoCombos = [];
  for (const c of level.colors) {
    for (const s of level.shapes) {
      if (!isGoTarget(level, c, s)) nogoCombos.push({ color: c, shape: s });
    }
  }
  const shuffledCombos = shuffleArray(nogoCombos);
  for (let i = 0; i < nogoCount; i++) {
    const t = shuffledCombos[i % shuffledCombos.length];
    pool.push({ color: t.color, shape: t.shape, trialType: 'nogo' });
  }

  return shuffleArray(pool);
}

/* Is (color, shape) one of the level's Go targets? */
function isGoTarget(level, colorName, shapeName) {
  return level.goTargets.some(t => t.color === colorName && t.shape === shapeName);
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
  trialStartSessionMs = stimulusOnsetMs;   // trial onset == stimulus onset
  state = STATES.STIMULUS;
}

/* Trial exit point. response: 'go' (Space pressed) | 'nogo' (window expired
   without a press). SDT classification per Section 2.5. */
function recordResponse(response) {
  if (responded) return;
  responded = true;

  const trial = trialPool[trialIdxLevel];
  const level = LEVELS[levelIdx];
  const windowMs = level.responseWindowMs;
  const pressed = response === 'go';

  // responseMs: raw timer at press moment, or window end when no press occurred
  const responseMs = pressed ? Math.round(nowMs() - stimulusOnsetMs) : windowMs;
  const reactionTime = responseMs;         // Go/No-Go: reactionTime = responseMs

  const correctResponse = trial.trialType;  // 'go' | 'nogo'

  // SDT outcome and result (Section 2.5): miss and falseAlarm are both -1
  let sdtOutcome, result;
  if (trial.trialType === 'go') {
    if (pressed) { sdtOutcome = 'hit'; result = 1; }
    else { sdtOutcome = 'miss'; result = -1; }               // omission error
  } else {
    if (pressed) { sdtOutcome = 'falseAlarm'; result = -1; } // commission error
    else { sdtOutcome = 'correctRejection'; result = 1; }
  }

  // Participant-facing tallies: misses shown as "Missed" (they are timeouts)
  if (result === 1) { levelStats.correct++; totalStats.correct++; }
  else if (sdtOutcome === 'miss') { levelStats.timeout++; totalStats.timeout++; }
  else { levelStats.incorrect++; totalStats.incorrect++; }

  trialLogs.push({
    // --- Common per-trial fields (Section 0.10) ---
    level: level.id,
    trialIndexGlobal: trialIdxGlobal + 1,
    trialIndexLevel: trialIdxLevel + 1,
    trialStartMsFromSessionStart: Math.round(trialStartSessionMs),
    response: response,
    correctResponse: correctResponse,
    result: result,
    responseMs: responseMs,
    reactionTime: reactionTime,
    anticipatoryResponse: (pressed && reactionTime < CONFIG.ANTICIPATORY_THRESHOLD_MS) ? 1 : 0,
    // --- Go/No-Go-specific fields (Section 2.7) ---
    stimulusColor: trial.color,
    stimulusShape: trial.shape,
    isGoTargetColor: level.goTargets.some(t => t.color === trial.color) ? 1 : 0,
    isGoTargetShape: level.goTargets.some(t => t.shape === trial.shape) ? 1 : 0,
    sdtOutcome: sdtOutcome
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
   10. INPUT HANDLERS — SPACE is the only response key
   ========================================================================== */
function keyPressed() {
  if (key === ' ') {
    if (state === STATES.INSTRUCTIONS) { startLevelFromInstructions(); return; }
    if (state === STATES.LEVEL_SUMMARY) { continueFromSummary(); return; }
    if (state === STATES.STIMULUS && !responded) { recordResponse('go'); return; }
  }
  // All other keys are ignored
}

/* ============================================================================
   11. LOGGING & CSV EXPORT
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
    ['trialsPerLevel', CONFIG.TRIALS_PER_LEVEL],
    ['goRatio', CONFIG.GO_RATIO]
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