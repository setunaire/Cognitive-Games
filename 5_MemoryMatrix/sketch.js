/* =========================================================
   Memory Matrix Task – PROTOTYPE
   =========================================================
   Levels:
     1 – 3x3 grid, 3 targets, visual+text feedback, self-paced (15s timeout), confirm button
     2 – 4x4 grid, 5 targets, text feedback, 300ms blank, 10s timeout
     3 – 5x5 grid, 7 targets, text feedback, no blank, 10s timeout
   =========================================================
*/

/* ==================== CONFIG ==================== */

const CANVAS_BG = 'rgb(235,235,235)';

const FIXATION_MIN = 500;
const FIXATION_MAX = 1000;
const FEEDBACK_DURATION = 1500;
const POST_RESPONSE_DELAY = 250;

const TOTAL_LEVELS = 3;
const TRIALS_PER_LEVEL = 10;

// Grid & UI Dimensions
const MAX_GRID_PIXELS = 400; // Max width/height of the grid
// const FIXATION_SIZE = 60;
const FEEDBACK_SIZE = 30;
const INSTRUCTION_SIZE = 30;

// Colors
const COLOR_STIMULUS = '#333333';
const COLOR_SELECTED = '#007bff';
const COLOR_HIT = '#28a745';         
const COLOR_FALSE_ALARM = '#dc3545';
const COLOR_MISS = '#ffc107';       
const COLOR_TILE_BG = '#cccccc';

// LEVEL INSTRUCTIONS
const levelInstructions = [
`Level 1

You will see a 3x3 grid.
Some tiles will turn dark. Remember their positions.
When the grid clears, click the tiles you remember.
Click the CONFIRM button when you are done.

Press SPACE to start.`,

`Level 2

You will see a 4x4 grid.
Some tiles will turn dark. Remember their positions.
When the grid clears, click the 5 tiles you remember.
The trial ends automatically when you click 5 tiles.

Press SPACE to start.`,

`Level 3

You will see a 5x5 grid.
Some tiles will turn dark. Remember their positions.
When the grid clears, click the 7 tiles you remember.
The trial ends automatically when you click 7 tiles.

Press SPACE to start.`
];

// LEVEL DEFINITIONS
const levels = [
  {
    level: 1,
    gridSize: 3,
    targetCount: 3,
    hasVisualFeedback: true,
    stimulusDuration: 1500,
    blankDuration: 0,
    responseWindow: 10000,
    useConfirmButton: true
  },
  {
    level: 2,
    gridSize: 4,
    targetCount: 5,
    hasVisualFeedback: false,
    stimulusDuration: 1500,
    blankDuration: 300,
    responseWindow: 7000,
    useConfirmButton: false
  },
  {
    level: 3,
    gridSize: 5,
    targetCount: 7,
    hasVisualFeedback: false,
    stimulusDuration: 1500,
    blankDuration: 0,
    responseWindow: 7000,
    useConfirmButton: false
  }
];

/* ===================== STATES ===================== */

const STATES = {
  LEVEL_INSTRUCTIONS: 'level_instructions',
  FIXATION:           'fixation',
  STIMULUS:           'stimulus',
  BLANK:              'blank',
  RESPONSE:           'response',
  POST_RESPONSE:      'post_response',
  FEEDBACK:           'feedback',
  END:                'end'
};

let experimentState = STATES.LEVEL_INSTRUCTIONS;

/* =============== RUNTIME VARIABLES =============== */

let startTime           = null;
let currentLevel        = 0;
let currentTrialIndex   = 0;
let globalTrialIndex    = 0;

let fixationStartTime   = null;
let fixationDuration    = null;

let stimulusOnsetTime   = null;
let blankOnsetTime      = null;
let responseStartTime   = null;
let postResponseStartTime = null;

let responseGiven       = false;
let isTimeout           = false;

let targetPositions      = [];
let responsePositions    = [];
let reactionTimePerClick = [];

let feedbackText        = '';
let feedbackStartTime   = null;

