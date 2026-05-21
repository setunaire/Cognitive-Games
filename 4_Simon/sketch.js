/* =========================================================
   Simon Task – PROTOTYPE
   =========================================================
   Levels:
     1 – Text rectangles (LEFT/RIGHT), 2-choice, Arrow keys
     2 – Color squares (blue=left, red=right), 2-choice, Arrow keys
     3 – Text rectangles (LEFT/RIGHT/UP), 3-choice, Arrow keys
   =========================================================
*/

/* ==================== CONFIG ==================== */

const CANVAS_BG = 'rgb(235,235,235)';

const FIXATION_MIN = 500;
const FIXATION_MAX = 1000;

const FEEDBACK_DURATION = 750;

const TOTAL_LEVELS = 3;
const TRIALS_PER_LEVEL = 12;

// Stimulus dimensions
const RECT_W = 160;
const RECT_H = 80;
const SQUARE_SIZE = 120;

// Distance from center to stimulus (horizontal/vertical offset)
const STIMULUS_OFFSET = 250;

const FIXATION_SIZE = 60;
const FEEDBACK_SIZE = 30;
const INSTRUCTION_SIZE = 30;

// LEVEL INSTRUCTIONS

const levelInstructions = [
`Level 1

A colored square will appear on the LEFT or RIGHT side of the screen.

Press ← (left arrow) if the square is BLUE.
Press → (right arrow) if the square is RED.

Ignore where the square appears — respond to the COLOR.

Press SPACE to start.`

,

`Level 2

A rectangle will appear on the LEFT or RIGHT side of the screen.
It will contain the word LEFT or RIGHT.

Press ← (left arrow) if the word says LEFT.
Press → (right arrow) if the word says RIGHT.

Ignore where the rectangle appears — respond to the WORD.

Press SPACE to start.`
,

`Level 3

A rectangle will appear on the LEFT, RIGHT, TOP, or BOTTOM of the screen.
It will contain the word LEFT, RIGHT, or UP.

Press ← (left arrow) if the word says LEFT.
Press → (right arrow) if the word says RIGHT.
Press ↑ (up arrow) if the word says UP.

Ignore where the rectangle appears — respond to the WORD.

Press SPACE to start.`
];

// LEVEL DEFINITIONS
/*
  Each stimulus entry:
    type         – identifier used in drawStimulus()
    position     – 'left' | 'right' | 'up'  (where it appears on screen)
    meaning      – 'left' | 'right' | 'up'  (what it instructs / represents)
    correctKey   – which key is correct
    count        – how many times this stimulus appears per level
*/

const levels = [
  // Level 1:
  {
    responseKeys: ['ArrowLeft', 'ArrowRight'],
    stimulusDuration: 1000,
    responseWindow: 1500,
    stimuli: [
      { type: 'blueSquare', position: 'left',  meaning: 'left',  correctKey: 'ArrowLeft', count: 3 }, // congruent
      { type: 'redSquare',  position: 'right', meaning: 'right', correctKey: 'ArrowRight', count: 3 }, // congruent
      { type: 'blueSquare', position: 'right', meaning: 'left',  correctKey: 'ArrowLeft', count: 3 }, // incongruent
      { type: 'redSquare',  position: 'left',  meaning: 'right', correctKey: 'ArrowRight', count: 3 }, // incongruent
    ]
  },

  // Level 2:
  {
    responseKeys: ['ArrowLeft', 'ArrowRight'],
    stimulusDuration: 1200,
    responseWindow: 1500,
    stimuli: [
      { type: 'LEFT',  position: 'left',  meaning: 'left',  correctKey: 'ArrowLeft', count: 3 }, // congruent
      { type: 'RIGHT', position: 'right', meaning: 'right', correctKey: 'ArrowRight', count: 3 }, // congruent
      { type: 'LEFT',  position: 'right', meaning: 'left',  correctKey: 'ArrowLeft', count: 3 }, // incongruent
      { type: 'RIGHT', position: 'left',  meaning: 'right', correctKey: 'ArrowRight', count: 3 }, // incongruent
    ]
  },

  // Level 3:
  {
    responseKeys: ['ArrowLeft', 'ArrowRight', 'ArrowUp'],
    stimulusDuration: 1200,
    responseWindow: 1800,
    stimuli: [
      // Congruent trials (position matches meaning)
      { type: 'LEFT',  position: 'left',  meaning: 'left',  correctKey: 'ArrowLeft', count: 1 },
      { type: 'RIGHT', position: 'right', meaning: 'right', correctKey: 'ArrowRight', count: 1 },
      { type: 'UP',    position: 'up',    meaning: 'up',    correctKey: 'ArrowUp', count: 1 },
      
      // Incongruent trials (each stimulus on all 4 positions except its congruent one)
      { type: 'LEFT',  position: 'right', meaning: 'left',  correctKey: 'ArrowLeft', count: 1 },
      { type: 'LEFT',  position: 'up',    meaning: 'left',  correctKey: 'ArrowLeft', count: 1 },
      { type: 'LEFT',  position: 'down',  meaning: 'left',  correctKey: 'ArrowLeft', count: 1 },
      
      { type: 'RIGHT', position: 'left',  meaning: 'right', correctKey: 'ArrowRight', count: 1 },
      { type: 'RIGHT', position: 'up',    meaning: 'right', correctKey: 'ArrowRight', count: 1 },
      { type: 'RIGHT', position: 'down',  meaning: 'right', correctKey: 'ArrowRight', count: 1 },
      
      { type: 'UP',    position: 'left',  meaning: 'up',    correctKey: 'ArrowUp', count: 1 },
      { type: 'UP',    position: 'right', meaning: 'up',    correctKey: 'ArrowUp', count: 1 },
      { type: 'UP',    position: 'down',  meaning: 'up',    correctKey: 'ArrowUp', count: 1 },
      ]
  }
];

