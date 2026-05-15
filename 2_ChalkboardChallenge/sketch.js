/* =========================================================
   Chalkboard Challenge – PROTOTYPE
   =========================================================
*/

/* ==================== CONFIG ==================== */

const CONFIG = {
  CANVAS_BG: 'rgb(235,235,235)',
  FIXATION_MIN: 500,
  FIXATION_MAX: 1000,
  FEEDBACK_DURATION: 750,
  SHOW_FEEDBACK: true, 
  SHOW_INSTRUCTIONS: true, 
  
  PARTICIPANT_ID: null,

  TEXT_SIZE: 40,
  FEEDBACK_SIZE: 30,
  INSTRUCTION_SIZE: 20,
  
  BOX_WIDTH: 350,
  BOX_HEIGHT: 150,
  BOX_RADIUS: 15,
  BOX_COLOR_LEFT: '#91ebfd',  
  BOX_COLOR_RIGHT: '#a0f385', 
  TEXT_COLOR: '#000000',
  FEEDBACK_COLOR: '#000000'
};

const LEVEL_INSTRUCTIONS = [
`Level 1\n Basic Arithmetic Task\n Evaluate basic operations (+, -) from left to right.\n Compare the two sides and press the LEFT or RIGHT arrow key to indicate the larger value.\n
Press SPACE to start.`,

`Level 2\n Intermediate Arithmetic Task\nEvaluate equations using the standard order of operations (× before + and -).\n Compare the two sides and press the LEFT or RIGHT arrow key to indicate the larger value.\n
Press SPACE to start.`,

`Level3\n Advanced Arithmetic Task\n Evaluate complex equations including division (÷).\n Apply the standard order of operations.\n Compare the two sides and press the LEFT or RIGHT arrow key to indicate the larger value.\n
Press SPACE to start.`
];

const LEVEL_CONFIG = [
  // Level 1: Basic (+, -) - Approximation is easy
  {
    level: 1,
    timer: 5500,
    stages: [
      { range: [1, 20], operators: ['+', '-'], terms: 2, minRatio: 0.30, maxRatio: 0.60 },
      { range: [5, 50], operators: ['+', '-'], terms: 2, minRatio: 0.25, maxRatio: 0.50 }
    ]
  },
  // Level 2: Intermediate (+, -, *) - Requires cognitive effort, ~70% accuracy
  {
    level: 2,
    timer: 5000,
    stages: [
      { range: [5, 60], operators: ['+', '-', '*'], terms: 3, minRatio: 0.15, maxRatio: 0.25 },
      { range: [10, 80], operators: ['+', '-', '*'], terms: 3, minRatio: 0.10, maxRatio: 0.20 }
    ]
  },
  // Level 3: Advanced (+, -, *, /) - Pushes to random chance (~50% accuracy)
  {
    level: 3,
    timer: 4500,
    stages: [
      { range: [10, 100], operators: ['+', '-', '*', '/'], terms: 3, minRatio: 0.05, maxRatio: 0.10 },
      { range: [10, 100], operators: ['+', '-', '*', '/'], terms: 4, minRatio: 0.02, maxRatio: 0.05 },
      { range: [10, 100], operators: ['+', '-', '*', '/'], terms: 4, minRatio: 0.01, maxRatio: 0.02 } // Super hard
    ]
  }
];

const TRIALS_PER_STAGE = 4;

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

let sessionStartUTC = "";
let sessionStartTimeMonotonic = 0;

let globalTrialIdx = 0;
let stageTrialIdx = 0;
let levelTrialIdx = 0;
let currentStreak = 0;

let trialStartMs = 0;
let fixationOnsetMs = 0;
let fixationDurationMs = 0;
let stimulusOnsetMs = 0;
let timeoutRef = null;

let currentTrialInvalidKeys = []; // Added variable to log invalid keys

let feedbackText = "";
let trials = [];
let logs = [];

/* ============ MATH GENERATOR ENGINE ============ */