// Derived Grid Layout Variables
let cellSize = 0;
let gridStartX = 0;
let gridStartY = 0;
let confirmBtnRect = { x: 0, y: 0, w: 160, h: 50 };

let trials = [];
let logs   = [];

/* ========== TRIAL GENERATOR ========== */

function generateTrialsForLevel(levelConfig, levelIndex) {
  let levelTrials = [];
  for (let i = 0; i < TRIALS_PER_LEVEL; i++) {
    // Generate random distinct targets
    let pattern = new Set();
    let totalCells = levelConfig.gridSize * levelConfig.gridSize;
    while (pattern.size < levelConfig.targetCount) {
      pattern.add(Math.floor(Math.random() * totalCells));
    }
    
    levelTrials.push({
      levelConfig: levelConfig,
      levelIndex: levelIndex,
      targetPositions: Array.from(pattern)
    });
  }
  return levelTrials;
}

/* ===================== SETUP ===================== */

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  textFont('monospace');

  // Pre-generate all trials for all levels
  levels.forEach((level, idx) => {
    trials = trials.concat(generateTrialsForLevel(level, idx));
  });

  startExperiment();
}

/* =================== DRAW LOOP =================== */

function draw() {
  background(CANVAS_BG);

  switch (experimentState) {
    case STATES.LEVEL_INSTRUCTIONS:
      drawLevelInstructions();
      break;
    case STATES.FIXATION:
      drawFixation();
      handleFixation();
      break;
    case STATES.STIMULUS:
      drawGrid(true, false);
      handleStimulus();
      break;
    case STATES.BLANK:
      // Empty screen
      handleBlank();
      break;
    case STATES.RESPONSE:
      drawGrid(false, false);
      if (levels[currentLevel].useConfirmButton) drawConfirmButton();
      handleResponse();
      break;
    case STATES.POST_RESPONSE:
      drawGrid(false, false); 
      if (levels[currentLevel].useConfirmButton) drawConfirmButton();
      handlePostResponse(); 
      break;
    case STATES.FEEDBACK:
      if (levels[currentLevel].hasVisualFeedback) {
        drawGrid(false, true); // draw with visual feedback colors
      }
      drawFeedback();
      handleFeedback();
      break;
    case STATES.END:
      drawEndScreen();
      break;
  }
}

/* ================= DRAW FUNCTIONS ================ */

function drawLevelInstructions() {
  fill(0);
  noStroke();
  textSize(INSTRUCTION_SIZE);
  text(levelInstructions[currentLevel], width / 2, height / 2);
}

function drawFixation() {
  fill(0);
  noStroke();
  // textSize(FIXATION_SIZE);
  text('+', width / 2, height / 2);
}

function drawGrid(showStimulus, showVisualFeedback) {
  const cfg = levels[currentLevel];
  cellSize = MAX_GRID_PIXELS / cfg.gridSize;
  gridStartX = (width - MAX_GRID_PIXELS) / 2;
  gridStartY = (height - MAX_GRID_PIXELS) / 2;

  rectMode(CORNER);
  stroke(255);
  strokeWeight(4);

  let totalCells = cfg.gridSize * cfg.gridSize;
  
  for (let i = 0; i < totalCells; i++) {
    let col = i % cfg.gridSize;
    let row = Math.floor(i / cfg.gridSize);
    let x = gridStartX + col * cellSize;
    let y = gridStartY + row * cellSize;

    // Determine color
    let fillColor = COLOR_TILE_BG;

    if (showVisualFeedback) {
      let isTarget = targetPositions.includes(i);
      let isSelected = responsePositions.includes(i);
      if (isTarget && isSelected) fillColor = COLOR_HIT;
      else if (!isTarget && isSelected) fillColor = COLOR_FALSE_ALARM;
      else if (isTarget && !isSelected) fillColor = COLOR_MISS;
    } else {
      if (showStimulus && targetPositions.includes(i)) {
        fillColor = COLOR_STIMULUS;
      } else if (responsePositions.includes(i)) {
        fillColor = COLOR_SELECTED;
      }
    }

    fill(fillColor);
    rect(x, y, cellSize, cellSize, 8); // 8px rounded corners
  }
}

