/* ============================================================================
   BRAIN SHIFT — Assessment Phase (English version)
   Project : Evaluation of Unconscious Effect of Music on Cognitive Functions
   Spec    : CogGames_Documentation.docx — Section 5 (+ Section 0 common spec)

   Cognitive function: Cognitive flexibility, task-switching, executive
   control.

   Four labeled boxes are on screen (2 top, 2 bottom). A colored digit
   appears in one box. Top boxes require a NUMBER judgment (Even / Odd);
   bottom boxes require a COLOR judgment (Warm / Cool). The participant
   answers whether the stimulus matches the box's category:
     → = Yes   |   ← = No
   A task switch occurs when the trial's box domain differs from the
   previous trial's domain.

   File layout:
     1. CONFIG            — every tunable parameter
     2. STRINGS           — every user-visible text (translate here only)
     3. CATEGORIES        — number/color category members (Section 5.3)
     4. LEVELS            — switch rate + label visibility (Section 5.4)
     5. STATES            — state machine constants
     6. RUNTIME STATE     — mutable session/trial variables
     7. p5 LIFECYCLE      — setup / draw / windowResized
     8. SCREENS           — menu, metadata, instructions, summary, end
     9. TRIAL GENERATION  — pre-built switch sequence + balanced yes/no
    10. TRIAL FLOW        — ITI → stimulus → response/timeout → log
    11. INPUT HANDLERS    — ←/→ keys
    12. LOGGING & EXPORT  — common + Brain Shift-specific fields
    13. HELPERS           — shuffle, formatting, DOM utilities
   ========================================================================== */

/* ============================================================================
   1. CONFIG — all tunable parameters
   ========================================================================== */
const CONFIG = {
  GAME_NAME: 'brainShift',             // short camelCase id used in logs/filenames
  INPUT_DEVICE: 'keyboard_arrow',       // reported in session metadata (Section 0.10)

  // --- Trial structure (Sections 0.3 / 5.6) ---
  TRIALS_PER_LEVEL: 40,
  YES_RATIO: 0.5,                      // fraction of trials whose correct answer is 'yes'

  /* Level 1 is a PURE-BLOCK baseline (0% switching): two equal single-task
     blocks — the first half of trials in one domain, the second half in the
     other — so single-task RT baselines exist for BOTH task domains and the
     switch cost at L2/L3 (mixed-block RT − pure-block RT) can be computed.
     Flip this array to reverse which domain comes first. */
  L1_BLOCK_ORDER: ['number', 'color'],   // first 20 trials / last 20 trials
  MIXED_START_DOMAIN: 'number',          // starting domain for the mixed levels L2/L3

  // --- Timing (Sections 0.5 / 0.6 / 5.6) ---
  ITI_MS: 200,                         // blank inter-trial interval (longer than other games)
  RESPONSE_WINDOW_MS: [3000, 3000, 2000], // L1 / L2 / L3 — L3 sits AT its 2000 ms floor (switch RT ~1150 ms + 2σ): any tighter and the window censors switch trials more than repeats, shrinking the very switch cost this game measures. L1 == L2 so mixing cost (L2 − L1) is read at a constant window.
  ANTICIPATORY_THRESHOLD_MS: 150,      // RT below this => anticipatoryResponse = 1

  // --- Switch rates per level (Section 5.4) ---
  SWITCH_RATE: [0.0, 0.4, 0.6],        // fraction of trials 2..40 that switch domain

  // --- Box layout ---
  BOX_W: 220,
  BOX_H: 140,
  BOX_GAP_X: 60,
  BOX_GAP_Y: 60,
  DIGIT_TEXT_SIZE: 84,
  LABEL_TEXT_SIZE: 20,

  // --- Stimulus colors (Section 5.3 — log names stay lowercase) ---
  STIMULUS_COLORS: {
    red: '#E03131', orange: '#F76707', yellow: '#F0A800',   // warm
    blue: '#1971C2', green: '#2F9E44', purple: '#862E9C'    // cool
  },

  // --- HUD (Section 0.7) ---
  HUD_TEXT_SIZE: 18,
  HUD_MARGIN_TOP: 28,

  // --- Colors (visual theme) ---
  COLORS: {
    BG: '#F4F6F8',
    TEXT: '#212529',
    ACCENT: '#3B5BDB',
    HUD: '#37474F',
    BOX_FILL: '#FFFFFF',
    BOX_BORDER: '#ADB5BD',
    BOX_LABEL: '#37474F',
    RESPONSE_LABEL: '#495057',
    CORRECT: '#2F9E44',
    INCORRECT: '#E03131',
    TIMEOUT: '#F08C00'
  },

  // --- Familiarization (CogGames_Documentation.docx Section 8) ---
  FAMILIARIZATION: {
    DEMOS: [5, 0, 0],          // demo steps per level
    // Practice trials are FIXED, identical for every participant — see FAM_PRACTICE_SETS
    PRACTICE_WINDOW_MS: 4000,        // flat practice window, all levels — hardest practiced level is L2 (2000 ms floor)
    FEEDBACK_MS: 600,                // feedback display time (Section 8.6)
    FEEDBACK_ANSWER_MS: 2500,        // longer feedback when the correct answer is shown (errors/timeouts)
    RUN_ONCE_PER_PARTICIPANT: true   // warn if the same participant repeats it
  },

  // --- Misc ---
  MENU_TITLE_SIZE: 42,
  INSTRUCTION_TEXT_SIZE: 22
};

/* ============================================================================
   2. STRINGS — every user-visible text lives here (single translation point)
   ========================================================================== */