/* ===================== STATES ===================== */

const STATES = {
  LEVEL_INSTRUCTIONS: 'level_instructions',
  FIXATION:           'fixation',
  STIMULUS:           'stimulus',
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
let stimulusVisible     = false;
let responseGiven       = false;

let feedbackText        = '';
let feedbackColor       = 0;
let feedbackStartTime   = null;

let trials = [];
let logs   = [];

/* ========== TRIAL GENERATOR (CONTROLLED RANDOMIZATION) ========== */

function generateTrialsForLevel(level, levelIndex) {
  let levelTrials = [];

  level.stimuli.forEach(stim => {
    for (let i = 0; i < stim.count; i++) {
      levelTrials.push({
        level:      levelIndex + 1,
        type:       stim.type,
        position:   stim.position,   // where it appears
        meaning:    stim.meaning,    // what it means / instructs
        correctKey: stim.correctKey,
        // congruent = position matches meaning
        trialClass: stim.position === stim.meaning ? 'congruent' : 'incongruent'
      });
    }
  });

  return shuffle(levelTrials);
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
      drawFixation();       // fixation stays visible behind stimulus
      drawStimulus();
      handleStimulus();
      break;

    case STATES.FEEDBACK:
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
  fill('rgb(255, 180, 0)');
  noStroke();
  textSize(FIXATION_SIZE);
  text('+', width / 2, height / 2);
}

function drawStimulus() {
  if (!stimulusVisible) return;

  const trial = trials[globalTrialIndex];
  const cx = width  / 2;
  const cy = height / 2;

  // Compute stimulus center based on position
  let sx, sy;
  switch (trial.position) {
    case 'left':  sx = cx - STIMULUS_OFFSET; sy = cy;                     break;
    case 'right': sx = cx + STIMULUS_OFFSET; sy = cy;                     break;
    case 'up':    sx = cx;                   sy = cy - STIMULUS_OFFSET;   break;
    case 'down':  sx = cx;                   sy = cy + STIMULUS_OFFSET;   break;   
  }

  rectMode(CENTER);

  switch (trial.type) {

    // Level 1: Color squares
    case 'blueSquare':
      fill('#1a6fff');
      noStroke();
      rect(sx, sy, SQUARE_SIZE, SQUARE_SIZE);
      break;

    case 'redSquare':
      fill('#ff3030');
      noStroke();
      rect(sx, sy, SQUARE_SIZE, SQUARE_SIZE);
      break;

    // Level 2 & 3: Text rectangles
    case 'LEFT':
    case 'RIGHT':
    case 'UP':
      fill('rgb(255, 180, 0)');
      noStroke();
      rect(sx, sy, RECT_W, RECT_H, 6);   // 6px rounded corners
      fill('#000000');
      textSize(30);
      text(trial.type, sx, sy);
      break;

  }
}

function drawFeedback() {
  fill(feedbackColor);
  noStroke();
  textSize(FEEDBACK_SIZE);
  text(feedbackText, width / 2, height / 2);
}

function drawEndScreen() {
  fill('#000000');
  noStroke();
  textSize(FEEDBACK_SIZE);
  text('Experiment finished.\nPress S to save data.', width / 2, height / 2);
}

/* ================= STATE HANDLERS ================ */

function handleFixation() {
  if (millis() - fixationStartTime >= fixationDuration) {
    stimulusOnsetTime = millis();
    stimulusVisible   = true;
    responseGiven     = false;
    experimentState   = STATES.STIMULUS;
  }
}

function handleStimulus() {
  const level   = levels[currentLevel];
  const elapsed = millis() - stimulusOnsetTime;

  // Stimulus disappears after stimulusDuration
  if (elapsed >= level.stimulusDuration) {
    stimulusVisible = false;
  }

  // Response window ends → timeout
  if (elapsed >= level.responseWindow) {
    finalizeTrial(null);
  }
}

function handleFeedback() {
  if (millis() - feedbackStartTime >= FEEDBACK_DURATION) {
    advanceTrial();
  }
}

/* ================= INPUT HANDLERS ================ */

function keyPressed() {
  // Start level from instructions screen
  if (experimentState === STATES.LEVEL_INSTRUCTIONS && key === ' ') {
    startFixation();
    return false;
  }

  // Capture response during stimulus window
  if (experimentState === STATES.STIMULUS && !responseGiven) {
    const validKeys = levels[currentLevel].responseKeys;
    if (validKeys.includes(key)) {
      finalizeTrial(key);
      return false;
    }
  }

  // Export data at end screen
  if (experimentState === STATES.END && (key === 's' || key === 'S')) {
    exportCSV();
    return false;
  }

  // Prevent default for arrow keys and space
  if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(key)) {
    return false;
  }
}

