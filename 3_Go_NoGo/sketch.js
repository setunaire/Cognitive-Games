/* =========================================================
   Go/No-Go Task – PROTOTYPE
   =========================================================
*/

/* ==================== CONFIG ==================== */

const CANVAS_BG = 'rgb(235,235,235)';

const FIXATION_MIN = 500;
const FIXATION_MAX = 1000;

const FEEDBACK_DURATION = 750;
const FEEDBACK_SIZE = 30;
const INSTRUCTION_SIZE = 20;

const TOTAL_LEVELS = 3;
const TRIALS_PER_LEVEL = 10;

// LEVEL INSTRUCTIONS
const levelInstructions = [
`Level 1

Press SPACE when you see a GREEN circle.
Do NOT press anything when you see a RED circle.

Press SPACE to start.`,

`Level 2

Press D when you see a GREEN circle.
Press K when you see a YELLOW circle.
Do NOT press anything when you see a RED circle.

Press SPACE to start.`,

`Level 3

Click inside the BLUE square.
Do NOT click if the square has a WHITE dot.

Press SPACE to start.`
];

// LEVEL DEFINITIONS
const levels = [
  {
    mode: "keyboard_space",
    stimulusDuration: 1200,
    responseWindow: 1200,
    stimuli: [
      { type: "greenEllipse", class: "Go", count: 6, correctResponse: "space" },
      { type: "redEllipse",   class: "No-Go", count: 4, correctResponse: "none" }
    ]
  },
  {
    mode: "keyboard_DK",
    stimulusDuration: 700,
    responseWindow: 1200,
    stimuli: [
      { type: "greenEllipse",  class: "Go", count: 3, correctResponse: "D" },
      { type: "yellowEllipse", class: "Go", count: 4, correctResponse: "K" },
      { type: "redEllipse",    class: "No-Go", count: 3, correctResponse: "none" }
    ]
  },
  {
    mode: "mouse",
    stimulusDuration: 1000,
    responseWindow: 1000,
    stimuli: [
      { type: "blueSquare",     class: "Go", count: 6, correctResponse: "mouse" },
      { type: "blueSquareDot",  class: "No-Go", count: 4, correctResponse: "none" }
    ]
  }
];

/* ===================== STATE ===================== */

const STATES = {
  LEVEL_INSTRUCTIONS: "level_instructions",
  FIXATION: "fixation",
  STIMULUS: "stimulus",
  FEEDBACK: "feedback",
  END: "end"
};

let experimentState = STATES.LEVEL_INSTRUCTIONS;

/* =============== RUNTIME VARIABLES =============== */

let startTime = null;
let currentLevel = 0;
let currentTrialIndex = 0;
let globalTrialIndex = 0;

let fixationStartTime = null;
let fixationDuration = null;

let stimulusOnsetTime = null;
let stimulusVisible = true;
let responseGiven = false;

let feedbackText = "";
let feedbackStartTime = null;

let trials = [];
let logs = [];

/* === TRIAL GENERATOR (CONTROLLED RANDOMIZATION) === */

function generateTrialsForLevel(level, levelIndex) {
  let levelTrials = [];

  level.stimuli.forEach(stim => {
    for (let i = 0; i < stim.count; i++) {
      levelTrials.push({
        level: levelIndex + 1,
        trialClass: stim.class,
        stimulusType: stim.type,
        correctResponse: stim.correctResponse
      });
    }
  });

  return shuffle(levelTrials);
}

/* ===================== SETUP ===================== */

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  startExperiment(); 

  // Pre-generate all trials
  levels.forEach((level, idx) => {
    const levelTrials = generateTrialsForLevel(level, idx);
    trials = trials.concat(levelTrials);
  });
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
  textSize(INSTRUCTION_SIZE);
  text(levelInstructions[currentLevel], width/2, height/2);
}


function drawFixation() {
    fill(0);
    text("+", width / 2, height / 2);
}

function drawStimulus() {

  if (!stimulusVisible) return;
  const trial = trials[globalTrialIndex];

  switch (trial.stimulusType) {
    case "greenEllipse":
      fill(0, 255, 0);
      stroke(0,255,0);
      ellipse(width / 2, height / 2, 150);
      break;

    case "yellowEllipse":
      fill(255, 255, 0);
      stroke(255, 255, 0);
      ellipse(width / 2, height / 2, 150);
      break;

    case "redEllipse":
      fill(255, 0, 0);
      stroke(255, 0, 0);
      ellipse(width / 2, height / 2, 150);
      break;

    case "blueSquare":
      fill(0, 0, 255);
      stroke(0, 0, 255);
      rectMode(CENTER);
      rect(width / 2, height / 2, 150, 150);
      break;

    case "blueSquareDot":
      fill(0, 0, 255);
      stroke(0, 0, 255);
      rectMode(CENTER);
      rect(width / 2, height / 2, 150, 150);
      fill(255);
      stroke(255)
      ellipse(width / 2, height / 2, 10);
      break;
  }
}