const STRINGS = {
  gameTitle: 'Brain Shift',
  gameSubtitle: 'Judge the number or the color — depending on the box',

  // Menu
  btnFamiliarization: 'Familiarization',
  btnAssessment: 'Assessment',

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

  // Category labels shown on the boxes (Section 5.2)
  categoryLabels: { even: 'EVEN', odd: 'ODD', warm: 'WARM', cool: 'COOL' },

  // Persistent response labels (Section 5.1)
  responseYes: 'Yes →',
  responseNo: '← No',

  // Instructions
  levelLabel: 'Level',
  ofLabel: 'of',
  instructionsCommon:
    'A colored digit appears in one of the four boxes.\n' +
    'TOP boxes: judge the NUMBER (0, 2, 4, 6, 8 are EVEN / 1, 3, 5, 7, 9 are ODD).\n' +
    'BOTTOM boxes: judge the COLOR (RED, ORANGE, YELLOW are WARM / BLUE, GREEN, PURPLE are COOL).\n' +
    'Does the digit match the box’s category?\n' +
    'No = ←    → = Yes ',
  instructionsNoLabels: 'Attention: at this level the box labels are hidden.\nRemember which box is which!',
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
  btnReturnMenu: 'Main Menu',
  confirmLeaveUnsaved: 'The results have not been saved yet. Leave anyway?',
  saveReminder: 'Please save the results before closing this window.',

  // --- Familiarization (Section 8) ---
  famDemoTag: 'DEMO {i} / {n}',
  famPracticeIntro: 'Practice',
  famOfferRepeat: 'Would you like to practice once more?',
  famAlreadyDone: 'This participant already completed Familiarization for this game. Repeat it anyway?',
  famEndTitle: 'Familiarization Complete',
  famReadyLine: 'You are ready for the Assessment.',
  famFeedbackCorrect: 'Correct',
  famFeedbackIncorrect: 'Incorrect',
  famFeedbackTimeout: 'Too slow',
  famPressSpace: '(press SPACE to continue)',
  famBtnRepeat: 'Practice again',
  famBtnContinue: 'Continue',
  famAnswerWas: 'Correct answer: {a}',
  famCatEven: 'EVEN:  0  2  4  6  8',
  famCatOdd: 'ODD:  1  3  5  7  9',
  famDemos: [
    'The categories used throughout the game:\nEVEN / ODD digits and WARM / COOL colors.',
    'Top-left box asks: is the digit EVEN?\n4 IS even — answer YES (→). Its color never matters here.',
    'Top-right box asks: is the digit ODD?\n7 IS odd — answer YES (→).',
    'Bottom-left box asks: is the COLOR warm?\nBLUE is cool, not warm — answer NO (←). The digit value never matters here.',
    'Bottom-right box asks: is the COLOR cool?\nGREEN IS cool — answer YES (→).'
  ],

};

/* ============================================================================
   3. CATEGORIES — Section 5.3
   ========================================================================== */
const NUMBER_CATEGORIES = {
  even: [0, 2, 4, 6, 8],
  odd: [1, 3, 5, 7, 9]
};
const COLOR_CATEGORIES = {
  warm: ['red', 'orange', 'yellow'],
  cool: ['blue', 'green', 'purple']
};

/* Box positions and their task/category (Section 5.2). */
const BOXES = [
  { position: 'topLeft',     taskDomain: 'number', category: 'even' },
  { position: 'topRight',    taskDomain: 'number', category: 'odd'  },
  { position: 'bottomLeft',  taskDomain: 'color',  category: 'warm' },
  { position: 'bottomRight', taskDomain: 'color',  category: 'cool' }
];

/* ============================================================================
   4. LEVELS — level definitions (Section 5.4)
   ========================================================================== */
const LEVELS = [
  { id: 1, pureBlocks: CONFIG.L1_BLOCK_ORDER, switchRate: CONFIG.SWITCH_RATE[0], labelsVisible: true,  responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[0] },
  { id: 2, switchRate: CONFIG.SWITCH_RATE[1],                                    labelsVisible: true,  responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[1] },
  { id: 3, switchRate: CONFIG.SWITCH_RATE[2],                                    labelsVisible: true,  responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[2] }
];

/* ============================================================================
   5. STATES — state machine constants
   ========================================================================== */
const STATES = {
  MENU: 'menu',
  METADATA: 'metadata',
  INSTRUCTIONS: 'instructions',
  ITI: 'iti',
  STIMULUS: 'stimulus',
  LEVEL_SUMMARY: 'level_summary',
  END: 'end',
  FAM_DEMO: 'fam_demo',            // self-paced captioned demonstration (Section 8.3)
  FAM_MSG: 'fam_msg',              // block intro / repeat notice
  FAM_FEEDBACK: 'fam_feedback'     // per-trial feedback flash (Section 8.6)
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
let metadataErrorMsg = '';

// --- Familiarization runtime (Section 8) ---
let famMode = false;                 // true while the Familiarization flow runs
let famPlan = [];                    // ordered steps: {type:'demo'|'practice', level, ...}
let famStepIdx = -1;
let famDemoIdx = 0;
let famAttempt = 1;                  // practice attempt number (1 or 2)
let famPracticeCorrect = 0;
let famPracticeTotal = 0;
let famFeedback = 0;                 // last practice result (1 | -1 | 0)
let famFbAt = 0;                     // feedback onset (session ms)
let famOfferRepeat = false;          // offering the optional practice repeat (shown to everyone)
let pendingPhase = 'assessment';     // where onSubmitMetadata routes afterwards


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

  switch (state) {
    case STATES.MENU:          drawMenuScreen(); break;
    case STATES.METADATA:      drawMetadataScreen(); break;
    case STATES.INSTRUCTIONS:  drawInstructionsScreen(); break;
    case STATES.ITI:           drawItiScreen(); break;
    case STATES.STIMULUS:      drawStimulusScreen(); break;
    case STATES.LEVEL_SUMMARY: drawSummaryScreen(); break;
    case STATES.END:           drawEndScreen(); break;
    case STATES.FAM_DEMO:      drawFamDemoScreen(); break;
    case STATES.FAM_MSG:       drawFamMsgScreen(); break;
    case STATES.FAM_FEEDBACK:  drawFamFeedbackScreen(); break;
  }
}

