/* =========================================================
   Arithmetic Task – PROTOTYPE
   =========================================================
*/

/* ==================== CONFIG ==================== */

const CANVAS_BG = 'rgb(235,235,235)';

const FIXATION_MIN = 500;
const FIXATION_MAX = 1000;

const FEEDBACK_DURATION = 750;
const FEEDBACK_SIZE = 30;
const INSTRUCTION_SIZE = 30;
const PROBLEM_SIZE = 40;
const INPUT_SIZE = 35;

const TOTAL_LEVELS = 3;
// Set to 12 so it is perfectly divisible by 2 (Level 1), 3 (Level 2), and 4 (Level 3)
const TRIALS_PER_LEVEL = 12; 

// LEVEL INSTRUCTIONS
const levelInstructions = [
`Level 1

Only addition (+) and subtraction (-).
Type your answer and press ENTER.

Press SPACE to start.`,

`Level 2

Addition (+), subtraction (-), and simple multiplication (*).
Type your answer and press ENTER.

Press SPACE to start.`,

`Level 3

All operations (+, -, *, /).
Type your answer and press ENTER.

Press SPACE to start.`
];

// LEVEL DEFINITIONS
const levels = [
  {
    level: 1,
    operations: ['+', '-'],
    maxNumPlusMinus: 25,
    windowPlusMinus: 4000,
    maxNumMultDiv1: null,
    maxNumMultDiv2: null,
    windowMultDiv: null
  },
  {
    level: 2,
    operations: ['+', '-', '*'],
    maxNumPlusMinus: 50,
    windowPlusMinus: 4000,
    maxNumMultDiv1: 10, 
    maxNumMultDiv2: 10,
    windowMultDiv: 4000
  },
  {
    level: 3,
    operations: ['+', '-', '*', '/'],
    maxNumPlusMinus: 100,
    windowPlusMinus: 4000,
    maxNumMultDiv1: 99, 
    maxNumMultDiv2: 9,  
    windowMultDiv: 6000
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

let experimentStartTime = 0;
let currentLevel = 0;
let currentTrialIndex = 0;
let globalTrialIndex = 0;

let trialStartTime = null;
let fixationStartTime = null;
let fixationDuration = null;

let stimulusOnsetTime = null;
let stimulusVisible = true;
let responseGiven = false;

let currentInput = "";
let initiationTime = null;

let feedbackText = "";
let feedbackStartTime = null;

let trials = [];
let logs = [];

/* === TRIAL GENERATOR (BALANCED RANDOMIZATION) === */

function generateTrials() {
  for (let l = 0; l < TOTAL_LEVELS; l++) {
    const config = levels[l];
    
    // Create a balanced pool of operations for this level
    let opsPool = [];
    let trialsPerOp = TRIALS_PER_LEVEL / config.operations.length;
    for (let op of config.operations) {
      for (let i = 0; i < trialsPerOp; i++) {
        opsPool.push(op);
      }
    }
    // Shuffle the operations array
    opsPool = shuffle(opsPool);
    
    for (let t = 0; t < TRIALS_PER_LEVEL; t++) {
      let op = opsPool[t];
      let num1, num2, correctAnswer;
      let windowTime, durationTime;

      if (op === '+' || op === '-') {
        num1 = floor(random(1, config.maxNumPlusMinus + 1));
        num2 = floor(random(1, config.maxNumPlusMinus + 1));
        
        // Prevent negative answers
        if (op === '-' && num2 > num1) {
          let temp = num1;
          num1 = num2;
          num2 = temp;
        }
        
        correctAnswer = op === '+' ? num1 + num2 : num1 - num2;
        windowTime = config.windowPlusMinus;
        durationTime = config.windowPlusMinus;
        
      } else if (op === '*') {
        if (config.level === 2) {
          num1 = floor(random(1, config.maxNumMultDiv1 + 1));
          num2 = floor(random(1, config.maxNumMultDiv2 + 1));
        } else {

          num1 = floor(random(10, 100)); // 10-99
          num2 = floor(random(1, 10));   // 1-9
          if (random() > 0.5) { 
            let temp = num1;
            num1 = num2;
            num2 = temp;
          }
        }
        correctAnswer = num1 * num2;
        windowTime = config.windowMultDiv;
        durationTime = config.windowMultDiv;
        
      } else if (op === '/') {

        let divisor = floor(random(2, 10)); 
        
        // Ensure that answer * divisor stays between 10 and 99
        let minAns = ceil(10 / divisor);
        let maxAns = floor(99 / divisor);
        
        let answer = floor(random(minAns, maxAns + 1));
        let dividend = answer * divisor;     
        
        num1 = dividend;
        num2 = divisor;
        correctAnswer = answer;
        windowTime = config.windowMultDiv;
        durationTime = config.windowMultDiv;
      }

      trials.push({
        level: config.level,
        operation: op,
        problemString: `${num1} ${op} ${num2}`,
        correctAnswer: correctAnswer.toString(),
        responseWindow: windowTime,
        stimulusDuration: durationTime
      });
    }
  }
}

/* ===================== SETUP ===================== */

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  
  generateTrials();
  startExperiment(); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
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
  noStroke();
  textSize(INSTRUCTION_SIZE);
  text(levelInstructions[currentLevel], width/2, height/2);
}

function drawFixation() {
  fill(0);
  noStroke();
  textSize(40);
  text("+", width / 2, height / 2);
}

function drawStimulus() {
  if (!stimulusVisible) return;
  
  const trial = trials[globalTrialIndex];

  fill(0);
  noStroke();
  textSize(PROBLEM_SIZE);
  text(trial.problemString + " = ?", width / 2, height / 2 - 40);

  // Draw user input text
  textSize(INPUT_SIZE);
  fill(50);
  text(currentInput, width / 2, height / 2 + 40);
}

function drawFeedback() {
  fill(0);
  noStroke();
  textSize(FEEDBACK_SIZE);
  text(feedbackText, width/2, height/2);
}

function drawEndScreen() {
  fill(0);
  noStroke();
  textSize(INSTRUCTION_SIZE);
  text("Experiment finished\nPress S to save data", width / 2, height / 2);
}

/* ================ STATE HANDLERS ================ */

function handleFixation() {
  if (millis() - fixationStartTime >= fixationDuration) {
    stimulusOnsetTime = millis();
    stimulusVisible = true;
    responseGiven = false;
    currentInput = "";
    initiationTime = null;
    experimentState = STATES.STIMULUS;
  }
}

function handleStimulus() {
  const trial = trials[globalTrialIndex];
  const elapsed = millis() - stimulusOnsetTime;

  if (elapsed >= trial.stimulusDuration) {
    stimulusVisible = false;
  }
  
  if (elapsed >= trial.responseWindow) {
    finalizeTrial(null); 
  }
}

function handleFeedback() {
  if (millis() - feedbackStartTime >= FEEDBACK_DURATION) {
    advanceTrial();
  }
}

/* ================= INPUT HANDLERS ================= */

function keyPressed() {
  if (experimentState === STATES.LEVEL_INSTRUCTIONS && key === " ") {

    if (globalTrialIndex === 0) {
      experimentStartTime = millis();
    }
    startFixation();
  }

  if (experimentState === STATES.STIMULUS && stimulusVisible) {
    handleKeyboardResponse(key, keyCode);
  }

  if (experimentState === STATES.END && (key === "s" || key === "S")) {
    exportCSV();
  }
}

function handleKeyboardResponse(k, code) {
  if (responseGiven) return;

  if (initiationTime === null && ((k >= '0' && k <= '9') || k === '-')) {
    initiationTime = millis() - stimulusOnsetTime;
  }

  if (k >= '0' && k <= '9') {
    currentInput += k;
  } 
  else if (code === BACKSPACE || code === DELETE) {
    currentInput = currentInput.slice(0, -1);
  }
  else if (code === ENTER || code === RETURN) {
    if (currentInput.length > 0) {
      finalizeTrial(currentInput);
    }
  }
}

/* =========== TRIAL FINALIZATION & LOGGING =========== */

function finalizeTrial(userAnswerStr) {
  if (responseGiven) return;
  responseGiven = true;

  const trial = trials[globalTrialIndex];
  const now = millis();

  let feedback;
  let isCorrect = 0;
  let finalResponseTime = userAnswerStr ? now : null;

  if (userAnswerStr === null) {
    feedback = "Timeout";
    isCorrect = 0;
  } else if (userAnswerStr === trial.correctAnswer) {
    feedback = "Correct";
    isCorrect = 1;
  } else {
    feedback = "Incorrect";
    isCorrect = 0;
  }

  logs.push({
    trialStartTime: round(trialStartTime - experimentStartTime),
    level: trial.level,

    trialIndex: currentTrialIndex + 1,
    trialIndexGlobal: globalTrialIndex + 1,

    fixationStartTime: round(fixationStartTime - experimentStartTime),
    fixationDuration: round(fixationDuration),

    stimulusOnsetTime: round(stimulusOnsetTime - experimentStartTime),
    stimulusDuration: trial.stimulusDuration,

    responseWindow: trial.responseWindow,
    responseTime: finalResponseTime ? round(finalResponseTime - experimentStartTime) : null,   
  
    initiationTime: initiationTime ? round(initiationTime) : null,
    reactionTime: finalResponseTime ? round(finalResponseTime - stimulusOnsetTime) : null,       

    problemString: trial.problemString,
    operation: trial.operation,

    userAnswer: userAnswerStr || "none",
    correctAnswer: trial.correctAnswer,

    feedback: feedback,
    correct: isCorrect
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
  currentLevel = 0;
  currentTrialIndex = 0;
  globalTrialIndex = 0;
  experimentState = STATES.LEVEL_INSTRUCTIONS;
}

function startFixation() {
  trialStartTime = millis();
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
  a.download = "Arithmetic_Results.csv";
  a.click();

  URL.revokeObjectURL(url);
}
