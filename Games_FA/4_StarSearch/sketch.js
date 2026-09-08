/* ============================================================================
   STAR SEARCH — Assessment Phase (Persian version)
   Project : Evaluation of Unconscious Effect of Music on Cognitive Functions
   Spec    : CogGames_Documentation.docx — Section 4 (+ Section 0 common spec)

   Cognitive function: Visual selective attention, Feature Integration Theory
   (Treisman & Gelade, 1980).

   The participant clicks the singleton — the one item that looks different
   from all the others. No cue is shown.
     L1 — Feature pop-out: unique color (half the trials) or unique shape
          (the other half), parallel search either way.
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
  RESPONSE_WINDOW_MS: [4000, 4000, 5000], // L2/L3 ran 3000/2000 ms in the pilot and produced 19%/61%
                                       // timeouts; L3 correct-trial RT came out FASTER than L2
                                       // (survivor bias from the deadline). L3 has double L2's item
                                       // count (41 vs 21) and conjunction search is serial, so it gets
                                       // extra time on top of L2's window rather than the same cap.
                                       // Difficulty is setSize + padding, not the clock.
  ANTICIPATORY_THRESHOLD_MS: 150,      // RT below this => anticipatoryResponse = 1

  // --- Mouse trajectory (Section 0.9) ---
  TRAJECTORY_SAMPLE_MS: 100,

  // --- Virtual cursor (Section 4.5) ---
  USE_POINTER_LOCK: true,              // 1:1 virtual cursor, recentred at every stimulus onset so the
                                       // cursor-to-target distance is drawn from the same distribution
                                       // on every trial. Without it the cursor starts wherever the last
                                       // click left it, folding motor travel time into RT as pure noise.
                                       // A page cannot move the OS pointer, so this needs Pointer Lock;
                                       // if the lock is refused the game degrades to the real cursor.
  CURSOR_SIZE: 16,                     // drawn virtual cursor size (px)

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
    CURSOR: '#212529',                 // virtual cursor (drawn only while the lock is held)
    CORRECT: '#2F9E44',
    INCORRECT: '#E03131',
    TIMEOUT: '#F08C00'
  },

  // --- Familiarization (CogGames_Documentation.docx Section 8) ---
  FAMILIARIZATION: {
    DEMOS: [2, 1, 0],          // demo steps per level (L1: color pop-out + shape pop-out)
    // Practice trials are FIXED, identical for every participant — see FAM_PRACTICE_SETS
    PRACTICE_WINDOW_MS: 5000,        // flat practice window, all levels — hardest practiced level is L2 (2400 ms floor)
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
  gameTitle: 'جستجوی ستاره',
  gameSubtitle: 'موردی را پیدا کنید و کلیک کنید که با بقیه فرق دارد',

  btnFamiliarization: 'آشنایی',
  btnAssessment: 'ارزیابی',

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
    'تعداد زیادی شکل روی صفحه ظاهر می‌شود.\n' +
    'دقیقاً «یکی» از آن‌ها با بقیه متفاوت است.\n' +
    'آن را پیدا کنید و هرچه سریع‌تر روی آن کلیک کنید.',
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
  btnSaveTrajectory: 'ذخیره داده ماوس (CSV)',
  btnReturnMenu: 'منوی اصلی',
  btnFamBackToMenu: 'بازگشت به منوی بازی',
  confirmLeaveUnsaved: 'نتایج هنوز ذخیره نشده‌اند. با این حال خارج می‌شوید؟',
  saveReminder: 'لطفاً پیش از بستن این پنجره هر دو فایل را ذخیره کنید.',

  // --- Familiarization (Section 8) ---
  famDemoTag: 'نمونه {i} از {n}',
  famPracticeIntro: 'تمرین',
  famOfferRepeat: 'می‌خواهید یک بار دیگر تمرین کنید؟',
  famAlreadyDone: 'این شرکت‌کننده قبلاً مرحلهٔ آشنایی این بازی را کامل کرده است. دوباره تکرار شود؟',
  famEndTitle: 'پایان مرحلهٔ آشنایی',
  famReadyLine: 'برای ارزیابی آماده‌اید.',
  famFeedbackCorrect: 'درست',
  famFeedbackIncorrect: 'نادرست',
  famFeedbackTimeout: 'دیر شد',
  famPressSpace: '(برای ادامه، کلید فاصله را فشار دهید)',
  famBtnRepeat: 'تمرین دوباره',
  famBtnContinue: 'ادامه',
  famAnswerHint: 'موردِ متفاوت با دایره مشخص شده است.',
  famDemos: [
    'دقیقاً یک مورد با بقیه فرق دارد\n(اینجا دورش خط کشیده شده). اینجا فقط «رنگ» آن یکتاست — سریع کلیک کنید.',
    'موردِ متفاوت می‌تواند در «شکل» فرق داشته باشد: هم‌رنگ\nهمهٔ موردهای دیگر، اما با شکلی متفاوت (اینجا مشخص شده).',
    'گاهی موردِ متفاوت هم‌رنگ بعضی و هم‌شکل بعضی دیگر است —\nفقط «ترکیبِ» آن یکتاست (اینجا مشخص شده). همان قانون: روی آن کلیک کنید.'
  ],
};

/* ============================================================================
   3. STIMULUS SETS — Section 4.2 (all colors are valid CSS color names)
   ========================================================================== */