/* ============================================================================
   8. SCREENS
   ========================================================================== */

/* ---------- DOM construction ---------- */
function buildUI() {
  ui.btnFam = createButton(STRINGS.btnFamiliarization).class('game-btn game-btn-secondary');
  ui.btnFam.mousePressed(() => {
    currentPhase = 'familiarization';
    pendingPhase = 'familiarization';
    const ls = loadSessionFromStorage();
    if (ls) {
      if (famAlreadyDoneFor(ls.participantId) && !confirm(STRINGS.famAlreadyDone)) return;
      ui.inPart.value(ls.participantId); ui.inSess.value(ls.sessionId); ui.inMusic.value(ls.musicCondition);
      onSubmitMetadata();
    } else {
      state = STATES.METADATA;
      showOnly('metadata');
    }
  });

  ui.btnAssess = createButton(STRINGS.btnAssessment).class('game-btn');
  ui.btnAssess.mousePressed(() => {
    currentPhase = 'assessment';
    pendingPhase = 'assessment';
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
  // Repeat-offer buttons (shown only on the offer screen, Section 8.7)
  ui.btnFamRepeat = createButton(STRINGS.famBtnRepeat).class('game-btn game-btn-secondary');
  ui.btnFamRepeat.mousePressed(() => { showOnly('none'); famAcceptRepeat(); });
  ui.btnFamContinue = createButton(STRINGS.famBtnContinue).class('game-btn');
  ui.btnFamContinue.mousePressed(() => { famOfferRepeat = false; famDone(); });

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

  ui.btnFamRepeat.size(200, 46);   ui.btnFamRepeat.position(cx - 210, cy + 40);
  ui.btnFamContinue.size(200, 46); ui.btnFamContinue.position(cx + 10, cy + 40);

  ui.btnFam.size(220, 46);       ui.btnFam.position(cx - 110, cy - 46);
  ui.btnAssess.size(220, 46);    ui.btnAssess.position(cx - 110, cy + 10);

  const labelX = cx - 230, inputX = cx - 60, rowH = 46;
  ui.lblPart.position(labelX, cy - 80);   ui.inPart.position(inputX, cy - 86);  ui.inPart.size(220, 22);
  ui.lblSess.position(labelX, cy - 80 + rowH);  ui.inSess.position(inputX, cy - 86 + rowH); ui.inSess.size(220, 22);
  ui.lblMusic.position(labelX, cy - 80 + rowH * 2); ui.inMusic.position(inputX, cy - 86 + rowH * 2); ui.inMusic.size(220, 22);
  ui.btnStartExp.size(160, 42);  ui.btnStartExp.position(cx - 80, cy + 70);

  ui.btnStartLevel.size(180, 46); ui.btnStartLevel.position(cx - 90, cy + 215);
  ui.btnContinue.size(180, 46);   ui.btnContinue.position(cx - 90, cy + 130);

  ui.btnSave.size(220, 46);       ui.btnSave.position(cx - 240, cy + 90);
  ui.btnReturn.size(220, 46);     ui.btnReturn.position(cx + 20, cy + 90);
}

function showOnly(group) {
  const all = ['btnFam', 'btnAssess', 'lblPart', 'inPart', 'lblSess', 'inSess',
               'lblMusic', 'inMusic', 'btnStartExp', 'btnStartLevel',
               'btnContinue', 'btnSave', 'btnReturn', 'btnFamRepeat', 'btnFamContinue'];
  for (const k of all) ui[k].hide();

  const groups = {
    menu: ['btnFam', 'btnAssess'],
    metadata: ['lblPart', 'inPart', 'lblSess', 'inSess', 'lblMusic', 'inMusic', 'btnStartExp'],
    instructions: ['btnStartLevel'],
    summary: ['btnContinue'],
    end: ['btnSave', 'btnReturn'],
    famOffer: ['btnFamRepeat', 'btnFamContinue'],
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
  text(`${STRINGS.levelLabel} ${fmtNum(level.id)} ${STRINGS.ofLabel} ${fmtNum(LEVELS.length)}`, width / 2, height / 2 - 230);
  textStyle(NORMAL);

  fill(CONFIG.COLORS.TEXT);
  textSize(CONFIG.INSTRUCTION_TEXT_SIZE);
  text(STRINGS.instructionsCommon, width / 2, height / 2 - 130);

  // Mini preview of the box layout with labels
  drawBoxes(true, 0.5, height / 2 + 55);

  if (!level.labelsVisible) {
    fill(CONFIG.COLORS.INCORRECT);
    textSize(18);
    text(STRINGS.instructionsNoLabels, width / 2, height / 2 + 185);
  }

  fill(CONFIG.COLORS.HUD);
  textSize(15);
  text(STRINGS.pressSpaceToStart, width / 2, height / 2 + 275);
}

function drawItiScreen() {
  drawBoxes(LEVELS[levelIdx].labelsVisible, 1, height / 2);
  drawResponseLabels();
  drawHUD(false);
  if (nowMs() - itiOnsetMs >= CONFIG.ITI_MS) beginStimulus();
}

function drawStimulusScreen() {
  const level = LEVELS[levelIdx];
  const trial = trialPool[trialIdxLevel];

  drawBoxes(level.labelsVisible, 1, height / 2);
  drawStimulusDigit(trial);
  drawResponseLabels();
  drawHUD(true);

  if (nowMs() - stimulusOnsetMs >= effectiveWindowMs()) {
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
  if (currentPhase === 'familiarization') { drawFamEndScreen(); return; }

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

/* ---------- Box layout ----------
   showLabels: draw category labels; scale: shrink factor for previews;
   centerY: vertical center of the 2×2 arrangement. */
function boxCenter(position, scale, centerY) {
  const w = CONFIG.BOX_W * scale, h = CONFIG.BOX_H * scale;
  const gx = CONFIG.BOX_GAP_X * scale, gy = CONFIG.BOX_GAP_Y * scale;
  const cx = width / 2;
  const dx = (w + gx) / 2, dy = (h + gy) / 2;
  switch (position) {
    case 'topLeft':     return { x: cx - dx, y: centerY - dy };
    case 'topRight':    return { x: cx + dx, y: centerY - dy };
    case 'bottomLeft':  return { x: cx - dx, y: centerY + dy };
    case 'bottomRight': return { x: cx + dx, y: centerY + dy };
  }
}

function drawBoxes(showLabels, scale, centerY) {
  const w = CONFIG.BOX_W * scale, h = CONFIG.BOX_H * scale;

  for (const box of BOXES) {
    const c = boxCenter(box.position, scale, centerY);
    stroke(CONFIG.COLORS.BOX_BORDER);
    strokeWeight(2.5);
    fill(CONFIG.COLORS.BOX_FILL);
    rect(c.x, c.y, w, h, 14);

    if (showLabels) {
      noStroke();
      fill(CONFIG.COLORS.BOX_LABEL);
      textSize(CONFIG.LABEL_TEXT_SIZE * scale);
      textStyle(BOLD);
      // Label sits at the box's outer edge (above top boxes, below bottom boxes)
      const labelY = box.position.startsWith('top') ? c.y - h / 2 - 18 * scale : c.y + h / 2 + 18 * scale;
      text(STRINGS.categoryLabels[box.category], c.x, labelY);
      textStyle(NORMAL);
    }
  }
}

/* The colored digit inside its box. */
function drawStimulusDigit(trial) {
  const c = boxCenter(trial.stimulusPosition, 1, height / 2);
  noStroke();
  fill(CONFIG.STIMULUS_COLORS[trial.stimulusColor]);
  textSize(CONFIG.DIGIT_TEXT_SIZE);
  textStyle(BOLD);
  text(fmtNum(trial.stimulusNumber), c.x, c.y - 4);
  textStyle(NORMAL);
}

/* Persistent Yes/No response labels (Section 5.1). */
function drawResponseLabels() {
  const y = height - 60;
  noStroke();
  fill(CONFIG.COLORS.RESPONSE_LABEL);
  textSize(24);
  textStyle(BOLD);
  text(STRINGS.responseNo, width / 2 - 160, y);
  text(STRINGS.responseYes, width / 2 + 160, y);
  textStyle(NORMAL);
}

/* ---------- HUD (Section 0.7) ---------- */
function drawHUD(showCountdown) {
  noStroke();
  fill(CONFIG.COLORS.HUD);
  textSize(CONFIG.HUD_TEXT_SIZE);

  // Familiarization practice: one continuous counter across ALL levels
  const trialTxt = famMode
    ? fmtTemplate(STRINGS.hudTrial, {
        i: fmtNum(famPracticeTotal + 1),
        n: fmtNum(famPlan.reduce((a, s) => a + (s.type === 'practice' ? s.n : 0), 0))
      })
    : fmtTemplate(STRINGS.hudTrial, {
        i: fmtNum(trialIdxLevel + 1),
        n: fmtNum(trialPool.length)
      });

  let remainingMs = effectiveWindowMs();
  if (showCountdown) remainingMs = max(0, effectiveWindowMs() - (nowMs() - stimulusOnsetMs));
  const timeTxt = fmtTemplate(STRINGS.hudTime, { t: fmtCountdown(remainingMs) });

  text(`${trialTxt}      ${timeTxt}`, width / 2, CONFIG.HUD_MARGIN_TOP);
}

/* ============================================================================
   9. TRIAL GENERATION
   Build the domain sequence first (exact switch count from the level's
   switch rate), then pick a box and a stimulus per trial so that exactly
   YES_RATIO of trials have 'yes' as the correct answer.
   ========================================================================== */
function generateTrialPool(level) {
  const n = CONFIG.TRIALS_PER_LEVEL;

  // --- 1-2. Domain sequence + per-trial switchType ---
  let domains, switchTypes;
  if (level.pureBlocks) {
    // Level 1: two equal PURE single-task blocks, no within-block switches.
    const half = Math.floor(n / 2);
    domains = [];
    for (let i = 0; i < n; i++) domains.push(i < half ? level.pureBlocks[0] : level.pureBlocks[1]);
    switchTypes = domains.map((d, i) => (i === 0 || i === half) ? 'first' : 'repeat');
  } else {
    // Levels 2-3: mixed block with an exact switch count from switchRate.
    const nSwitches = Math.round((n - 1) * level.switchRate);
    let switchFlags = [];
    for (let i = 0; i < n - 1; i++) switchFlags.push(i < nSwitches);
    switchFlags = shuffleArray(switchFlags);
    domains = [CONFIG.MIXED_START_DOMAIN];
    for (let i = 0; i < n - 1; i++) {
      const prev = domains[domains.length - 1];
      domains.push(switchFlags[i] ? (prev === 'number' ? 'color' : 'number') : prev);
    }
    switchTypes = domains.map((d, i) => i === 0 ? 'first' : (domains[i] !== domains[i - 1] ? 'switch' : 'repeat'));
  }

  // --- 3. Correct answers: exact yes/no split, shuffled ---
  const nYes = Math.round(n * CONFIG.YES_RATIO);
  let answers = [];
  for (let i = 0; i < n; i++) answers.push(i < nYes ? 'yes' : 'no');
  answers = shuffleArray(answers);

  // --- 4. Build each trial ---
  const pool = [];
  for (let i = 0; i < n; i++) {
    const domain = domains[i];
    const answer = answers[i];

    // Pick one of the two boxes of this domain at random
    const domainBoxes = BOXES.filter(b => b.taskDomain === domain);
    const box = domainBoxes[Math.floor(Math.random() * domainBoxes.length)];

    // Pick the stimulus so its relevant attribute matches/mismatches the box
    let stimulusNumber, stimulusColor;
    if (domain === 'number') {
      const wantedCat = (answer === 'yes') ? box.category : otherCategory(NUMBER_CATEGORIES, box.category);
      stimulusNumber = randomFrom(NUMBER_CATEGORIES[wantedCat]);
      stimulusColor = randomFrom(allColors());          // irrelevant dimension: fully random
    } else {
      const wantedCat = (answer === 'yes') ? box.category : otherCategory(COLOR_CATEGORIES, box.category);
      stimulusColor = randomFrom(COLOR_CATEGORIES[wantedCat]);
      stimulusNumber = Math.floor(Math.random() * 10);  // irrelevant dimension: fully random
    }

    // switchType (precomputed): pure blocks yield only 'first'/'repeat'; mixed
    // blocks yield 'first'/'switch'/'repeat' (Section 5.4 note)
    const switchType = switchTypes[i];

    pool.push({
      stimulusNumber, stimulusColor,
      stimulusPosition: box.position,
      taskDomain: domain,
      expectedCategory: box.category,
      correctResponse: answer,
      switchType
    });
  }
  return pool;   // order is meaningful (switch sequence) — do NOT shuffle
}

function otherCategory(categories, cat) {
  return Object.keys(categories).find(k => k !== cat);
}

function allColors() {
  return [...COLOR_CATEGORIES.warm, ...COLOR_CATEGORIES.cool];
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ============================================================================
   10. TRIAL FLOW
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

  sessionStartUtc = new Date().toISOString();
  sessionStartMonotonic = performance.now();
  trialLogs = [];
  csvSaved = false;
  totalStats = { correct: 0, incorrect: 0, timeout: 0 };
  levelIdx = 0;
  trialIdxGlobal = 0;

  if (pendingPhase === 'familiarization') startFamiliarization();
  else enterInstructions();
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

/* Trial exit point. response: 'yes' | 'no' | 'timeout'. */
function recordResponse(response) {
  if (responded) return;
  responded = true;

  const trial = trialPool[trialIdxLevel];
  const level = LEVELS[levelIdx];
  const windowMs = effectiveWindowMs();
  const isTimeout = response === 'timeout';

  const responseMs = isTimeout ? windowMs : Math.round(nowMs() - stimulusOnsetMs);
  const reactionTime = responseMs;         // Brain Shift: reactionTime = responseMs

  let result;
  if (isTimeout) result = 0;
  else result = (response === trial.correctResponse) ? 1 : -1;

  if (result === 1) { levelStats.correct++; totalStats.correct++; }
  else if (result === -1) { levelStats.incorrect++; totalStats.incorrect++; }
  else { levelStats.timeout++; totalStats.timeout++; }

  trialLogs.push({
    // --- Common per-trial fields (Section 0.10) ---
    level: level.id,
    trialIndexGlobal: trialIdxGlobal + 1,
    trialIndexLevel: trialIdxLevel + 1,
    trialStartMsFromSessionStart: Math.round(trialStartSessionMs),
    response: response,
    correctResponse: trial.correctResponse,
    result: result,
    responseMs: responseMs,
    reactionTime: reactionTime,
    anticipatoryResponse: (!isTimeout && reactionTime < CONFIG.ANTICIPATORY_THRESHOLD_MS) ? 1 : 0,
    // --- Brain Shift-specific fields (Section 5.7) ---
    stimulusNumber: trial.stimulusNumber,
    stimulusColor: trial.stimulusColor,
    stimulusPosition: trial.stimulusPosition,
    taskDomain: trial.taskDomain,
    expectedCategory: trial.expectedCategory,
    switchType: trial.switchType
  });

  if (famMode) famAfterResponse(result);
  else advanceTrial();
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
   11. INPUT HANDLERS — → = Yes, ← = No (Section 5.5)
   ========================================================================== */
function keyPressed() {
  // --- Familiarization input routing (Section 8) ---
  if (state === STATES.FAM_DEMO)     { if (key === ' ') famAdvanceDemo(); return; }
  if (state === STATES.FAM_MSG) {
    // The repeat offer uses on-screen buttons; only the practice intro takes SPACE.
    if (!famOfferRepeat && key === ' ') famStartPracticeBlock();
    return;
  }
  if (state === STATES.FAM_FEEDBACK) { famAfterFeedback(); return; }

  if (key === ' ') {
    if (state === STATES.INSTRUCTIONS) { startLevelFromInstructions(); return; }
    if (state === STATES.LEVEL_SUMMARY) { continueFromSummary(); return; }
  }

  if (state !== STATES.STIMULUS || responded) return;

  if (keyCode === RIGHT_ARROW) recordResponse('yes');
  else if (keyCode === LEFT_ARROW) recordResponse('no');
  // All other keys are ignored
}

/* ============================================================================
   12. LOGGING & CSV EXPORT
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
    ...(currentPhase === 'familiarization' ? [
      ['practiceAccuracyFinal', famPracticeTotal ? (famPracticeCorrect / famPracticeTotal).toFixed(3) : ''],
      ['famAttempts', famAttempt]
    ] : []),
    ['sessionStartUTC', sessionStartUtc],
    ['sessionDurationMs', sessionDurationMs],
    ['windowWidth', windowWidth],
    ['windowHeight', windowHeight],
    ['devicePixelRatio', window.devicePixelRatio],
    ['responseWindowsMs', CONFIG.RESPONSE_WINDOW_MS.join('/')],
    ['switchRates', CONFIG.SWITCH_RATE.join('/')],
    ['labelsVisible', LEVELS.map(l => l.labelsVisible ? 1 : 0).join('/')],   // per level; constant while labels are shown at every level
    ['itiMs', CONFIG.ITI_MS],
    ['trialsPerLevel', CONFIG.TRIALS_PER_LEVEL]
  ];

  // Familiarization CSVs keep only identity/summary metadata; the game
  // configuration belongs to the assessment file (Section 8.10).
  const FAM_META_KEEP = ['participantID', 'sessionID', 'game', 'phase',
    'practiceAccuracyFinal', 'famAttempts', 'sessionStartUTC', 'sessionDurationMs'];
  const metaOut = currentPhase === 'familiarization'
    ? metaRows.filter(r => FAM_META_KEEP.includes(r[0]))
    : metaRows;

  let rows = [];
  rows.push(['SESSION METADATA']);
  rows = rows.concat(metaOut);
  rows.push([]);
  rows.push(['TRIAL DATA']);

  // Union of keys across rows (robust to per-row field differences)
  const headers = [];
  for (const row of trialLogs) for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k);
  rows.push(headers);
  for (const log of trialLogs) rows.push(headers.map(h => log[h]));

  const csvText = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  saveFileToDisk(csvText, `${metaData.participantId}_${metaData.sessionId}_${CONFIG.GAME_NAME}${currentPhase === 'familiarization' ? '_familiarization' : ''}.csv`, 'text/csv');
  csvSaved = true;
}


/* ============================================================================
   FAMILIARIZATION ENGINE (CogGames_Documentation.docx Section 8)
   Flow: ALL rule demos first (self-paced, captioned), then ONE seamless
   practice run sampling every level in order (real generators, relaxed
   windows, immediate feedback; errors/timeouts also show the correct
   answer). 70% pass with an OFFERED repeat (Section 8.7). Only practice
   trials are logged (attemptNumber / feedbackShown, Section 8.10).
   ========================================================================== */

function famDoneKey(pid) { return `cogGamesFamDone_${CONFIG.GAME_NAME}_${pid}`; }
function famAlreadyDoneFor(pid) {
  return CONFIG.FAMILIARIZATION.RUN_ONCE_PER_PARTICIPANT && localStorage.getItem(famDoneKey(pid)) === '1';
}

/* Entry point — session vars were already initialized by onSubmitMetadata. */
function startFamiliarization() {
  famMode = true;
  famAttempt = 1;
  famPracticeCorrect = 0;
  famPracticeTotal = 0;
  famOfferRepeat = false;
  famPlan = buildFamPlan(true);
  famStepIdx = -1;
  showOnly('none');
  famNextStep();
}

function famNextStep() {
  famStepIdx++;
  if (famStepIdx >= famPlan.length) { famFinishAttempt(); return; }
  const step = famPlan[famStepIdx];
  levelIdx = step.level;
  if (step.type === 'demo') {
    famDemoIdx = 0;
    state = STATES.FAM_DEMO;
  } else {
    trialPool = famPracticePool(step);
    trialIdxLevel = 0;
    // Seamless practice: the intro appears once, before the first practice
    // step; later levels chain directly with no separator screens.
    if (famPlan.findIndex(s => s.type === 'practice') === famStepIdx) state = STATES.FAM_MSG;
    else famStartPracticeBlock();
  }
}

function famAdvanceDemo() {
  const step = famPlan[famStepIdx];
  famDemoIdx++;                        // demos are unscored and not logged
  if (famDemoIdx >= step.items.length) famNextStep();
}

function famStartPracticeBlock() {
  releaseFocus();
  
  beginIti();
}

/* Called from the trial-exit point instead of advanceTrial() while famMode. */
function famAfterResponse(result) {
  const row = trialLogs[trialLogs.length - 1];
  famFeedback = result;
  row.attemptNumber = famAttempt;
  row.feedbackShown = famFeedback === 1 ? 'correct' : (famFeedback === -1 ? 'incorrect' : 'timeout');
  famPracticeTotal++;
  if (result === 1) famPracticeCorrect++;
  famFbAt = nowMs();
  trialIdxGlobal++;                  // advanceTrial() is bypassed in famMode
  state = STATES.FAM_FEEDBACK;
}

function famAfterFeedback() {
  trialIdxLevel++;
  if (trialIdxLevel >= trialPool.length) famNextStep();
  else { beginIti(); }
}

function famFinishAttempt() {
  // EVERYONE gets the optional repeat offer (uniform experience; there is no
  // pass criterion — practiceAccuracyFinal is logged for screening, ungated).
  // Release any pointer lock and restore the cursor so the offer buttons are
  // usable (Memory Matrix hides the cursor during recall).
  if (document.pointerLockElement) document.exitPointerLock();
  cursor();
  famOfferRepeat = true;
  state = STATES.FAM_MSG;
  showOnly('famOffer');
}

function famAcceptRepeat() {
  famOfferRepeat = false;
  famAttempt++;
  famPracticeCorrect = 0;
  famPracticeTotal = 0;
  famPlan = buildFamPlan(false);     // practice blocks only on a repeat
  famStepIdx = -1;
  famNextStep();
}

/* Response window for the current trial. Familiarization uses ONE flat window
   per game (Section 8.9), deliberately not derived from the assessment ramp so
   that retuning a level never silently moves practice timing. */
function effectiveWindowMs() {
  return famMode ? CONFIG.FAMILIARIZATION.PRACTICE_WINDOW_MS
                 : LEVELS[levelIdx].responseWindowMs;
}

function famDone() {
  if (document.pointerLockElement) document.exitPointerLock();
  cursor();
  if (CONFIG.FAMILIARIZATION.RUN_ONCE_PER_PARTICIPANT) {
    try { localStorage.setItem(famDoneKey(metaData.participantId), '1'); } catch (e) {}
  }
  state = STATES.END;
  showOnly('end');
}

/* ---------- Familiarization screens ---------- */
function drawFamMsgScreen() {
  noStroke();
  fill(CONFIG.COLORS.ACCENT);
  textSize(26);
  textStyle(BOLD);
  text(famOfferRepeat ? STRINGS.famOfferRepeat : STRINGS.famPracticeIntro, width / 2, height / 2 - 40);
  textStyle(NORMAL);
  fill(CONFIG.COLORS.HUD);
  textSize(16);
  if (!famOfferRepeat) text(STRINGS.famPressSpace, width / 2, height / 2 + 120);
}

function drawFamFeedbackScreen() {
  const F = CONFIG.FAMILIARIZATION;
  const col = famFeedback === 1 ? CONFIG.COLORS.CORRECT
            : famFeedback === -1 ? CONFIG.COLORS.INCORRECT : CONFIG.COLORS.TIMEOUT;
  const label = famFeedback === 1 ? STRINGS.famFeedbackCorrect
              : famFeedback === -1 ? STRINGS.famFeedbackIncorrect : STRINGS.famFeedbackTimeout;
  // Feedback overlays the trial display itself — no separate page (Section 8.6)
  drawFamTrialUnderlay();
  noFill();
  stroke(col);
  strokeWeight(14);
  rect(width / 2, height / 2, width - 14, height - 14);
  noStroke();
  fill(col);
  textSize(32);
  textStyle(BOLD);
  text(label, width / 2, 46);
  textStyle(NORMAL);
  if (famFeedback !== 1) drawFamAnswerHint();   // errors/timeouts: show the correct response
  if (nowMs() - famFbAt >= (famFeedback === 1 ? F.FEEDBACK_MS : F.FEEDBACK_ANSWER_MS)) famAfterFeedback();
}

function drawFamDemoScreen() {
  const step = famPlan[famStepIdx];
  const item = step.items[famDemoIdx];
  drawFamDemoStimulus(item);
  // Caption card
  const capW = Math.min(width - 80, 860);
  noStroke();
  fill('#FFFFFF');
  stroke('#CED4DA');
  strokeWeight(2);
  rect(width / 2, height - 110, capW, 130, 14);
  noStroke();
  fill(CONFIG.COLORS.TEXT);
  textSize(19);
  text(item.caption, width / 2, height - 125);
  fill(CONFIG.COLORS.HUD);
  textSize(14);
  text(STRINGS.famPressSpace, width / 2, height - 62);
  // Demo tag
  fill(CONFIG.COLORS.ACCENT);
  textSize(16);
  textStyle(BOLD);
  text(fmtTemplate(STRINGS.famDemoTag, { i: fmtNum(famDemoIdx + 1), n: fmtNum(step.items.length) }), width / 2, 60);
  textStyle(NORMAL);
}

function drawFamEndScreen() {
  noStroke();
  fill(CONFIG.COLORS.ACCENT);
  textSize(34);
  textStyle(BOLD);
  text(STRINGS.famEndTitle, width / 2, height / 2 - 150);
  textStyle(NORMAL);
  fill(CONFIG.COLORS.CORRECT);
  textSize(20);
  text(STRINGS.famReadyLine, width / 2, height / 2 - 50);
  fill(CONFIG.COLORS.TIMEOUT);
  textSize(15);
  text(STRINGS.saveReminder, width / 2, height / 2 + 165);
}

/* ---------- Brain Shift: per-box demos, switch demo, no-labels demo ---------- */
function buildFamPlan(withDemos) {
  const F = CONFIG.FAMILIARIZATION;
  const demoDefs = [
    [ { card: 'categories',                                 caption: STRINGS.famDemos[0] },
      { n: 4, c: 'blue',   pos: 'topLeft',     labels: true, caption: STRINGS.famDemos[1] },
      { n: 7, c: 'green',  pos: 'topRight',    labels: true, caption: STRINGS.famDemos[2] },
      { n: 3, c: 'blue',   pos: 'bottomLeft',  labels: true, caption: STRINGS.famDemos[3] },
      { n: 8, c: 'green',  pos: 'bottomRight', labels: true, caption: STRINGS.famDemos[4] } ],
    [],
    []
  ];
  const plan = [];
  if (withDemos) {
    // All rule demos are shown upfront, before any practice (compact flow)
    const items = [];
    for (let l = 0; l < LEVELS.length; l++) items.push(...demoDefs[l].slice(0, F.DEMOS[l]));
    if (items.length) plan.push({ type: 'demo', level: 0, items });
  }
  for (let l = 0; l < LEVELS.length; l++) {
    const setL = famPracticeSet()[l];
    if (setL.length) plan.push({ type: 'practice', level: l, n: setL.length });
  }
  return plan;
}

/* ---------- FIXED practice sets (Section 8.3) ----------
   Every participant sees the SAME practice trials in the same order.
   Attempt 1 uses set A; an accepted repeat uses the next set (wrapping). */
function famT(num, color, position, domain, category, answer, switchType) {
  return { stimulusNumber: num, stimulusColor: color, stimulusPosition: position,
           taskDomain: domain, expectedCategory: category,
           correctResponse: answer, switchType: switchType };
}

const FAM_PRACTICE_SETS = [
  [ // set A — all 8 box x answer states exactly once across L1+L2
    [ famT(4, 'blue',   'topLeft',     'number', 'even', 'yes', 'first'),
      famT(8, 'red',    'topRight',    'number', 'odd',  'no',  'repeat'),
      famT(7, 'yellow', 'bottomRight', 'color',  'cool', 'no',  'first'),
      famT(3, 'orange', 'bottomLeft',  'color',  'warm', 'yes', 'repeat') ],
    [ famT(7, 'blue',   'bottomRight', 'color',  'cool', 'yes', 'first'),
      famT(3, 'green',  'topLeft',     'number', 'even', 'no',  'switch'),
      famT(5, 'red',    'topRight',    'number', 'odd',  'yes', 'repeat'),
      famT(8, 'purple', 'bottomLeft',  'color',  'warm', 'no',  'switch') ],
    []                                 // L3 adds no new rule (only switchRate 0.4 -> 0.6)
  ],
  [ // set B
    [ famT(6, 'red',    'topLeft',     'number', 'even', 'yes', 'first'),
      famT(2, 'green',  'topRight',    'number', 'odd',  'no',  'repeat'),
      famT(5, 'orange', 'bottomRight', 'color',  'cool', 'no',  'first'),
      famT(8, 'red',    'bottomLeft',  'color',  'warm', 'yes', 'repeat') ],
    [ famT(7, 'red',    'topLeft',     'number', 'even', 'no',  'first'),
      famT(4, 'blue',   'bottomRight', 'color',  'cool', 'yes', 'switch'),
      famT(6, 'green',  'bottomLeft',  'color',  'warm', 'no',  'repeat'),
      famT(9, 'orange', 'topRight',    'number', 'odd',  'yes', 'switch') ],
    []
  ]
];

function famPracticeSet() {
  return FAM_PRACTICE_SETS[(famAttempt - 1) % FAM_PRACTICE_SETS.length];
}

function famPracticePool(step) {
  return famPracticeSet()[step.level];
}

function drawFamDemoStimulus(item) {
  if (item.card === 'categories') { drawFamCategoriesCard(); return; }
  drawBoxes(item.labels, 1, height / 2 - 40);
  noStroke();
  fill(CONFIG.STIMULUS_COLORS[item.c]);
  textSize(CONFIG.DIGIT_TEXT_SIZE);
  textStyle(BOLD);
  const c = boxCenter(item.pos, 1, height / 2 - 40);
  text(fmtNum(item.n), c.x, c.y - 4);
  textStyle(NORMAL);
}

/* First demo card: the digit and color category sets used in the game. */
function drawFamCategoriesCard() {
  const cx = width / 2;
  const y0 = height / 2 - 210;
  noStroke();
  textStyle(BOLD);
  fill(CONFIG.COLORS.TEXT);
  textSize(30);
  text(STRINGS.famCatEven, cx, y0);
  text(STRINGS.famCatOdd, cx, y0 + 55);
  const rows = [
    { label: STRINGS.categoryLabels.warm, colors: ['red', 'orange', 'yellow'], y: y0 + 135 },
    { label: STRINGS.categoryLabels.cool, colors: ['blue', 'green', 'purple'], y: y0 + 200 }
  ];
  for (const r of rows) {
    textSize(26);
    fill(CONFIG.COLORS.TEXT);
    text(r.label, cx - 200, r.y);
    for (let i = 0; i < r.colors.length; i++) {
      fill(CONFIG.STIMULUS_COLORS[r.colors[i]]);
      ellipse(cx - 60 + i * 90, r.y, 42, 42);
    }
  }
  textStyle(NORMAL);
}

/* Correct-response hint for error/timeout feedback (Section 8.6). */
function drawFamAnswerHint() {
  const trial = trialPool[trialIdxLevel];
  noStroke();
  fill(CONFIG.COLORS.TEXT);
  textSize(26);
  textStyle(BOLD);
  text(fmtTemplate(STRINGS.famAnswerWas, { a: trial.correctResponse === 'yes' ? STRINGS.responseYes : STRINGS.responseNo }), width / 2, 92);
  textStyle(NORMAL);
}

/* The trial display shown underneath familiarization feedback. */
function drawFamTrialUnderlay() {
  const trial = trialPool[trialIdxLevel];
  drawBoxes(LEVELS[levelIdx].labelsVisible, 1, height / 2);
  drawStimulusDigit(trial);
  drawResponseLabels();
}

/* ============================================================================
   13. HELPERS
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