/* ============================================================================
   CHALKBOARD CHALLENGE — Assessment Phase (Persian version)
   Project : Evaluation of Unconscious Effect of Music on Cognitive Functions
   Spec    : CogGames_Documentation.docx — Section 6 (+ Section 0 common spec)

   Cognitive function: Mental arithmetic, numerical processing, executive
   function.

   Two arithmetic expressions appear side by side. The participant judges
   which produces the larger value:
     ← = left is larger   |   → = right is larger
   Operator precedence applies (× ÷ before + −); expressions are shown
   as-is and participants must apply precedence themselves.

   Difficulty is controlled by the diffRatio band:
     diffRatio = |leftValue − rightValue| / max(leftValue, rightValue)
   Smaller ratio → values are proportionally closer → harder to judge.

   File layout:
     1. CONFIG            — every tunable parameter
     2. STRINGS           — every user-visible text (translate here only)
     3. LEVELS            — ranges, operators, terms, diffRatio bands
     4. STATES            — state machine constants
     5. RUNTIME STATE     — mutable session/trial variables
     6. p5 LIFECYCLE      — setup / draw / windowResized
     7. SCREENS           — menu, metadata, instructions, summary, end
     8. EXPRESSION ENGINE — generation + precedence-aware evaluation
     9. TRIAL GENERATION  — rejection-sampled pool of 40 (Section 6.4)
    10. TRIAL FLOW        — ITI → stimulus → response/timeout → log
    11. INPUT HANDLERS    — ←/→ keys
    12. LOGGING & EXPORT  — common + Chalkboard-specific fields
    13. HELPERS           — shuffle, formatting, DOM utilities
   ========================================================================== */

/* ============================================================================
   1. CONFIG — all tunable parameters
   ========================================================================== */