function generateExpression(operandCount, ops, range, divPattern) {
  let expr = "";
  let val = 0;
  
  while (true) {
    let nums = [];
    let selectedOps = [];
    
    // 1. Randomly generate initial numbers and operators
    for (let i = 0; i < operandCount; i++) {
      nums.push(floor(random(range[0], range[1])));
      if (i < operandCount - 1) selectedOps.push(random(ops));
    }
    
    // 2. Force division pairs to be exact multiples
    for (let i = 0; i < selectedOps.length; i++) {
      if (selectedOps[i] === '/') {
        let divisor = (divPattern === '2d') ? floor(random(2, 15)) : floor(random(2, 10));
        let quotient = floor(random(2, 20));
        nums[i] = quotient * divisor; // Dividend
        nums[i+1] = divisor;          // Divisor
      }
    }
    
    // 3. Build the mathematical expression string
    expr = nums[0].toString();
    for (let i = 0; i < selectedOps.length; i++) {
      expr += " " + selectedOps[i] + " " + nums[i+1];
    }
    
    val = eval(expr);
    
    // 4. Validation: Final value must be a positive integer, and all internal divisions must have no remainder
    if (val > 0 && Number.isInteger(val)) {
      let parts = expr.split(' ');
      let isStrictIntegerDivision = true;
      for (let k = 0; k < parts.length; k++) {
        if (parts[k] === '/') {
          if (parseInt(parts[k-1]) % parseInt(parts[k+1]) !== 0) {
            isStrictIntegerDivision = false;
          }
        }
      }
      if (isStrictIntegerDivision) break;
    }
  }
  
  return { expr, value: val }; 
}

function generateTrials() {
  randomSeed(CONFIG.PARTICIPANT_ID);
  
  // Randomize the order of levels
  let levelIndices = shuffle([0, 1, 2]);

  for (let i = 0; i < levelIndices.length; i++) {
    let l = levelIndices[i];
    
    for (let s = 0; s < LEVEL_CONFIG[l].stages.length; s++) {
      const stage = LEVEL_CONFIG[l].stages[s];
      
      for (let t = 0; t < TRIALS_PER_STAGE; t++) {
        let left, right;
        let isValidTrial = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 1000;

        // Rejection Sampling loop to control relative difference
        while (!isValidTrial && attempts < MAX_ATTEMPTS) {
          attempts++;
          
          // Generate two expressions using Stage configurations
          left = generateExpression(stage.terms, stage.operators, stage.range, '2d');
          right = generateExpression(stage.terms, stage.operators, stage.range, '2d');
          
          if (left.value === right.value) continue;

          // Calculate relative difference
          const maxA = Math.max(left.value, right.value);
          const absDiff = Math.abs(left.value - right.value);
          const relativeDiff = absDiff / maxA;

          // Check distance condition based on stage difficulty settings
          if (relativeDiff >= stage.minRatio && relativeDiff <= stage.maxRatio) {
            isValidTrial = true;
          }
        }

        // Fallback to a simple default equation if a valid one isn't found after 1000 attempts to prevent crashing
        if (!isValidTrial) {
          console.warn(`MAX_ATTEMPTS reached for Level ${l+1}, Stage ${s+1}`);
          left = { expr: "10 + 5", value: 15 };
          right = { expr: "20 - 2", value: 18 };
        }
        
        // Add the validated trial to the main game array
        trials.push({
          levelIdx: l + 1, 
          stageIdx: s + 1, 
          leftExpression: left.expr,
          rightExpression: right.expr,
          leftValue: left.value,
          rightValue: right.value,
          correctAnswer: left.value > right.value ? 'LEFT' : 'RIGHT',
          responseWindow: LEVEL_CONFIG[l].timer, 
          operatorSet: stage.operators.join(' '),
          precedence: stage.operators.includes('*') || stage.operators.includes('/') ? 1 : 0,
          absoluteDistance: Math.abs(left.value - right.value)
        });
      }
    }
  }
}

/* ===================== SETUP ===================== */