/* Ten CATEGORICALLY distinct colors (piloting showed maroon/sienna and
   navy/slateblue were confusable: deltaE 26 and 35 in CIELAB). Every pair
   below has deltaE >= 44 and a different color name category, so the L1
   pop-out premise (large feature distance) holds for any random pairing.
   All names remain valid CSS colors and are logged as-is. */
const COLOR_SET = ['red', 'darkorange', 'gold', 'green', 'darkturquoise', 'royalblue', 'purple', 'deeppink', 'saddlebrown', 'dimgray'];
const SHAPE_SET = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'cross', 'ring', 'semicircle'];

/* ============================================================================
   4. LEVELS — level definitions (Section 4.3)
   distractorPairs: [d1Count, d2Count] options — one is picked per trial.
   d1 = same shape as target, different color (color singleton).
   d2 = same color as target, different shape (shape singleton).
   L1 balances its two options exactly 20/20 across the level (Section 4.3);
   L2/L3 pick randomly per trial among their listed options.
   ========================================================================== */
const LEVELS = [
  {
    id: 1, setSize: 21, paddingPx: 50,
    // [20,0] = color singleton (all distractors share the target's shape),
    // [0,20] = shape singleton (all distractors share the target's color).
    distractorPairs: [[20, 0], [0, 20]],
    placement: 'rejection',
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[0]
  },
  {
    id: 2, setSize: 21, paddingPx: 25,
    distractorPairs: [[10, 10], [11, 9], [12, 8], [13, 7]],
    placement: 'rejection',
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[1]
  },
  {
    id: 3, setSize: 41, paddingPx: 5,
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

// Per-trial timing (session-relative ms)
let trialStartSessionMs = 0;         // = fixation onset (trial start)
let stimulusOnsetMs = 0;
let fixationDurationMs = 0;
let trialEnded = false;
let vCursorX = 0, vCursorY = 0;      // virtual cursor position (Section 12)
let lockActiveAtStimulus = 0;        // was the lock actually held for this trial?
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

  /* Pointer Lock must never survive into a screen with DOM buttons: while it is
     held the OS pointer is hidden and the buttons cannot be clicked. Releasing
     it here — centrally, off the current state — covers every exit path out of
     the trial loop, including the ones familiarization takes. */
  if (pointerLockActive() && state !== STATES.FIXATION && state !== STATES.STIMULUS) {
    releaseCursorLock();
  }

  switch (state) {
    case STATES.MENU:          drawMenuScreen(); break;
    case STATES.METADATA:      drawMetadataScreen(); break;
    case STATES.INSTRUCTIONS:  drawInstructionsScreen(); break;
    case STATES.FIXATION:      drawFixationScreen(); break;
    case STATES.STIMULUS:      drawStimulusScreen(); break;
    case STATES.LEVEL_SUMMARY: drawSummaryScreen(); break;
    case STATES.END:           drawEndScreen(); break;
    case STATES.FAM_DEMO:      drawFamDemoScreen(); break;
    case STATES.FAM_MSG:       drawFamMsgScreen(); break;
    case STATES.FAM_FEEDBACK:  drawFamFeedbackScreen(); break;
  }

  // Only while locked: unlocked, the participant still has their real cursor and
  // a second drawn crosshair would just be confusing.
  if (state === STATES.STIMULUS && pointerLockActive()) drawVirtualCursor();
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
      ui.inPart.value(ls.participantId); ui.inSess.value(ls.sessionId);
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
  ui.btnSaveTraj = createButton(STRINGS.btnSaveTrajectory).class('game-btn');
  ui.btnSaveTraj.mousePressed(exportTrajectoryCSV);
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

  // Familiarization returns to THIS game's phase chooser, not the launcher.
  ui.btnFamBack = createButton(STRINGS.btnFamBackToMenu).class('game-btn');
  ui.btnFamBack.mousePressed(() => {
    if (trialLogs.length && !csvSaved && !confirm(STRINGS.confirmLeaveUnsaved)) return;
    returnToPhaseMenu();
  });

  layoutUI();
}

function layoutUI() {
  const cx = windowWidth / 2, cy = windowHeight / 2;

  ui.btnFamRepeat.size(200, 46);   ui.btnFamRepeat.position(cx - 210, cy + 40);
  ui.btnFamContinue.size(200, 46); ui.btnFamContinue.position(cx + 10, cy + 40);

  ui.btnFam.size(220, 46);       ui.btnFam.position(cx - 110, cy - 46);
  ui.btnAssess.size(220, 46);
  // Familiarization only runs in session 1; without it Assessment moves up.
  ui.btnAssess.position(cx - 110,
    CogGamesExperiment.familiarizationAllowed() ? cy + 10 : cy - 46);

  const labelX = cx - 230, inputX = cx - 60, rowH = 46;
  ui.lblPart.position(labelX, cy - 80);   ui.inPart.position(inputX, cy - 86);  ui.inPart.size(220, 22);
  ui.lblSess.position(labelX, cy - 80 + rowH);  ui.inSess.position(inputX, cy - 86 + rowH); ui.inSess.size(220, 22);
  ui.lblMusic.position(labelX, cy - 80 + rowH * 2); ui.inMusic.position(inputX, cy - 86 + rowH * 2); ui.inMusic.size(220, 22);
  ui.btnStartExp.size(160, 42);  ui.btnStartExp.position(cx - 80, cy + 24);

  ui.btnStartLevel.size(180, 46); ui.btnStartLevel.position(cx - 90, cy + 190);
  ui.btnContinue.size(180, 46);   ui.btnContinue.position(cx - 90, cy + 130);

  ui.btnSave.size(220, 46);       ui.btnSave.position(cx - 350, cy + 90);
  ui.btnSaveTraj.size(220, 46);   ui.btnSaveTraj.position(cx - 110, cy + 90);
  ui.btnReturn.size(220, 46);     ui.btnReturn.position(cx + 130, cy + 90);
  ui.btnFamBack.size(220, 46);    ui.btnFamBack.position(cx + 130, cy + 90);
}

function showOnly(group) {
  const all = ['btnFam', 'btnAssess', 'lblPart', 'inPart', 'lblSess', 'inSess',
               'lblMusic', 'inMusic', 'btnStartExp', 'btnStartLevel',
               'btnContinue', 'btnSave', 'btnSaveTraj', 'btnReturn', 'btnFamRepeat', 'btnFamContinue', 'btnFamBack'];
  for (const k of all) ui[k].hide();

  const groups = {
    menu: ['btnFam', 'btnAssess'],
    metadata: ['lblPart', 'inPart', 'lblSess', 'inSess', 'btnStartExp'],
    instructions: ['btnStartLevel'],
    summary: ['btnContinue'],
    end: ['btnSave', 'btnSaveTraj', 'btnReturn'],
    endFam: ['btnSave', 'btnSaveTraj', 'btnFamBack'],
    famOffer: ['btnFamRepeat', 'btnFamContinue'],
    none: []
  };
  for (const k of (groups[group] || [])) ui[k].show();

  // Protocol: familiarization runs once per participant, in session 1 only.
  if (group === 'menu' && !CogGamesExperiment.familiarizationAllowed()) ui.btnFam.hide();
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

  if (nowMs() - stimulusOnsetMs >= effectiveWindowMs()) {
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
   9. TRIAL GENERATION — balanced pool + placement (Sections 4.2/4.4/4.6)
   ========================================================================== */

/* Pre-generate 40 trial parameter sets with balanced coverage of target
   colors and shapes (each of the 10 colors and 10 shapes serves as the
   target exactly 4 times). L1 also balances color-singleton vs
   shape-singleton trials exactly 20/20. Shuffled once; drawn sequentially. */
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

  // L1: exact 20/20 color-singleton vs shape-singleton split (Section 4.3).
  // L2/L3: pick randomly per trial among their listed distractorPairs options.
  let pairAssignment = null;
  if (level.id === 1) {
    const half = n / 2;
    pairAssignment = shuffleArray([
      ...Array(half).fill(level.distractorPairs[0]),
      ...Array(half).fill(level.distractorPairs[1])
    ]);
  }

  const pool = [];
  for (let i = 0; i < n; i++) {
    const tColor = targetColors[i];
    const tShape = targetShapes[i];

    // d1: same shape as target, different color
    const d1Color = randomOther(COLOR_SET, tColor);
    // d2: same color as target, different shape (L2/L3 only)
    const d2Shape = randomOther(SHAPE_SET, tShape);

    const pair = pairAssignment
      ? pairAssignment[i]
      : level.distractorPairs[Math.floor(Math.random() * level.distractorPairs.length)];

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
/* Read Session Information stored once by the launcher (main.html) in
   sessionStorage (not localStorage — must not survive closing the tab) under
   'cogGamesSession'. Returns {participantId, sessionId} when both are present,
   else null so the game falls back to its own metadata form when opened
   standalone. The music condition is not stored: experiment.js derives it. */
function loadSessionFromStorage() {
  try {
    const s = JSON.parse(sessionStorage.getItem('cogGamesSession'));  // see main.html
    if (s && s.participantId && s.sessionId) return s;
  } catch (e) {}
  return null;
}

function onSubmitMetadata() {
  const p = ui.inPart.value().trim();
  const s = ui.inSess.value().trim();
  if (!p || !s) { metadataErrorMsg = STRINGS.metadataError; return; }

  // The condition is fixed by the session schedule and this participant's
  // game order (experiment.js). Familiarization is always run in silence.
  const m = (pendingPhase === 'familiarization')
    ? 'silence'
    : CogGamesExperiment.conditionLabelFor(p, s, CONFIG.GAME_NAME);

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

  if (pendingPhase === 'familiarization') {
    CogGamesExperiment.stopMusic();          // familiarization is always silent
    startFamiliarization();
  } else {
    // Resumes where this condition left off earlier in the same session.
    CogGamesExperiment.startMusic(p, s, CONFIG.GAME_NAME);
    enterInstructions();
  }
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
  if (famMode) famBuildItemsSeeded(trialPool[trialIdxLevel], level, 500 + famAttempt * 1000 + levelIdx * 100 + trialIdxLevel);
  else buildItems(trialPool[trialIdxLevel], level);
  /* Recentre before the array appears so every trial starts from the middle of
     the screen (Section 4.5). Requested opportunistically: browsers only grant
     the lock close to a user gesture, so mousePressed re-requests it if this
     misses. Until it is granted updateVirtualCursor tracks the real pointer and
     the recentring below is simply overwritten — the task still works. */
  if (CONFIG.USE_POINTER_LOCK && !pointerLockActive()) requestPointerLock();
  vCursorX = width / 2;
  vCursorY = height / 2;
  lockActiveAtStimulus = pointerLockActive() ? 1 : 0;

  stimulusOnsetMs = nowMs();           // timer starts at 0 here (Section 4.5)
  state = STATES.STIMULUS;
}

/* Trial exit. clickPos = {x, y} or null on timeout. */
function finishTrial(clickPos) {
  if (trialEnded) return;
  trialEnded = true;

  const trial = trialPool[trialIdxLevel];
  const level = LEVELS[levelIdx];
  const windowMs = effectiveWindowMs();
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
    // --- Star Search-specific fields (Section 4.8) ---
    // Per-trial, not per-level: L1 alternates colour and shape singletons
    // 20/20, and those are separate pop-out conditions (Section 4.8).
    // d1 = target's shape in another colour; d2 = target's colour in another
    // shape — so a zero count names the dimension the target is unique on.
    searchType: trial.d2Count === 0 ? 'feature_color'
              : trial.d1Count === 0 ? 'feature_shape'
              : 'conjunction',
    setSize: level.setSize,
    distractor1Item: trial.d1Count > 0 ? `${trial.d1Color}_${trial.targetShape}` : '',
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
    emptyClickCount: emptyClicks,
    pointerLockActive: lockActiveAtStimulus,
    // Common field (Section 0.10), kept last so the game-specific columns stay contiguous
    anticipatoryResponse: (!isTimeout && reactionTime < CONFIG.ANTICIPATORY_THRESHOLD_MS) ? 1 : 0
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
    beginFixation();                   // next trial starts with its fixation
  }
}

function continueFromSummary() {
  releaseFocus();
  levelIdx++;
  if (levelIdx >= LEVELS.length) {
    CogGamesExperiment.stopMusic();   // music is bound to the assessment only
    state = STATES.END;
    showOnly('end');
    exportCSV();                      // saved automatically; button re-saves
  } else {
    enterInstructions();
  }
}

/* ============================================================================
   11. INPUT HANDLERS
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
}

function mousePressed() {
  if (state !== STATES.STIMULUS || trialEnded) return;
  /* Only a click ON an item ends the trial. Background clicks are motor
     noise (worst in the crowded L3 display), not search failures — ending
     the trial on them would mix pointing precision into the attention
     measure. They are tallied in emptyClickCount instead. */
  if (CONFIG.USE_POINTER_LOCK && !pointerLockActive()) requestPointerLock();
  if (itemAt(cursorX(), cursorY()) === null) { emptyClicks++; return; }
  finishTrial({ x: cursorX(), y: cursorY() });
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
    ['fixationJitterMs', `${CONFIG.FIXATION_MIN_MS}-${CONFIG.FIXATION_MAX_MS}`],
    ['itemSizePx', CONFIG.ITEM_SIZE],
    ['trialsPerLevel', CONFIG.TRIALS_PER_LEVEL],
    ['pointerLockUsed', CONFIG.USE_POINTER_LOCK ? 1 : 0]
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

function exportTrajectoryCSV() {
  if (!trajectoryLogs.length) return;

  const headers = ['trialIndexGlobal', 'timestampMs', 'mouseX', 'mouseY'];
  let rows = [headers];
  for (const p of trajectoryLogs) rows.push(headers.map(h => p[h]));

  const csvText = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  saveFileToDisk(csvText,
    `${metaData.participantId}_${metaData.sessionId}_${CONFIG.GAME_NAME}${currentPhase === 'familiarization' ? '_familiarization' : ''}_mouseTrajectory.csv`,
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
    mouseX: Math.round(cursorX()),
    mouseY: Math.round(cursorY())
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
   FAMILIARIZATION ENGINE (CogGames_Documentation.docx Section 8)
   Flow: ALL rule demos first (self-paced, captioned), then ONE seamless
   practice run sampling every level in order (real generators, one flat
   practice window, immediate feedback; errors/timeouts also show the correct
   answer). The repeat is offered to everyone (Section 8.7). Only practice
   trials are logged; every attempt replays the whole set, so attempt blocks
   are equal-length and their boundaries follow from trialIndexGlobal and
   famAttempts (Section 8.10).
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
  
  beginFixation();
}

/* Called from the trial-exit point instead of advanceTrial() while famMode. */
function famAfterResponse(result) {
  famFeedback = result;
  famPracticeTotal++;
  if (result === 1) famPracticeCorrect++;
  famFbAt = nowMs();
  trialIdxGlobal++;                  // advanceTrial() is bypassed in famMode
  state = STATES.FAM_FEEDBACK;
}

function famAfterFeedback() {
  trialIdxLevel++;
  if (trialIdxLevel >= trialPool.length) famNextStep();
  else { beginFixation(); }
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
  showOnly('endFam');
  exportCSV();                        // saved automatically; button re-saves
}
/* Back to this game's phase chooser (Familiarization / Assessment) after the
   practice run. Nothing reloads the page here, so every flag the practice run
   set has to be cleared by hand — famMode above all, or a subsequent
   Assessment would keep using practice windows and keep routing responses
   through famAfterResponse() instead of advanceTrial(). */
function returnToPhaseMenu() {
  famMode = false;
  famOfferRepeat = false;
  famPlan = [];
  famStepIdx = 0;
  famDemoIdx = 0;
  famAttempt = 1;
  famPracticeCorrect = 0;
  famPracticeTotal = 0;
  famFeedback = 0;
  trialLogs = [];
  csvSaved = false;
  currentPhase = null;
  pendingPhase = 'assessment';
  state = STATES.MENU;
  showOnly('menu');
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

/* ---------- Star Search: singleton demo + seamless per-level practice ---------- */
function buildFamPlan(withDemos) {
  const F = CONFIG.FAMILIARIZATION;
  const plan = [];
  if (withDemos) {
    // Every search kind is demonstrated: both pop-out types (unique color, then
    // unique shape — the assessment splits L1 20/20 between them) and then
    // conjunction. DEMOS[l] caps how many cards level l contributes.
    const items = [];
    const shown = [0, 0, 0];
    for (let i = 0; i < FAM_DEMO_LEVELS.length; i++) {
      const dl = FAM_DEMO_LEVELS[i];
      if (shown[dl] >= F.DEMOS[dl]) continue;
      shown[dl]++;
      items.push({ demoIdx: i, demoLevel: dl, ring: true, caption: STRINGS.famDemos[i] });
    }
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
function famT(targetColor, targetShape, d1Color, d2Shape, d1Count, d2Count) {
  return { targetColor: targetColor, targetShape: targetShape,
           d1Color: d1Color, d2Shape: d2Shape, d1Count: d1Count, d2Count: d2Count };
}

/* L1 practice covers BOTH pop-out kinds, matching the assessment's 20/20
   split: [20,0] = colour singleton (distractors share the target's shape),
   [0,20] = shape singleton (distractors share the target's colour). The two
   sets present them in opposite order. */
const FAM_PRACTICE_SETS = [
  [ // set A — colour singleton, shape singleton, then 2 conjunction
    [ famT('red', 'circle', 'royalblue', 'square', 20, 0),
      famT('gold', 'square', 'purple', 'circle', 0, 20) ],
    [ famT('green', 'circle', 'red', 'square', 12, 8),
      famT('purple', 'diamond', 'darkturquoise', 'ring', 12, 8) ], []
  ],
  [ // set B — shape singleton first, then colour singleton
    [ famT('green', 'diamond', 'deeppink', 'circle', 0, 20),
      famT('darkturquoise', 'hexagon', 'red', 'circle', 20, 0) ],
    [ famT('gold', 'pentagon', 'green', 'square', 12, 8),
      famT('saddlebrown', 'ring', 'royalblue', 'diamond', 12, 8) ], []
  ]
];

/* Fixed demo displays (identical for every participant), in card order:
   L1 unique-COLOR pop-out, L1 unique-SHAPE pop-out, then L2 conjunction.
   FAM_DEMO_LEVELS[i] is the level whose geometry card i borrows. */
const FAM_DEMO_LEVELS = [0, 0, 1];
const FAM_DEMO_TRIALS = {
  0: famT('deeppink', 'circle', 'dimgray', 'square', 20, 0),      // only its COLOR differs
  1: famT('darkorange', 'triangle', 'dimgray', 'circle', 0, 20),  // only its SHAPE differs
  2: famT('royalblue', 'diamond', 'saddlebrown', 'hexagon', 12, 8)
};

/* Deterministic RNG (mulberry32): familiarization displays must be
   IDENTICAL for every participant, including item positions. */
function famSeededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Build a display with both RNGs (p5 + Math.random) seeded, then restore. */
function famBuildItemsSeeded(trial, level, seed) {
  const realRandom = Math.random;
  Math.random = famSeededRandom(seed);
  randomSeed(seed);                        // p5 random() drives item coordinates
  try { buildItems(trial, level); }
  finally {
    Math.random = realRandom;
    randomSeed(Math.floor(realRandom() * 2147483647));   // back to unpredictable
  }
}

function famPracticeSet() {
  return FAM_PRACTICE_SETS[(famAttempt - 1) % FAM_PRACTICE_SETS.length];
}

function famPracticePool(step) {
  return famPracticeSet()[step.level];
}

/* Correct-response hint: the display again with the singleton circled. */
function drawFamAnswerHint() {
  const t = items.find(it => it.isTarget);
  if (t) {
    noFill();
    stroke(CONFIG.COLORS.ACCENT);
    strokeWeight(4);
    ellipse(t.x, t.y, CONFIG.ITEM_SIZE * 1.9, CONFIG.ITEM_SIZE * 1.9);
  }
  noStroke();
  fill(CONFIG.COLORS.HUD);
  textSize(18);
  text(STRINGS.famAnswerHint, width / 2, height - 40);
}

/* The trial display shown underneath familiarization feedback. */
function drawFamTrialUnderlay() {
  for (const it of items) drawItem(it);              // the search display stays up
}

function drawFamDemoStimulus(item) {
  if (!item._built) {                               // build the display once
    const lv = LEVELS[item.demoLevel];
    const prevBottom = CONFIG.FIELD_MARGIN_BOTTOM;
    CONFIG.FIELD_MARGIN_BOTTOM = 210;               // keep items clear of the caption card
    famBuildItemsSeeded(FAM_DEMO_TRIALS[item.demoIdx], lv, 90 + item.demoIdx);
    CONFIG.FIELD_MARGIN_BOTTOM = prevBottom;
    item._built = true;
  }
  for (const it of items) drawItem(it);
  if (item.ring) {                                   // circle the singleton
    const t = items.find(it => it.isTarget);
    noFill();
    stroke(CONFIG.COLORS.ACCENT);
    strokeWeight(4);
    ellipse(t.x, t.y, CONFIG.ITEM_SIZE * 1.9, CONFIG.ITEM_SIZE * 1.9);
  }
}

/* ============================================================================
   14. HELPERS
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
   one NaN would otherwise poison the position (NaN + x = NaN) until unlock. */
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

/* Hand the pointer back to the participant (DOM buttons need it). */
function releaseCursorLock() {
  if (document.pointerLockElement) document.exitPointerLock();
  cursor();
}

/* Draw the virtual cursor while the OS pointer is hidden by the lock. A white
   underlay keeps it visible against dark items in the crowded L3 display. */
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

/* Random element of `set` different from `exclude`. */
function randomOther(set, exclude) {
  const options = set.filter(v => v !== exclude);
  return options[Math.floor(Math.random() * options.length)];
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