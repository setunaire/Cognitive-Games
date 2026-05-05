/* =========================================================
   Brain Shift Task – PROTOTYPE 
   
   MOUSE INPUT & COLORS
   =========================================================
*/

/* ==================== CONFIG ==================== */

const CANVAS_BG = '#ebebeb';

const FIXATION_MIN = 500;
const FIXATION_MAX = 1000;
const FEEDBACK_DURATION = 1000;
const POST_RESPONSE_DELAY = 250;

const TOTAL_LEVELS = 3;

// Stimuli Definition
const VOWELS = ['A', 'E', 'I', 'O', 'U'];
const CONSONANTS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'];
const EVENS = [0, 2, 4, 6, 8];
const ODDS = [1, 3, 5, 7, 9];

// Layout Dimensions & Colors
const BOX_WIDTH = 250;
const BOX_HEIGHT = 150;
const BOX_GAP = 20;

const INSTRUCTION_SIZE = 26;
const STIMULUS_SIZE = 50;
const BUTTON_SIZE = 50;
const FIXATION_SIZE = 30;
const FEEDBACK_SIZE = 30;



const COLOR_BOX_BORDER = '#ebebeb';
const COLOR_TEXT = '#000000';

// Distinct colors for each box
const COLOR_TOP_LEFT = '#9ad3fcc4';    // Light Blue
const COLOR_TOP_RIGHT = '#feb0a9d2';   // Light Red
const COLOR_BOTTOM_LEFT = '#a6ffcdca'; // Light Green
const COLOR_BOTTOM_RIGHT = '#ffea98c0';// Light Yellow

// Positions Mapping
const POSITIONS = {
  TOP_LEFT: { id: 'top-left', task: 'number', expected: 'even' },
  TOP_RIGHT: { id: 'top-right', task: 'number', expected: 'odd' },
  BOTTOM_LEFT: { id: 'bottom-left', task: 'letter', expected: 'vowel' },
  BOTTOM_RIGHT: { id: 'bottom-right', task: 'letter', expected: 'consonant' }
};

// LEVEL INSTRUCTIONS
const levelInstructions = [
`Level 1
On each trial a letter–digit pair appears in one of the 2 boxes on top of the screen.
At first, you should pay attention to the number in this pair.

Each box have a label:
Top-Left box = Even  |  Top-Right box = Odd

Click YES on the screen if the number in the pair matches the box label.
Click NO on the screen if it does not match.

Then, you'll see the pair appears in 2 boxes on the bottom of the screen.
you should pay attention to the letter in the pair.

Each box have a label:
Bottom-Left box = Vowel  |  Bottom-Right box = Consonant

Click YES on the screen if the letter in the pair matches the box label.
Click NO on the screen if it does not match.

Press SPACE to start.`,

`Level 2

Now there are 4 boxes.
Top boxes are for NUMBERS (Left=Even, Right=Odd).
Bottom boxes are for LETTERS (Left=Vowel, Right=Consonant).

Pay attention to where the Stimulus (e.g. A4) appears!

Click YES on the screen if the pair matches the box label.
Click NO on the screen if it does not match.

Press SPACE to start.`,

`Level 3

Same rules, but the LABELS are HIDDEN!
Remember:
Top-Left = Even      |   Top-Right = Odd
Bottom-Left = Vowel  |   Bottom-Right = Consonant

Click YES or NO on the screen.

Press SPACE to start.`
];

// LEVEL DEFINITIONS
const levels = [
  { level: 1, trialsCount: 10, showLabels: true, responseWindow: 3000, switchRate: 0 },
  { level: 2, trialsCount: 20, showLabels: true, responseWindow: 2500, switchRate: 0.4 },
  { level: 3, trialsCount: 30, showLabels: false, responseWindow: 2000, switchRate: 0.6 }
];

/* ===================== STATES ===================== */