function drawFeedback() {
  fill(0);
  stroke(0);
  textSize(FEEDBACK_SIZE);
  text(feedbackText, width/2, height/2);
}

function drawEndScreen() {
  fill(0);
  text("Experiment finished\nPress S to save data", width / 2, height / 2);
}

/* ================ STATE HANDLERS ================ */

function handleFixation() {
  if (millis() - fixationStartTime >= fixationDuration) {
    stimulusOnsetTime = millis();
    stimulusVisible = true;
    responseGiven = false;
    experimentState = STATES.STIMULUS;
  }
}

function handleStimulus() {
  const level = levels[currentLevel];
  const elapsed = millis() - stimulusOnsetTime;

  // stimulus disappears
  if (elapsed >= level.stimulusDuration) {
    stimulusVisible = false;
  }
  
  // response window ends 
  if (elapsed >= level.responseWindow) {
    finalizeTrial(null);
  }
}

function handleFeedback() {
  if (millis() - feedbackStartTime >= FEEDBACK_DURATION) {
    advanceTrial(); // move to next fixation
  }
}

/* ================= INPUT HANDLERS ================= */

function keyPressed() {

  if (experimentState === STATES.LEVEL_INSTRUCTIONS && key === " ") {
    startFixation();
  }

  if (experimentState === STATES.STIMULUS) {
    handleKeyboardResponse(key);
  }

  if (experimentState === STATES.END && (key === "s" || key === "S")) {
    exportCSV();
  }
}

function mousePressed() {
  if (experimentState !== STATES.STIMULUS) return;

  const level = levels[currentLevel];
  if (level.mode !== "mouse") return;

  // check click inside square
  if (
    abs(mouseX - width / 2) <= 75 &&
    abs(mouseY - height / 2) <= 75
  ) {
    finalizeTrial("mouse");
  }
}

function handleKeyboardResponse(key) {
  if (responseGiven) return;

  const k = key.toUpperCase();
  if ([" ", "D", "K"].includes(k)) {
    finalizeTrial(k === " " ? "space" : k);
  }
}

/* =========== TRIAL FINALIZATION & LOGGING =========== */

function finalizeTrial(response) {

  if (responseGiven) return;
  responseGiven = true;

  const trial = trials[globalTrialIndex];
  const now = millis();

  let result;
  let feedback;
  let correct = 0;

  if (trial.trialClass === "Go") {

    if (response === null) {
      result = "Miss";
      feedback = "Timeout";
      correct = 0;
    }

    else if (response === trial.correctResponse) {
      result = "Hit";
      feedback = "Correct";
      correct = 1;
    }

    else {
      result = "WrongKey";
      feedback = "Incorrect";
      correct = 0;
    }

  }

  else { // No-Go

    if (response === null) {
      result = "CorrectRejection";
      feedback = "Correct";
      correct = 1;
    }

    else {
      result = "FalseAlarm";
      feedback = "Incorrect";
      correct = 0;
    }

  }

  logs.push({
    startTime,
    level: trial.level,

    fixationStartTime,
    fixationDuration,

    trialIndex: currentTrialIndex + 1,
    trialIndexGlobal: globalTrialIndex + 1,

    trialClass: trial.trialClass,
    stimulusType: trial.stimulusType,

    stimulusOnsetTime,
    stimulusDuration: levels[currentLevel].stimulusDuration,
    responseWindow: levels[currentLevel].responseWindow,

    responseTime: response ? now : null,
    reactionTime: response ? now - stimulusOnsetTime : null,

    madeResponse: response ?? "none",
    correctResponse: trial.correctResponse,

    result,
    feedback,     
    correct,       
  });

  feedbackText = feedback;
  feedbackStartTime = millis();

  experimentState = STATES.FEEDBACK;
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
  startTime = millis();
  currentLevel = 0;
  currentTrialIndex = 0;
  globalTrialIndex = 0;
  experimentState = STATES.LEVEL_INSTRUCTIONS;
}

function startFixation() {
  fixationStartTime = millis();
  fixationDuration = random(FIXATION_MIN, FIXATION_MAX);
  experimentState = STATES.FIXATION;
}

/* ================== DATA EXPORT =================== */

function exportCSV() {
  if (logs.length === 0) return;

  const headers = Object.keys(logs[0]).join(",") + "\n";
  const rows = logs
    .map(row => Object.values(row).join(","))
    .join("\n");

  const blob = new Blob([headers + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "GoNoGoResults.csv";
  a.click();

  URL.revokeObjectURL(url);
}