function setup() {
  let style = document.createElement('style');
  style.innerHTML = 'html, body { margin: 0; padding: 0; overflow: hidden; }';
  document.head.appendChild(style);

  createCanvas(windowWidth, windowHeight);
  
  let idInput = prompt("Participant ID:");
  if (idInput === null || idInput.trim() === "") {
    CONFIG.PARTICIPANT_ID = Math.floor(Math.random() * 10000);
  } else {
    CONFIG.PARTICIPANT_ID = idInput.trim();
  }

  randomSeed(parseInt(CONFIG.PARTICIPANT_ID) || 1);
  textAlign(CENTER, CENTER);
  rectMode(CENTER);
  generateTrials();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/* =================== DRAW LOOP =================== */

function draw() {
  background(CONFIG.CANVAS_BG);
  
  switch (experimentState) {
    case STATES.LEVEL_INSTRUCTIONS: drawLevelInstructions(); break;
    case STATES.FIXATION: drawFixation(); break;
    case STATES.STIMULUS: drawStimulus(); break;
    case STATES.FEEDBACK: drawFeedback(); break;
    case STATES.END: drawEndScreen(); break;
  }
}

/* ================= DRAW FUNCTIONS ================ */

function drawLevelInstructions() {
  fill(0); noStroke(); textSize(CONFIG.INSTRUCTION_SIZE);
  
  if (!CONFIG.SHOW_INSTRUCTIONS) {
    text("Press SPACE to start the task.", width / 2, height / 2);
  } else {
    let activeLevelIndex = trials[globalTrialIdx].levelIdx - 1;
    text(LEVEL_INSTRUCTIONS[activeLevelIndex], width / 2, height / 2);
  }
}

function drawFixation() {
  fill(0); noStroke(); textSize(50);
  text("+", width / 2, height / 2);
}

function drawStimulus() {
  const t = trials[globalTrialIdx];
  noStroke();
  
  fill(CONFIG.BOX_COLOR_LEFT);
  rect(width / 4, height / 2, CONFIG.BOX_WIDTH, CONFIG.BOX_HEIGHT, CONFIG.BOX_RADIUS);
  fill(CONFIG.BOX_COLOR_RIGHT);
  rect(3 * width / 4, height / 2, CONFIG.BOX_WIDTH, CONFIG.BOX_HEIGHT, CONFIG.BOX_RADIUS);
  
  fill(CONFIG.TEXT_COLOR); textSize(CONFIG.TEXT_SIZE);

  let displayLeft = t.leftExpression.replace(/\*/g, '×').replace(/\//g, '÷');
  let displayRight = t.rightExpression.replace(/\*/g, '×').replace(/\//g, '÷');

  text(displayLeft, width / 4, height / 2);
  text(displayRight, 3 * width / 4, height / 2);
}

function drawFeedback() {
  if (!CONFIG.SHOW_FEEDBACK) return;
  fill(CONFIG.FEEDBACK_COLOR); textSize(CONFIG.FEEDBACK_SIZE);
  text(feedbackText, width / 2, height / 2);
}

function drawEndScreen() {
  fill(0); textSize(CONFIG.INSTRUCTION_SIZE);
  text("Task Complete.\nPress 'S' to save data.", width / 2, height / 2);
}

/* ================ STATE HANDLERS ================ */

function getRelativeTime() {
  return performance.now() - sessionStartTimeMonotonic;
}

function keyPressed() {
  if (experimentState === STATES.LEVEL_INSTRUCTIONS && key === ' ') {
    if (globalTrialIdx === 0) {
      sessionStartUTC = new Date().toISOString();
      sessionStartTimeMonotonic = performance.now();
    }
    startTrial();
  }
  
  if (experimentState === STATES.STIMULUS) {
    let now = getRelativeTime();
    if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
      handleResponse(keyCode === LEFT_ARROW ? 'LEFT' : 'RIGHT', now);
    } else {
      // Log invalid key without ending the trial
      currentTrialInvalidKeys.push(key);
    }
  }

  if (experimentState === STATES.END && (key === "s" || key === "S")) {
    exportCSV();
  }
}

function startTrial() {
  experimentState = STATES.FIXATION;
  currentTrialInvalidKeys = []; // Clear invalid keys for the new trial
  trialStartMs = getRelativeTime();
  fixationOnsetMs = getRelativeTime();
  fixationDurationMs = random(CONFIG.FIXATION_MIN, CONFIG.FIXATION_MAX);
  
  setTimeout(() => {
    experimentState = STATES.STIMULUS;
    stimulusOnsetMs = getRelativeTime();
    
    const t = trials[globalTrialIdx];
    timeoutRef = setTimeout(() => {
      if (experimentState === STATES.STIMULUS) handleResponse("TIMEOUT", getRelativeTime());
    }, t.responseWindow);
    
  }, fixationDurationMs);
}

function handleResponse(userResponse, eventTime) {
  clearTimeout(timeoutRef);
  const t = trials[globalTrialIdx];
  const reactionTime = eventTime - stimulusOnsetMs;
  const stimulusOffsetMs = eventTime; 
  
  const isTimeout = userResponse === "TIMEOUT";
  const isCorrect = userResponse === t.correctAnswer;
  
  if (isTimeout) {
    feedbackText = "Timeout!";
    currentStreak = 0;
  } else if (isCorrect) {
    feedbackText = "Correct!";
    currentStreak++;
  } else {
    feedbackText = "Incorrect!";
    currentStreak = 0;
  }
  
  let fType = isTimeout ? "timeout" : (isCorrect ? "correct" : "incorrect");
  let invalidKeysStr = currentTrialInvalidKeys.length > 0 ? currentTrialInvalidKeys.join(' ') : "none";

  // Static fields were removed from here
  logs.push({
    stageTrialIdx: stageTrialIdx + 1,
    levelTrialIndex: levelTrialIdx + 1,
    trialIndexGlobal: globalTrialIdx + 1,
    levelIndex: t.levelIdx,
    stageIndex: t.stageIdx,
    trialStartMs: trialStartMs,
    fixationOnsetMs: fixationOnsetMs,
    fixationDurationMs: fixationDurationMs,
    stimulusOnsetMs: stimulusOnsetMs,
    stimulusOffsetMs: stimulusOffsetMs,
    responseWindowMs: t.responseWindow,
    reactionTimeMs: isTimeout ? "" : reactionTime,
    correctResponse: t.correctAnswer,
    userResponse: userResponse,
    invalidKeysBeforeResponse: invalidKeysStr, // New column
    accuracy: isCorrect ? 1 : 0,
    timeout: isTimeout ? 1 : 0,
    feedbackType: fType,
    streak: currentStreak,
    leftExpression: "'" + t.leftExpression,
    rightExpression: "'" + t.rightExpression,
    operatorSet: t.operatorSet,
    precedence: t.precedence,
    leftValue: t.leftValue,
    rightValue: t.rightValue,
    absoluteDistance: t.absoluteDistance
  });
  
  if (CONFIG.SHOW_FEEDBACK) {
    experimentState = STATES.FEEDBACK;
    setTimeout(advanceTrial, CONFIG.FEEDBACK_DURATION);
  } else {
    advanceTrial();
  }
}

function advanceTrial() {
  globalTrialIdx++;
  levelTrialIdx++;
  stageTrialIdx++;
  
  if (globalTrialIdx >= trials.length) {
    experimentState = STATES.END;
    return;
  }
  
  const nextTrial = trials[globalTrialIdx];
  const prevTrial = trials[globalTrialIdx - 1];
  
  if (nextTrial.stageIdx !== prevTrial.stageIdx) {
      stageTrialIdx = 0; 
  }

    if (nextTrial.levelIdx !== prevTrial.levelIdx) {
      levelTrialIdx = 0; 
  }

  if (nextTrial.levelIdx !== prevTrial.levelIdx && CONFIG.SHOW_INSTRUCTIONS) {
    experimentState = STATES.LEVEL_INSTRUCTIONS;
  } else {
    startTrial();
  }
}

/* ================== DATA EXPORT =================== */

function exportCSV() {
  if (logs.length === 0) return;
  
  const totalDuration = getRelativeTime();

  // Generate metadata header independently
  let csvContent = "--- SESSION METADATA ---\n";
  csvContent += `ParticipantID,${CONFIG.PARTICIPANT_ID}\n`;
  csvContent += `SessionStartUTC,${sessionStartUTC}\n`;
  csvContent += `SessionDurationMs,${totalDuration.toFixed(2)}\n`;
  csvContent += `ResponseType,keypress\n\n`;
  
  // Generate trial data
  csvContent += "--- TRIAL DATA ---\n";
  const headers = Object.keys(logs[0]).join(",") + "\n";
  const rows = logs.map(row => Object.values(row).join(",")).join("\n");
  csvContent += headers + rows;

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Chalkboard_Results_${CONFIG.PARTICIPANT_ID}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}