const STATES = {
  LEVEL_INSTRUCTIONS: 'level_instructions',
  FIXATION:           'fixation',
  STIMULUS:           'stimulus',
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
let responseStartTime   = null;
let postResponseStartTime = null;

let responseGiven       = false;
let activeTrial         = null;
let feedbackText        = '';
let feedbackStartTime   = null;

let trials = [];
let logs   = [];

/* ========== TRIAL GENERATOR ========== */

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSequenceConstraints(transitionsCount, switchRate) {
  let seqValid = false;
  let seq = [];
  const switchCount = Math.round(transitionsCount * switchRate);
  const repeatCount = transitionsCount - switchCount;

  while (!seqValid) {
    seq = [];
    for (let i = 0; i < switchCount; i++) seq.push('S');
    for (let i = 0; i < repeatCount; i++) seq.push('R');
    
    seq.sort(() => Math.random() - 0.5);
    const seqStr = seq.join('');
    
    if (!seqStr.includes('RRRR') && !seqStr.includes('SRSR') && !seqStr.includes('RSRS')) {
      seqValid = true;
    }
  }
  return seq;
}

function generateTrialsForLevel(levelConfig, levelIndex) {
  let levelTrials = [];
  let tasks = [];

  if (levelConfig.level === 1) {
    for (let i = 0; i < 5; i++) tasks.push('number');
    for (let i = 0; i < 5; i++) tasks.push('letter');
  } else {
    const seq = generateSequenceConstraints(levelConfig.trialsCount - 1, levelConfig.switchRate);
    let currentTask = Math.random() < 0.5 ? 'number' : 'letter';
    tasks.push(currentTask);
    for (let i = 0; i < seq.length; i++) {
      if (seq[i] === 'S') currentTask = currentTask === 'number' ? 'letter' : 'number';
      tasks.push(currentTask);
    }
  }

  for (let i = 0; i < tasks.length; i++) {
    let task = tasks[i];
    let isYesTrial = Math.random() < 0.5;
    let positionId;

    if (task === 'number') {
      positionId = Math.random() < 0.5 ? POSITIONS.TOP_LEFT.id : POSITIONS.TOP_RIGHT.id;
    } else {
      positionId = Math.random() < 0.5 ? POSITIONS.BOTTOM_LEFT.id : POSITIONS.BOTTOM_RIGHT.id;
    }

    let posConfig = Object.values(POSITIONS).find(p => p.id === positionId);
    let isEven = false, isVowel = false;
    let digit, letter;

    if (task === 'number') {
      let needsEven = (posConfig.expected === 'even' && isYesTrial) || (posConfig.expected === 'odd' && !isYesTrial);
      digit = needsEven ? getRandomItem(EVENS) : getRandomItem(ODDS);
      isEven = needsEven;
      isVowel = Math.random() < 0.5;
      letter = isVowel ? getRandomItem(VOWELS) : getRandomItem(CONSONANTS);
    } else {
      let needsVowel = (posConfig.expected === 'vowel' && isYesTrial) || (posConfig.expected === 'consonant' && !isYesTrial);
      letter = needsVowel ? getRandomItem(VOWELS) : getRandomItem(CONSONANTS);
      isVowel = needsVowel;
      isEven = Math.random() < 0.5;
      digit = isEven ? getRandomItem(EVENS) : getRandomItem(ODDS);
    }

    let pair = Math.random() < 0.5 ? `${letter}${digit}` : `${digit}${letter}`;
    let previousTask = i === 0 ? 'none' : tasks[i - 1];
    let trialType = (i === 0 || levelConfig.level === 1) ? 'first/fixed' : (task !== previousTask ? 'switch' : 'repeat');

    levelTrials.push({
      levelConfig, taskType: task, trialType: trialType, previousTask: previousTask,
      position: positionId, expectedAnswer: isYesTrial ? 'YES' : 'NO',
      stimulusPair: pair, stimulusLetter: letter, stimulusDigit: digit,
      letterType: isVowel ? 'vowel' : 'consonant', digitType: isEven ? 'even' : 'odd'
    });
  }
  return levelTrials;
}

/* ===================== SETUP ===================== */

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  textFont('monospace');

  levels.forEach((lvl, idx) => {
    trials = trials.concat(generateTrialsForLevel(lvl, idx));
  });

  startExperiment();
}

/* =================== DRAW LOOP =================== */

function draw() {
  background(CANVAS_BG);

  switch (experimentState) {
    case STATES.LEVEL_INSTRUCTIONS:
      drawInstructions();
      break;
    case STATES.FIXATION:
      drawFixation();
      handleFixation();
      break;
    case STATES.STIMULUS:
      drawLayout(true);
      drawStimulus();
      drawButtons();
      handleStimulus();
      break;
    case STATES.POST_RESPONSE:
      drawLayout(true);
      handlePostResponse();
      break;
    case STATES.FEEDBACK:
      drawFeedback();
      break;
    case STATES.END:
      drawEndScreen();
      break;
  }
}

/* ================= DRAW FUNCTIONS ================ */