function drawConfirmButton() {
  confirmBtnRect.x = width / 2 - confirmBtnRect.w / 2;
  confirmBtnRect.y = gridStartY + MAX_GRID_PIXELS + 40;

  rectMode(CORNER);
  fill('#000000');
  noStroke();
  rect(confirmBtnRect.x, confirmBtnRect.y, confirmBtnRect.w, confirmBtnRect.h, 5);
  
  fill(255);
  textSize(20);
  text("CONFIRM", confirmBtnRect.x + confirmBtnRect.w / 2, confirmBtnRect.y + confirmBtnRect.h / 2);
}

function drawFeedback() {
  fill('#000000');
  noStroke();
  textSize(FEEDBACK_SIZE);
  // If visual feedback is shown, place text below grid. Otherwise center screen.
  let textY = levels[currentLevel].hasVisualFeedback ? (gridStartY + MAX_GRID_PIXELS + 60) : height / 2;
  text(feedbackText, width / 2, textY);
}

function drawEndScreen() {
  fill('#000000');
  noStroke();
  // textSize(FEEDBACK_SIZE);
  text('Experiment finished.\nPress S to save data.', width / 2, height / 2);
}

/* ================= STATE HANDLERS ================ */

function handleFixation() {
  if (millis() - fixationStartTime >= fixationDuration) {
    const trial = trials[globalTrialIndex];
    targetPositions = trial.targetPositions;
    responsePositions = [];
    reactionTimePerClick = [];
    
    stimulusOnsetTime = millis();
    experimentState = STATES.STIMULUS;
  }
}

function handleStimulus() {
  const level = levels[currentLevel];
  if (millis() - stimulusOnsetTime >= level.stimulusDuration) {
    if (level.blankDuration > 0) {
      blankOnsetTime = millis();
      experimentState = STATES.BLANK;
    } else {
      startResponsePhase();
    }
  }
}

function handleBlank() {
  const level = levels[currentLevel];
  if (millis() - blankOnsetTime >= level.blankDuration) {
    startResponsePhase();
  }
}

function startResponsePhase() {
  responseStartTime = millis();
  responseGiven = false;
  isTimeout = false;
  experimentState = STATES.RESPONSE;
}

function handleResponse() {
  const level = levels[currentLevel];
  
  // Timeout check
  if (millis() - responseStartTime >= level.responseWindow) {
    finalizeTrial(true); 
  }
}

function handlePostResponse() {
  if (millis() - postResponseStartTime >= POST_RESPONSE_DELAY) {
    feedbackStartTime = millis();
    experimentState = STATES.FEEDBACK;
  }
}

function handleFeedback() {
  if (millis() - feedbackStartTime >= FEEDBACK_DURATION) {
    advanceTrial();
  }
}

/* ================= INPUT HANDLERS ================ */

function keyPressed() {
  if (experimentState === STATES.LEVEL_INSTRUCTIONS && key === ' ') {
    startFixation();
    return false;
  }

  if (experimentState === STATES.END && (key === 's' || key === 'S')) {
    exportCSV();
    return false;
  }
}

function mousePressed() {
  if (experimentState !== STATES.RESPONSE || responseGiven) return;

  const cfg = levels[currentLevel];
  
  // Check Grid Clicks
  let col = Math.floor((mouseX - gridStartX) / cellSize);
  let row = Math.floor((mouseY - gridStartY) / cellSize);

  if (col >= 0 && col < cfg.gridSize && row >= 0 && row < cfg.gridSize) {
    let index = row * cfg.gridSize + col;
    
    if (!responsePositions.includes(index)) {
      responsePositions.push(index);
      reactionTimePerClick.push(round(millis() - responseStartTime));

      // Auto finish for Level 2 & 3
      if (!cfg.useConfirmButton && responsePositions.length === cfg.targetCount) {
        finalizeTrial(false);
      }
    }
  }

  // Check Confirm Button Click (Level 1)
  if (cfg.useConfirmButton) {
    if (mouseX >= confirmBtnRect.x && mouseX <= confirmBtnRect.x + confirmBtnRect.w &&
        mouseY >= confirmBtnRect.y && mouseY <= confirmBtnRect.y + confirmBtnRect.h) {
      finalizeTrial(false);
    }
  }
}