/* =========== TRIAL FINALIZATION & LOGGING =========== */

function finalizeTrial(responseKey) {
  if (responseGiven) return;
  responseGiven = true;

  const trial = trials[globalTrialIndex];
  const level = levels[currentLevel];
  const now   = millis();

  // Determine feedback & correctness
  let result, feedback, correct;

  if (responseKey === null) {
    result = 'Miss';
    feedback = 'Timeout';
    correct  = 0;
  } else if (responseKey === trial.correctKey) {
    result = 'Hit';
    feedback = 'Correct';
    correct  = 1;
  } else {
    result = 'WrongKey';
    feedback = 'Incorrect';
    correct  = 0;
  }

  // Feedback display color
  feedbackText  = feedback;
  feedbackColor = '#000000';
   

  // Log entry
  logs.push({
    startTime,
    level: trial.level,

    fixationStartTime,
    fixationDuration:   round(fixationDuration),

    trialIndex:         currentTrialIndex + 1,
    trialIndexGlobal:   globalTrialIndex  + 1,

    trialClass:         trial.trialClass,          // congruent | incongruent
    stimulusType:       trial.type,                // LEFT | RIGHT | UP | blueSquare | redSquare
    stimulusPosition:   trial.position,            // left | right | up | down  (where it appeared)
    stimulusMeaning:    trial.meaning,             // left | right | up  (what it meant)

    stimulusOnsetTime:  round(stimulusOnsetTime),
    stimulusDuration:   level.stimulusDuration,
    responseWindow:     level.responseWindow,

    responseTime:       responseKey ? round(now)                        : null,
    reactionTime:       responseKey ? round(now - stimulusOnsetTime)    : null,

    responseKey:        responseKey ?? 'none',
    correctKey:         trial.correctKey,

    result,
    feedback,
    correct
  });

  feedbackStartTime = millis();
  experimentState   = STATES.FEEDBACK;
}

/* ============ TRIAL / LEVEL PROGRESSION ============ */

function advanceTrial() {
  globalTrialIndex++;
  currentTrialIndex++;

  // Level complete
  if (currentTrialIndex >= TRIALS_PER_LEVEL) {
    currentLevel++;
    currentTrialIndex = 0;

    if (currentLevel < TOTAL_LEVELS) {
      experimentState = STATES.LEVEL_INSTRUCTIONS;
      return;
    }
  }

  // All levels complete
  if (currentLevel >= TOTAL_LEVELS) {
    experimentState = STATES.END;
    return;
  }

  startFixation();
}

/* =============== EXPERIMENT CONTROL =============== */

function startExperiment() {
  startTime         = millis();
  currentLevel      = 0;
  currentTrialIndex = 0;
  globalTrialIndex  = 0;
  experimentState   = STATES.LEVEL_INSTRUCTIONS;
}

function startFixation() {
  fixationStartTime = millis();
  fixationDuration  = random(FIXATION_MIN, FIXATION_MAX);
  stimulusVisible   = false;
  experimentState   = STATES.FIXATION;
}

/* =================== UTILITIES =================== */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = floor(random(i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  a.download = 'SimonTaskResults.csv';
  a.click();

  URL.revokeObjectURL(url);
}