function drawInstructions() {
  fill(0); noStroke(); textSize(INSTRUCTION_SIZE);
  text(levelInstructions[currentLevel], width / 2, height / 2);
}

function drawLayout(isEmpty) {
  const cfg = levels[currentLevel];
  let drawTop = cfg.level !== 1 || (cfg.level === 1 && currentTrialIndex < 5);
  let drawBottom = cfg.level !== 1 || (cfg.level === 1 && currentTrialIndex >= 5);

  rectMode(CENTER);
  stroke(COLOR_BOX_BORDER);
  strokeWeight(2);

  const cx = width / 2; const cy = height / 2 - 30; // Shifted up to make room for buttons
  
  const tlX = cx - BOX_WIDTH/2 - BOX_GAP; const tlY = cy - BOX_HEIGHT/2 - BOX_GAP;
  const trX = cx + BOX_WIDTH/2 + BOX_GAP; const trY = cy - BOX_HEIGHT/2 - BOX_GAP;
  const blX = cx - BOX_WIDTH/2 - BOX_GAP; const blY = cy + BOX_HEIGHT/2 + BOX_GAP;
  const brX = cx + BOX_WIDTH/2 + BOX_GAP; const brY = cy + BOX_HEIGHT/2 + BOX_GAP;

  if (drawTop) {
    fill(COLOR_TOP_LEFT);  rect(tlX, tlY, BOX_WIDTH, BOX_HEIGHT, 10);
    fill(COLOR_TOP_RIGHT); rect(trX, trY, BOX_WIDTH, BOX_HEIGHT, 10);
    if (cfg.showLabels) {
      fill(COLOR_TEXT); noStroke(); textSize(INSTRUCTION_SIZE);
      text("EVEN", tlX, tlY - BOX_HEIGHT/2 + 20);
      text("ODD", trX, trY - BOX_HEIGHT/2 + 20);
    }
  }

  if (drawBottom) {
    stroke(COLOR_BOX_BORDER); strokeWeight(2);
    fill(COLOR_BOTTOM_LEFT);  rect(blX, blY, BOX_WIDTH, BOX_HEIGHT, 10);
    fill(COLOR_BOTTOM_RIGHT); rect(brX, brY, BOX_WIDTH, BOX_HEIGHT, 10);
    if (cfg.showLabels) {
      fill(COLOR_TEXT); noStroke(); textSize(INSTRUCTION_SIZE);
      text("VOWEL", blX, blY - BOX_HEIGHT/2 + 20);
      text("CONSONANT", brX, brY - BOX_HEIGHT/2 + 20);
    }
  }
}

function drawButtons() {
  rectMode(CENTER);
  stroke(COLOR_BOX_BORDER);
  strokeWeight(2);
  
  const btnW = width / 2 - 10;
  const btnH = 150;
  const btnY = height - btnH / 2 - 5;
  const yesX = width / 4;
  const noX = (3 * width) / 4;

  // YES Button
  fill('#6060607d');
  rect(yesX, btnY, btnW, btnH, 10);
  fill(0); noStroke(); textSize(BUTTON_SIZE);
  text("YES", yesX, btnY);

  // NO Button
  stroke(COLOR_BOX_BORDER); strokeWeight(2); fill('#6060607d');
  rect(noX, btnY, btnW, btnH, 10);
  fill(0); noStroke();
  text("NO", noX, btnY);
}

function drawFixation() {
  fill(0); noStroke(); textSize(FIXATION_SIZE);
  text('+', width / 2, height / 2 - 30);
}

function drawStimulus() {
  fill(0); noStroke(); textSize(STIMULUS_SIZE);
  const cx = width / 2; const cy = height / 2 - 30;
  let x, y;

  switch (activeTrial.position) {
    case POSITIONS.TOP_LEFT.id:     x = cx - BOX_WIDTH/2 - BOX_GAP; y = cy - BOX_HEIGHT/2 - BOX_GAP; break;
    case POSITIONS.TOP_RIGHT.id:    x = cx + BOX_WIDTH/2 + BOX_GAP; y = cy - BOX_HEIGHT/2 - BOX_GAP; break;
    case POSITIONS.BOTTOM_LEFT.id:  x = cx - BOX_WIDTH/2 - BOX_GAP; y = cy + BOX_HEIGHT/2 + BOX_GAP; break;
    case POSITIONS.BOTTOM_RIGHT.id: x = cx + BOX_WIDTH/2 + BOX_GAP; y = cy + BOX_HEIGHT/2 + BOX_GAP; break;
  }
  text(activeTrial.stimulusPair, x, y);
}