/* =========== TRIAL FINALIZATION & LOGGING =========== */

function finalizeTrial(timeoutOccurred) {
  if (responseGiven) return;
  responseGiven = true;
  
  const now = millis();
  const trial = trials[globalTrialIndex];
  const cfg = levels[currentLevel];
  
  let totalResponseTime = round(now - responseStartTime);
  let confirmTime = cfg.useConfirmButton && !timeoutOccurred ? totalResponseTime : null;

  // Signal Detection logic
  let hits = 0;
  let falseAlarms = 0;
  responsePositions.forEach(res => {
    if (targetPositions.includes(res)) hits++;
    else falseAlarms++;
  });
  let misses = targetPositions.length - hits;
  let isCorrect = (hits === targetPositions.length && falseAlarms === 0) ? 1 : 0;

  // Determine Feedback
  if (timeoutOccurred && !cfg.useConfirmButton && responsePositions.length < cfg.targetCount) {
    feedbackText = "Timeout";
  } else if (timeoutOccurred && cfg.useConfirmButton) {
    feedbackText = "Timeout";
  } else {
    feedbackText = isCorrect ? "Correct" : "Incorrect";
  }

  // Logging
  logs.push({
    startTime:          startTime,
    level:              cfg.level,

    fixationStartTime:  round(fixationStartTime),
    fixationDuration:   round(fixationDuration),

    stimulusOnsetTime:  round(stimulusOnsetTime),
    stimulusDuration:   cfg.stimulusDuration,

    trialIndex:         currentTrialIndex + 1,
    trialIndexGlobal:   globalTrialIndex + 1,

    gridSize:           cfg.gridSize,
    targetCount:        cfg.targetCount,
    targetPositions:    targetPositions.join(';'),

    responsePositions:  responsePositions.join(';'),
    responseWindow:     cfg.responseWindow,
    responseTime:       totalResponseTime,

    reactionTimePerClick: reactionTimePerClick.join(';'),
    
    blankDuration:      cfg.blankDuration > 0 ? cfg.blankDuration : null,
    confirmTime:        confirmTime,

    hits:               hits,
    misses:             misses,
    falseAlarms:        falseAlarms,
    feedback:           feedbackText,
    correct:            isCorrect
  });

  postResponseStartTime = millis();
  experimentState = STATES.POST_RESPONSE; 
}

/* ============ TRIAL / LEVEL PROGRESSION ============ */

function advanceTrial() {
  globalTrialIndex++;
  currentTrialIndex++;

  if (currentTrialIndex >= TRIALS_PER_LEVEL) {
    currentLevel++;
    currentTrialIndex = 0;

    if (currentLevel < TOTAL_LEVELS) {
      experimentState = STATES.LEVEL_INSTRUCTIONS;
      return;
    }
  }

  if (currentLevel >= TOTAL_LEVELS) {
    experimentState = STATES.END;
    return;
  }

  startFixation();
}

/* =============== EXPERIMENT CONTROL =============== */

function startExperiment() {
  startTime         = round(millis());
  currentLevel      = 0;
  currentTrialIndex = 0;
  globalTrialIndex  = 0;
  experimentState   = STATES.LEVEL_INSTRUCTIONS;
}

function startFixation() {
  fixationStartTime = millis();
  fixationDuration  = random(FIXATION_MIN, FIXATION_MAX);
  experimentState   = STATES.FIXATION;
}

/* ================== DATA EXPORT ================== */

function exportCSV() {
  if (logs.length === 0) return;

  const headers = Object.keys(logs[0]).join(',') + '\n';
  const rows    = logs.map(row => Object.values(row).join(',')).join('\n');

  const blob = new Blob([headers + rows], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);

  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'MemoryMatrixData.csv';
  a.click();

  URL.revokeObjectURL(url);
}