const CONFIG = {
  GAME_NAME: 'chalkboardChallenge',    // short camelCase id used in logs/filenames
  INPUT_DEVICE: 'keyboard_arrow',       // reported in session metadata (Section 0.10)

  // --- Trial structure (Sections 0.3 / 6.6) ---
  TRIALS_PER_LEVEL: 40,
  LEFT_LARGER_RATIO: 0.5,              // fraction of trials where LEFT is the larger side

  // --- Timing (Sections 0.5 / 0.6 / 6.6) ---
  ITI_MS: 150,
  RESPONSE_WINDOW_MS: [6000, 5000, 4000], // L1 / L2 / L3
  ANTICIPATORY_THRESHOLD_MS: 150,

  // --- Expression generation guards ---
  MIN_EXPR_VALUE: 1,                   // every expression must evaluate to at least this
  MAX_MULT_PER_EXPR: 1,                // at most one × per expression (keeps mental load sane)
  MAX_DIV_PER_EXPR: 1,                 // at most one ÷ per expression
  GEN_MAX_ATTEMPTS: 8000,              // rejection-sampling cap per trial
  L3_FALLBACK_AFTER: 2500,             // attempts before widening the L3 band (Section 6.2 note)
  L3_FALLBACK_BAND: [0.10, 0.18],      // widened L3 band

  // --- Expression rendering ---
  EXPR_TEXT_SIZE: 40,
  EXPR_CARD_W: 380,
  EXPR_CARD_H: 150,
  EXPR_CARD_GAP: 90,

  // --- HUD (Section 0.7) ---
  HUD_TEXT_SIZE: 18,
  HUD_MARGIN_TOP: 28,

  // --- Colors (visual theme; both sides identical for validity) ---
  COLORS: {
    BG: '#F4F6F8',
    TEXT: '#212529',
    ACCENT: '#3B5BDB',
    HUD: '#37474F',
    CARD_BG: '#3B5BDB',                // cheerful indigo cards (matches the game theme)
    CARD_TEXT: '#F8F9FA',              // chalk-like light text
    CARD_BORDER: '#364FC7',
    VS: '#868E96',
    KEY_HINT: '#495057',
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
  gameTitle: 'چالش تخته‌سیاه',
  gameSubtitle: 'کدام طرف مقدار بزرگ‌تری دارد؟',

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
    'دو محاسبه در دو طرف صفحه ظاهر می‌شود.\n' +
    'تشخیص دهید کدام‌یک نتیجهٔ «بزرگ‌تری» دارد.\n' +
    ' راست بزرگ‌تر است = →         ← = چپ بزرگ‌تر است ',
  // Precedence reminders — shown only at levels whose operators need them
  precedenceNoteMult: 'یادآوری: × پیش از + و − محاسبه می‌شود.',
  precedenceNoteMultDiv: 'یادآوری: × و ÷ پیش از + و − محاسبه می‌شوند.',
  btnStartLevel: 'شروع مرحله',
  pressSpaceToStart: '(یا کلید فاصله را فشار دهید)',

  // Trial UI
  vsLabel: '؟',
  keyHintLeft: '← چپ',
  keyHintRight: 'راست →',

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
  saveReminder: 'لطفاً پیش از بستن این پنجره نتایج را ذخیره کنید.',

  // Display symbols for operators (logs always use ASCII: + - * /)
  opSymbols: { '+': '+', '-': '−', '*': '×', '/': '÷' }
};

/* ============================================================================
   3. LEVELS — level definitions (Section 6.2)
   termsPerSide: options for the number of operands on each side
   (picked independently per side per trial).
   ========================================================================== */
const LEVELS = [
  {
    id: 1,
    operators: ['+', '-'],
    termsPerSide: [2],
    addendRange: [1, 50],              // operands for + and −
    diffRatioBand: [0.30, 0.60],
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[0]
  },
  {
    id: 2,
    operators: ['+', '-', '*'],
    termsPerSide: [2, 3],              // "2 and 2, or 3" (Section 6.2)
    addendRange: [1, 50],
    multBigRange: [1, 50],             // one × factor
    multSmallRange: [2, 9],            // the other × factor
    diffRatioBand: [0.15, 0.30],
    responseWindowMs: CONFIG.RESPONSE_WINDOW_MS[1]
  },
  {
    id: 3,
    operators: ['+', '-', '*', '/'],
    termsPerSide: [3],
    addendRange: [1, 50],
    multBigRange: [1, 50],
    multSmallRange: [2, 9],
    divisorRange: [2, 9],              // ÷ generation per Section 6.3
    diffRatioBand: [0.10, 0.15],
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
  text(`${STRINGS.levelLabel} ${fmtNum(level.id)} ${STRINGS.ofLabel} ${fmtNum(LEVELS.length)}`, width / 2, height / 2 - 200);
  textStyle(NORMAL);

  fill(CONFIG.COLORS.TEXT);
  textSize(CONFIG.INSTRUCTION_TEXT_SIZE);
  text(STRINGS.instructionsCommon, width / 2, height / 2 - 90);

  // Precedence reminder only at levels that actually use × (and ÷)
  if (level.operators.includes('*')) {
    fill(CONFIG.COLORS.ACCENT);
    textSize(19);
    const note = level.operators.includes('/') ? STRINGS.precedenceNoteMultDiv : STRINGS.precedenceNoteMult;
    text(note, width / 2, height / 2 + 10);
  }

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
  drawExpressionCards(trial);
  drawHUD(true);

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

/* ---------- Expression cards (chalkboard style) ---------- */
function drawExpressionCards(trial) {
  const cy = height / 2;
  const dx = (CONFIG.EXPR_CARD_W + CONFIG.EXPR_CARD_GAP) / 2;

  for (const side of ['left', 'right']) {
    const cx = side === 'left' ? width / 2 - dx : width / 2 + dx;
    stroke(CONFIG.COLORS.CARD_BORDER);
    strokeWeight(3);
    fill(CONFIG.COLORS.CARD_BG);
    rect(cx, cy, CONFIG.EXPR_CARD_W, CONFIG.EXPR_CARD_H, 16);

    noStroke();
    fill(CONFIG.COLORS.CARD_TEXT);
    textSize(CONFIG.EXPR_TEXT_SIZE);
    textStyle(BOLD);
    const expr = side === 'left' ? trial.leftExpr : trial.rightExpr;
    drawingContext.direction = 'ltr';   // arithmetic reads left-to-right
    text(displayExpr(expr), cx, cy - 2);
    drawingContext.direction = 'rtl';
    textStyle(NORMAL);
  }

  // Separator + key hints
  noStroke();
  fill(CONFIG.COLORS.VS);
  textSize(44);
  textStyle(BOLD);
  text(STRINGS.vsLabel, width / 2, cy);
  textStyle(NORMAL);

  fill(CONFIG.COLORS.KEY_HINT);
  textSize(18);
  text(STRINGS.keyHintLeft, width / 2 - dx, cy + CONFIG.EXPR_CARD_H / 2 + 36);
  text(STRINGS.keyHintRight, width / 2 + dx, cy + CONFIG.EXPR_CARD_H / 2 + 36);
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
   8. EXPRESSION ENGINE
   An expression is { terms: [numbers], ops: [operators] } with
   ops.length === terms.length - 1.
   ========================================================================== */

/* Generate one random expression for the level.
   Constraints:
   - at most MAX_MULT_PER_EXPR × and MAX_DIV_PER_EXPR ÷ per expression;
   - × and ÷ are never adjacent (in either order): adjacent high-precedence
     operators share an operand, so one would overwrite the other's operand
     and break the integer-division guarantee of Section 6.3;
   - × gets one factor from multBigRange and one from multSmallRange;
   - ÷ operands come from the Section 6.3 algorithm (integer result,
     1–2 digit dividend). */
function generateExpression(level, nTerms) {
  const ops = [];
  let multUsed = 0, divUsed = 0;

  for (let i = 0; i < nTerms - 1; i++) {
    const allowed = level.operators.filter(op => {
      if (op === '*') return multUsed < CONFIG.MAX_MULT_PER_EXPR && (i === 0 || ops[i - 1] !== '/');
      if (op === '/') return divUsed < CONFIG.MAX_DIV_PER_EXPR && (i === 0 || (ops[i - 1] !== '*' && ops[i - 1] !== '/'));
      return true;
    });
    const op = allowed[Math.floor(Math.random() * allowed.length)];
    if (op === '*') multUsed++;
    if (op === '/') divUsed++;
    ops.push(op);
  }

  // Fill operands respecting the operator that binds them
  const terms = new Array(nTerms);
  for (let i = 0; i < nTerms; i++) terms[i] = randInt(level.addendRange[0], level.addendRange[1]);

  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '*') {
      // One factor big, one small; random orientation
      const big = randInt(level.multBigRange[0], level.multBigRange[1]);
      const small = randInt(level.multSmallRange[0], level.multSmallRange[1]);
      if (Math.random() < 0.5) { terms[i] = big; terms[i + 1] = small; }
      else { terms[i] = small; terms[i + 1] = big; }
    } else if (ops[i] === '/') {
      // Section 6.3: divisor ∈ [2,9], dividend = divisor × quotient (1–2 digits)
      const divisor = randInt(level.divisorRange[0], level.divisorRange[1]);
      const maxQ = Math.floor(99 / divisor);
      const minQ = Math.max(1, Math.ceil(2 / divisor));
      const quotient = randInt(minQ, maxQ);
      terms[i] = divisor * quotient;   // dividend (left operand of ÷)
      terms[i + 1] = divisor;
    }
  }

  return { terms, ops };
}

/* Evaluate with standard precedence: × ÷ first (left→right), then + −. */
function evaluateExpression(expr) {
  // Pass 1: collapse × and ÷
  const terms = [...expr.terms];
  const ops = [...expr.ops];
  for (let i = 0; i < ops.length; ) {
    if (ops[i] === '*' || ops[i] === '/') {
      const v = ops[i] === '*' ? terms[i] * terms[i + 1] : terms[i] / terms[i + 1];
      terms.splice(i, 2, v);
      ops.splice(i, 1);
    } else i++;
  }
  // Pass 2: + and − left to right
  let value = terms[0];
  for (let i = 0; i < ops.length; i++) {
    value = ops[i] === '+' ? value + terms[i + 1] : value - terms[i + 1];
  }
  return value;
}

/* ASCII form for logs, e.g. "12 + 7 * 3" (Section 6.7). */
function exprToLogString(expr) {
  let s = String(expr.terms[0]);
  for (let i = 0; i < expr.ops.length; i++) s += ` ${expr.ops[i]} ${expr.terms[i + 1]}`;
  return s;
}

/* Pretty form for display, e.g. "12 + 7 × 3". */
function displayExpr(expr) {
  let s = fmtNum(expr.terms[0]);
  for (let i = 0; i < expr.ops.length; i++) {
    s += ` ${STRINGS.opSymbols[expr.ops[i]]} ${fmtNum(expr.terms[i + 1])}`;
  }
  return s;
}

/* ============================================================================
   9. TRIAL GENERATION — rejection-sampled pool (Section 6.4)
   Candidate pairs are accepted only when both values are valid and the
   diffRatio falls in the level's band. The larger side is then swapped to
   match a pre-balanced left/right answer sequence (exact 50/50).
   ========================================================================== */
function generateTrialPool(level) {
  const n = CONFIG.TRIALS_PER_LEVEL;

  // Pre-balanced correct-answer sides
  const nLeft = Math.round(n * CONFIG.LEFT_LARGER_RATIO);
  let sides = [];
  for (let i = 0; i < n; i++) sides.push(i < nLeft ? 'left' : 'right');
  sides = shuffleArray(sides);

  const pool = [];
  for (let i = 0; i < n; i++) {
    pool.push(generateTrial(level, sides[i]));
  }
  return shuffleArray(pool);
}

function generateTrial(level, largerSide) {
  let band = level.diffRatioBand;

  for (let attempt = 1; attempt <= CONFIG.GEN_MAX_ATTEMPTS; attempt++) {
    // L3 fallback: widen the band if the narrow one is too slow (Section 6.2)
    if (level.id === 3 && attempt === CONFIG.L3_FALLBACK_AFTER) {
      band = CONFIG.L3_FALLBACK_BAND;
    }

    const nA = level.termsPerSide[Math.floor(Math.random() * level.termsPerSide.length)];
    const nB = level.termsPerSide[Math.floor(Math.random() * level.termsPerSide.length)];
    let exprA = generateExpression(level, nA);
    let exprB = generateExpression(level, nB);
    const valA = evaluateExpression(exprA);
    const valB = evaluateExpression(exprB);

    // Guards: positive integer values, never equal
    if (valA < CONFIG.MIN_EXPR_VALUE || valB < CONFIG.MIN_EXPR_VALUE) continue;
    if (valA === valB) continue;

    const diffRatio = Math.abs(valA - valB) / Math.max(valA, valB);
    if (diffRatio < band[0] || diffRatio > band[1]) continue;

    // Assign the larger expression to the requested side (keeps 50/50 balance)
    let leftExpr, rightExpr, leftValue, rightValue;
    if ((valA > valB) === (largerSide === 'left')) {
      leftExpr = exprA; leftValue = valA; rightExpr = exprB; rightValue = valB;
    } else {
      leftExpr = exprB; leftValue = valB; rightExpr = exprA; rightValue = valA;
    }

    return {
      leftExpr, rightExpr, leftValue, rightValue,
      diffRatio: +diffRatio.toFixed(4),
      correctResponse: largerSide
    };
  }

  // Should never happen — bands are permissive enough. Emergency fallback:
  // a trivial unequal pair, so the session can continue.
  const a = randInt(10, 40), b = a + 15;
  return {
    leftExpr: { terms: [largerSide === 'left' ? b : a, 1], ops: ['+'] },
    rightExpr: { terms: [largerSide === 'left' ? a : b, 1], ops: ['+'] },
    leftValue: (largerSide === 'left' ? b : a) + 1,
    rightValue: (largerSide === 'left' ? a : b) + 1,
    diffRatio: 0,
    correctResponse: largerSide
  };
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

/* Trial exit point. response: 'left' | 'right' | 'timeout'. */
function recordResponse(response) {
  if (responded) return;
  responded = true;

  const trial = trialPool[trialIdxLevel];
  const level = LEVELS[levelIdx];
  const windowMs = level.responseWindowMs;
  const isTimeout = response === 'timeout';

  const responseMs = isTimeout ? windowMs : Math.round(nowMs() - stimulusOnsetMs);
  const reactionTime = responseMs;         // Chalkboard: reactionTime = responseMs

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
    // --- Chalkboard-specific fields (Section 6.7) ---
    leftExpr: exprToLogString(trial.leftExpr),
    rightExpr: exprToLogString(trial.rightExpr),
    leftValue: trial.leftValue,
    rightValue: trial.rightValue,
    diffRatio: trial.diffRatio,
    operators: collectOperators(trial),
    nTermsLeft: trial.leftExpr.terms.length,
    nTermsRight: trial.rightExpr.terms.length,
    hasPrecedence: hasPrecedence(trial) ? 1 : 0
  });

  advanceTrial();
}

/* Unique operators across both expressions, canonical order (Section 6.7). */
function collectOperators(trial) {
  const present = new Set([...trial.leftExpr.ops, ...trial.rightExpr.ops]);
  return ['+', '-', '*', '/'].filter(op => present.has(op)).join(',');
}

/* 1 if × (or ÷) coexists with + or − within the same expression. */
function hasPrecedence(trial) {
  const check = expr => {
    const hasHigh = expr.ops.some(op => op === '*' || op === '/');
    const hasLow = expr.ops.some(op => op === '+' || op === '-');
    return hasHigh && hasLow;
  };
  return check(trial.leftExpr) || check(trial.rightExpr);
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
   11. INPUT HANDLERS — ← = left larger, → = right larger (Section 6.5)
   ========================================================================== */
function keyPressed() {
  if (key === ' ') {
    if (state === STATES.INSTRUCTIONS) { startLevelFromInstructions(); return; }
    if (state === STATES.LEVEL_SUMMARY) { continueFromSummary(); return; }
  }

  if (state !== STATES.STIMULUS || responded) return;

  if (keyCode === LEFT_ARROW) recordResponse('left');
  else if (keyCode === RIGHT_ARROW) recordResponse('right');
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
    ['sessionStartUTC', sessionStartUtc],
    ['sessionDurationMs', sessionDurationMs],
    ['windowWidth', windowWidth],
    ['windowHeight', windowHeight],
    ['devicePixelRatio', window.devicePixelRatio],
    ['responseWindowsMs', CONFIG.RESPONSE_WINDOW_MS.join('/')],
    ['diffRatioBands', LEVELS.map(l => l.diffRatioBand.join('-')).join('/')],
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
   13. HELPERS
   ========================================================================== */
function nowMs() {
  return performance.now() - sessionStartMonotonic;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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