function drawFeedback() {
fill(0); textSize(FEEDBACK_SIZE);
  text(feedbackText, width / 2, height / 2 - 30);
  handleFeedback();
}

function drawEndScreen() {
  fill(0); noStroke(); textSize(INSTRUCTION_SIZE);
  text('Experiment finished.\nPress S to save data.', width / 2, height / 2);
}

/* ================= STATE HANDLERS ================ */

function handleFixation() {
  if (millis() - fixationStartTime >= fixationDuration) {
    activeTrial = trials[globalTrialIndex];
    stimulusOnsetTime = millis();
    responseStartTime = millis();
    responseGiven = false;
    experimentState = STATES.STIMULUS;
  }
}

function handleStimulus() {
  const cfg = levels[currentLevel];
  if (millis() - responseStartTime >= cfg.responseWindow) {
    finalizeTrial("TIMEOUT");
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
  if (experimentState === STATES.STIMULUS && !responseGiven) {
    const btnW = width / 2 - 10;
    const btnH = 150;
    const btnY = height - btnH / 2 - 5;
    const yesX = width / 4;
    const noX = (3 * width) / 4;
    
    // Check YES
    if (mouseX > yesX - btnW/2 && mouseX < yesX + btnW/2 &&
        mouseY > btnY - btnH/2 && mouseY < btnY + btnH/2) {
      finalizeTrial('YES');
    }
    // Check NO
    else if (mouseX > noX - btnW/2 && mouseX < noX + btnW/2 &&
             mouseY > btnY - btnH/2 && mouseY < btnY + btnH/2) {
      finalizeTrial('NO');
    }
  }
}

/* =========== TRIAL FINALIZATION & LOGGING =========== */

function finalizeTrial(userResponse) {
  if (responseGiven) return;
  responseGiven = true;
  
  const now = millis();
  const cfg = levels[currentLevel];
  const reactionTime = round(now - responseStartTime);
  
  let isCorrect = (userResponse === activeTrial.expectedAnswer) ? 1 : 0;
  
  if (userResponse === "TIMEOUT") {
    feedbackText = "Timeout";
    isCorrect = 0;
  } else {
    feedbackText = isCorrect ? "Correct" : "Incorrect";
  }

  logs.push({
    level: cfg.level, trialIndex: currentTrialIndex + 1, trialIndexGlobal: globalTrialIndex + 1,
    fixationStartTime: round(fixationStartTime), fixationDuration: round(fixationDuration),
    trialStartTime: round(stimulusOnsetTime), trialDuration: reactionTime,
    responseWindow: cfg.responseWindow, reactionTime: userResponse === "TIMEOUT" ? "NA" : reactionTime,
    responseTimeAbsolute: round(now), stimulusPair: activeTrial.stimulusPair,
    stimulusLetter: activeTrial.stimulusLetter, stimulusDigit: activeTrial.stimulusDigit,
    stimulusPosition: activeTrial.position, taskType: activeTrial.taskType,
    trialType: activeTrial.trialType, previousTask: activeTrial.previousTask,
    letterType: activeTrial.letterType, digitType: activeTrial.digitType,
    correctResponse: activeTrial.expectedAnswer, userResponse: userResponse,
    correct: isCorrect, feedback: feedbackText
  });

  postResponseStartTime = millis();
  experimentState = STATES.POST_RESPONSE; 
}

/* ============ TRIAL / LEVEL PROGRESSION ============ */

function advanceTrial() {
  globalTrialIndex++;
  currentTrialIndex++;

  if (currentTrialIndex >= levels[currentLevel].trialsCount) {
    currentLevel++;
    currentTrialIndex = 0;

    if (currentLevel < TOTAL_LEVELS) {
      experimentState = STATES.LEVEL_INSTRUCTIONS;
      return;
    } else {
      experimentState = STATES.END;
      return;
    }
  }
  startFixation();
}

/* =============== EXPERIMENT CONTROL =============== */

function startExperiment() {
  startTime = round(millis());
  currentLevel = 0; currentTrialIndex = 0; globalTrialIndex = 0;
  experimentState = STATES.LEVEL_INSTRUCTIONS;
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
  a.download = 'BrainShiftData.csv';
  a.click();
  URL.revokeObjectURL(url);
}