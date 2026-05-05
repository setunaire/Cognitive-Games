/* =========================================================
   Visual Search Task – PROTOTYPE
   =========================================================
*/

/* ==================== CONFIG ==================== */

const CANVAS_BG = 'rgb(235,235,235)';

const FIXATION_MIN = 500;
const FIXATION_MAX = 1000;

const FEEDBACK_DURATION = 1000;
const FEEDBACK_SIZE = 30;
const INSTRUCTION_SIZE = 30;

const STIMULUS_SIZE = 80; // Base size of the shapes
const MARGIN = 100;       // Safe area from screen edges

const TOTAL_LEVELS = 3;
const TRIALS_PER_LEVEL = 8;

// Available features for dynamic generation
const COLORS = ['aqua', 'blue', 'blueviolet', 'brown', 'darkcyan', 'gold', 'green','hotpink', 'limegreen',
                'magenta', 'olive', 'orange', 'purple', 'red', 'teal', 'violet', 'yellow',];
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'cross', 'ring'];

// LEVEL DEFINITIONS
const levels = [
  {
    mode: "feature",
    setSize: 15,
    responseWindow: 5000,
    crowdingPadding: 50, // Normal spatial spacing
    distractorPairs: [[14, 0]], // Only one type of distractor in feature search
    instruction: "Level 1\n\nFind the UNIQUE object and click on it as fast as you can.\n\nPress SPACE to start."
  },
  {
    mode: "conjunction",
    setSize: 15,
    responseWindow: 6000,
    crowdingPadding: 50, // Normal spatial spacing
    distractorPairs: [[7, 7], [6, 8], [5, 9]], 
    instruction: "Level 2\n\nFind the object that has a UNIQUE COMBINATION of color and shape.\nClick on it as fast as you can.\n\nPress SPACE to start."
  },
  {
    mode: "conjunction_crowded",
    setSize: 33,
    responseWindow: 5000,
    crowdingPadding: 7, // Reduced padding for high spatial crowding
    distractorPairs: [[16, 16], [17, 15], [18, 14], [19, 13], [20, 12]],
    instruction: "Level 3\n\nMore objects, closer together.\nFind the UNIQUE COMBINATION and click on it.\n\nPress SPACE to start."
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
let currentTrialData = null; // Holds currently active trial details

let backgroundClicksCount = 0; // NEW: Track background clicks per trial

/* === TRIAL GENERATOR (CONTROLLED RANDOMIZATION) === */

// Helper to get random item from array
function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to shuffle array
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// Generates features for target and distractors
function generateTrialFeatures(mode, distractorCounts) {
  let targetColor = getRandom(COLORS);
  let targetShape = getRandom(SHAPES);
  
  let d1Color, d1Shape, d2Color, d2Shape;

  if (mode === "feature") {
    // Feature search: differ only in color (for simplicity)
    let otherColors = COLORS.filter(c => c !== targetColor);
    d1Color = getRandom(otherColors);
    d1Shape = targetShape; // Same shape
    
    d2Color = null; d2Shape = null; // No second group
  } else {
    // Conjunction search
    let otherColors = COLORS.filter(c => c !== targetColor);
    let otherShapes = SHAPES.filter(s => s !== targetShape);
    
    d1Color = targetColor;                 // Shares color
    d1Shape = getRandom(otherShapes);      // Differs in shape
    
    d2Color = getRandom(otherColors);      // Differs in color
    d2Shape = targetShape;                 // Shares shape
  }

  return {
    target: { color: targetColor, shape: targetShape },
    distractor1: { color: d1Color, shape: d1Shape, count: distractorCounts[0] },
    distractor2: { color: d2Color, shape: d2Shape, count: distractorCounts[1] || 0 }
  };
}

// Generates valid non-overlapping positions
function generatePositions(numItems, padding) {
  let positions = [];
  let bailout = 0;
  
  while (positions.length < numItems && bailout < 10000) {
    let x = random(MARGIN, windowWidth - MARGIN);
    let y = random(MARGIN, windowHeight - MARGIN);
    let valid = true;

    for (let pos of positions) {
      let d = dist(x, y, pos.x, pos.y);
      if (d < STIMULUS_SIZE + padding) {
        valid = false;
        break;
      }
    }

    if (valid) {
      positions.push({ x, y });
    }
    bailout++;
  }
  return positions;
}

function generateTrialsForLevel(level, levelIndex) {
  let levelTrials = [];

  for (let i = 0; i < TRIALS_PER_LEVEL; i++) {
    let distractorPair = getRandom(level.distractorPairs);
    let features = generateTrialFeatures(level.mode, distractorPair);
    
    levelTrials.push({
      level: levelIndex + 1,
      mode: level.mode,
      setSize: level.setSize,
      responseWindow: level.responseWindow,
      crowdingPadding: level.crowdingPadding,
      features: features
    });
  }
  return levelTrials;
}

/* ===================== SETUP ===================== */

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  noStroke();

  // Pre-generate trial structures
  levels.forEach((level, idx) => {
    trials = trials.concat(generateTrialsForLevel(level, idx));
  });

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
  textSize(INSTRUCTION_SIZE);
  text(levels[currentLevel].instruction, width/2, height/2);
}

function drawFixation() {
  fill(0);
  // textSize(40);
  text("+", width / 2, height / 2);
}

function drawShape(shapeType, x, y, size) {
    let radius = size / 2;
    
    push(); // fill & stroke
    
    switch (shapeType) {
        case 'circle':
            circle(x, y, size);
            break;
        case 'square':
            rectMode(CENTER);
            square(x, y, size);
            break;
        case 'triangle':
            drawPolygon(x, y, radius, 3);
            break;
        case 'diamond':
            drawPolygon(x, y, radius, 4);
            break;
        case 'pentagon':
            drawPolygon(x, y, radius, 5);
            break;
        case 'hexagon':
            drawPolygon(x, y, radius, 6);
            break;
        case 'star':
            drawStar(x, y, radius * 0.4, radius, 5);
            break;
        case 'cross':
            drawCross(x, y, size, size * 0.3);
            break;
        case 'ring':
            noFill();
            stroke(currentFillColor());
            strokeWeight(size * 0.2); 
            circle(x, y, size * 0.8);
            break;
    }
    
    pop();
}

// Polygon
function drawPolygon(x, y, radius, npoints) {
  let angle = TWO_PI / npoints;
  beginShape();
  for (let a = 0; a < TWO_PI; a += angle) {
    let sx = x + cos(a) * radius;
    let sy = y + sin(a) * radius;
    vertex(sx, sy);
  }
  endShape(CLOSE);
}

// Star
function drawStar(x, y, radius1, radius2, npoints) {
    let angle = TWO_PI / npoints;
    let halfAngle = angle / 2.0;
    beginShape();
    // Rotation
    for (let a = -PI / 2; a < TWO_PI - PI / 2; a += angle) {
        let sx = x + cos(a) * radius2;
        let sy = y + sin(a) * radius2;
        vertex(sx, sy);
        sx = x + cos(a + halfAngle) * radius1;
        sy = y + sin(a + halfAngle) * radius1;
        vertex(sx, sy);
    }
    endShape(CLOSE);
}
// Cross
function drawCross(x, y, size, thickness) {
    rectMode(CENTER);
    noStroke();
    rect(x, y, size, thickness); 
    rect(x, y, thickness, size);
}

// Extract current color for Ring
function currentFillColor() {
    let c = drawingContext.fillStyle;
    return c;
}

function drawStimulus() {
  if (!stimulusVisible || !currentTrialData) return;

  currentTrialData.items.forEach(item => {
    fill(item.color);
    drawShape(item.shape, item.x, item.y, STIMULUS_SIZE);
  });
}


function drawFeedback() {
  fill(0);
  textSize(FEEDBACK_SIZE);
  text(feedbackText, width/2, height/2);
}

function drawEndScreen() {
  fill(0);
  textSize(INSTRUCTION_SIZE);
  text("Experiment finished\nPress S to save data", width / 2, height / 2);
}

/* ================ STATE HANDLERS ================ */

function handleFixation() {
  if (millis() - fixationStartTime >= fixationDuration) {
    prepareStimulusPresentation();
    stimulusOnsetTime = millis();
    stimulusVisible = true;
    responseGiven = false;
    backgroundClicksCount = 0;
    experimentState = STATES.STIMULUS;
  }
}

function handleStimulus() {
  const trial = trials[globalTrialIndex];
  const elapsed = millis() - stimulusOnsetTime;

  if (elapsed >= trial.responseWindow) {
    finalizeTrial(null, null, null); // Timeout
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
    startFixation();
  }

  if (experimentState === STATES.END && (key === "s" || key === "S")) {
    exportCSV();
  }
}

function mousePressed() {
  if (experimentState !== STATES.STIMULUS || responseGiven) return;

  // Check collision with items
  let clickedItem = null;
  let clickRadius = STIMULUS_SIZE / 2; // Hitbox

  for (let item of currentTrialData.items) {
    if (dist(mouseX, mouseY, item.x, item.y) <= clickRadius) {
      clickedItem = item;
      break;
    }
  }

  if (clickedItem) {
    // Clicked on a shape (either target or distractor) -> Finalize trial
    finalizeTrial(mouseX, mouseY, clickedItem);
  } else {
    // Clicked background -> Ignore for completion, but count it
    backgroundClicksCount++;
  }
}

/* =========== TRIAL FINALIZATION & LOGGING =========== */

function prepareStimulusPresentation() {
  const trial = trials[globalTrialIndex];
  
  // Generate random coords based on current screen size and level crowding
  let positions = generatePositions(trial.setSize, trial.crowdingPadding);
  
  let items = [];
  let f = trial.features;

  // Create Target
  items.push({
    isTarget: true,
    color: f.target.color,
    shape: f.target.shape,
    x: positions[0].x,
    y: positions[0].y
  });

  let posIndex = 1;
  
  // Create Distractors 1
  for (let i = 0; i < f.distractor1.count; i++) {
    items.push({
      isTarget: false,
      color: f.distractor1.color,
      shape: f.distractor1.shape,
      x: positions[posIndex].x,
      y: positions[posIndex].y
    });
    posIndex++;
  }

  // Create Distractors 2
  for (let i = 0; i < f.distractor2.count; i++) {
    items.push({
      isTarget: false,
      color: f.distractor2.color,
      shape: f.distractor2.shape,
      x: positions[posIndex].x,
      y: positions[posIndex].y
    });
    posIndex++;
  }

  currentTrialData = {
    target: items[0], // Reference to target
    items: shuffle(items) // Shuffle display order
  };
}

function finalizeTrial(uX, uY, clickedItem) {
  if (responseGiven) return;
  responseGiven = true;

  const trial = trials[globalTrialIndex];
  const now = millis();
  
  let correct = 0;
  
  if (clickedItem === null) {
    feedbackText = "Timeout";
    correct = 0;
  } else if (clickedItem.isTarget) {
    feedbackText = "Correct";
    correct = 1;
  } else {
    feedbackText = "Incorrect";
    correct = 0;
  }

  // Calculate Target Eccentricity
  let centerX = windowWidth / 2;
  let centerY = windowHeight / 2;
  let targetEccentricity = dist(currentTrialData.target.x, currentTrialData.target.y, centerX, centerY);

  logs.push({
    startTime,
    level: trial.level,
    mode: trial.mode,
    setSize: trial.setSize,

    trialIndex: currentTrialIndex + 1,
    trialIndexGlobal: globalTrialIndex + 1,
    trialStartTime: stimulusOnsetTime,

    fixationStartTime,
    fixationDuration,

    responseWindow: trial.responseWindow,
    reactionTime: clickedItem ? (now - stimulusOnsetTime) : null,

    targetColor: trial.features.target.color,
    targetType: trial.features.target.shape,
    targetX: currentTrialData.target.x,
    targetY: currentTrialData.target.y,

    userX: uX,
    userY: uY,

    backgroundClicks: backgroundClicksCount,

    windowWidth,
    windowHeight,
    devicePixelRatio: window.devicePixelRatio,
    targetEccentricity: targetEccentricity.toFixed(2),

    distractor1Color: trial.features.distractor1.color,
    distractor1Type: trial.features.distractor1.shape,
    distractor1Count: trial.features.distractor1.count,
    
    distractor2Color: trial.features.distractor2.color || 'none',
    distractor2Type: trial.features.distractor2.shape || 'none',
    distractor2Count: trial.features.distractor2.count,

    feedback: feedbackText,
    correct: correct
  });

  stimulusVisible = false;
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
  a.download = "VisualSearchResults.csv";
  a.click();

  URL.revokeObjectURL(url);
}