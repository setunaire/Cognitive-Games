/* =========================================================
   Memory Matrix Task – Assessment Phase
   ========================================================= */

// --- CONFIGURATION ---
const CONFIG = {
  LEVEL_ORDER_MODE: 'fixed_123', // Modes: 'seeded_shuffle' or 'fixed_123'
  CANVAS_BG: '#ebebeb',
  FIXATION_MIN: 500,
  FIXATION_MAX: 1000,
  BLANK_DURATION: 750,
  TRIALS_PER_STAGE: 3,
  MAX_GRID_PIXELS: 400,
  INSTRUCTION_SIZE: 24,
  SUBMIT_DELAY_MS: 300, // Brief delay to display last clicked cell color
  COLORS: {
    STIMULUS: '#333333',
    SELECTED: '#007bff',
    TILE_BG: '#cccccc',
    TEXT: '#000000',
    GRID_STROKE: '#ffffff'
  }
};

const LEVEL_CONFIGS = [
  { id: 1, gridSize: 3, stimulusDuration: 2500, responseWindow: 8000, stages: [3, 4, 5] },
  { id: 2, gridSize: 4, stimulusDuration: 3000, responseWindow: 10000, stages: [6, 7, 8] },
  { id: 3, gridSize: 5, stimulusDuration: 3500, responseWindow: 12000, stages: [8, 9, 10] }
];

const STATES = { 
  MENU: 'menu', METADATA: 'metadata', INSTRUCTIONS: 'instructions', 
  FIXATION: 'fixation', STIMULUS: 'stimulus', BLANK: 'blank', 
  RECALL: 'recall', LEVEL_SCORE: 'level_score', END: 'end' 
};

// --- GLOBAL VARIABLES ---
let state = STATES.MENU;
let currentPhase = null;
let metaData = { experimentID: '', experimentVersion: '', sessionID: '', participantID: '' };

// UI Elements
let btnFamiliarization, btnAssessment;
let labelExpId, labelExpVer, labelSessId, labelPartId;
let inputExpId, inputExpVer, inputSessId, inputPartId, btnSubmitMeta;
let btnStartLevel, btnSaveCSV, btnReturnMenu;

// Flow & Trial tracking
let levelOrder = [], currentLevelIdx = 0;
let currentTrialIdx = 0, globalTrialIdx = 0;
let levelTrials = [], logs = [], levelScores = [];

// Timers & Metrics
let sessionStartUtc, sessionStartMs = 0;
let trialStartSessionTime = 0, trialStartMs = 0;
let stateStartMs = 0; // Resets on every state change

let fixationOnsetMs = 0, fixationDurationMs = 0;
let stimulusOnsetMs = 0, recallOnsetMs = 0;
let blankOnsetMs = null;

let targetPositions = [], currentResponsePositions = [];
let clickTimesMs = [], firstClickLatencyMs = null, reactionTimeMs = null;
let clickCount = 0, outOfBoundsClickCount = 0;
let isSubmitting = false, submissionTimer = 0, isTimeout = false;

// --- SETUP & UI INITIALIZATION ---
function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  rectMode(CENTER);
  textFont('monospace');
  setupUIElements();
}

function setupUIElements() {
  let cx = windowWidth / 2;
  let cy = windowHeight / 2;

  // Main Menu
  btnFamiliarization = createButton('Familiarization');
  btnFamiliarization.position(cx - 90, cy - 20);
  btnFamiliarization.size(180, 40);
  btnFamiliarization.mousePressed(() => {
    currentPhase = 'Familiarization';
    alert("Familiarization is currently empty.");
  });

  btnAssessment = createButton('Assessment');
  btnAssessment.position(cx - 90, cy + 35);
  btnAssessment.size(180, 40);
  btnAssessment.mousePressed(() => {
    currentPhase = 'Assessment';
    hideMenuUI();
    showMetadataUI();
    changeState(STATES.METADATA);
  });

  // Metadata Inputs (Defaulting to '1')
  labelExpId = createSpan('Experiment ID');
  labelExpId.position(cx - 220, cy - 82);
  inputExpId = createInput('1');
  inputExpId.position(cx - 70, cy - 85);

  labelExpVer = createSpan('Experiment Version');
  labelExpVer.position(cx - 220, cy - 47);
  inputExpVer = createInput('1');
  inputExpVer.position(cx - 70, cy - 50);

  labelSessId = createSpan('Session ID');
  labelSessId.position(cx - 220, cy - 12);
  inputSessId = createInput('1');
  inputSessId.position(cx - 70, cy - 15);

  labelPartId = createSpan('Participant ID');
  labelPartId.position(cx - 220, cy + 23);
  inputPartId = createInput('1');
  inputPartId.position(cx - 70, cy + 20);

  btnSubmitMeta = createButton('Start Experiment');
  btnSubmitMeta.position(cx - 80, cy + 65);
  btnSubmitMeta.size(160, 30);
  btnSubmitMeta.mousePressed(submitMetadata);

  // In-Game UI
  btnStartLevel = createButton('Start Level');
  btnStartLevel.position(cx - 80, cy + 130);
  btnStartLevel.size(160, 35);
  btnStartLevel.mousePressed(() => {
    hideInstructionUI();
    releaseFocus();
    startFixation();
  });

  btnSaveCSV = createButton('Save Logs (CSV)');
  btnSaveCSV.position(cx - 150, cy);
  btnSaveCSV.size(140, 40);
  btnSaveCSV.mousePressed(exportCSV);

  btnReturnMenu = createButton('Return to Menu');
  btnReturnMenu.position(cx + 10, cy);
  btnReturnMenu.size(140, 40);
  btnReturnMenu.mousePressed(() => {
    hideEndUI();
    showMenuUI();
    changeState(STATES.MENU);
  });

  // Initial Visibility Setup
  hideMetadataUI();
  hideInstructionUI();
  hideEndUI();
}

// UI Visibility Toggles
function showMenuUI() { btnFamiliarization.show(); btnAssessment.show(); }
function hideMenuUI() { btnFamiliarization.hide(); btnAssessment.hide(); }
function showMetadataUI() {
  labelExpId.show(); labelExpVer.show(); labelSessId.show(); labelPartId.show();
  inputExpId.show(); inputExpVer.show(); inputSessId.show(); inputPartId.show(); btnSubmitMeta.show();
}
function hideMetadataUI() {
  labelExpId.hide(); labelExpVer.hide(); labelSessId.hide(); labelPartId.hide();
  inputExpId.hide(); inputExpVer.hide(); inputSessId.hide(); inputPartId.hide(); btnSubmitMeta.hide();
}
function showInstructionUI() { btnStartLevel.show(); }
function hideInstructionUI() { btnStartLevel.hide(); }
function showEndUI() { btnSaveCSV.show(); btnReturnMenu.show(); }
function hideEndUI() { btnSaveCSV.hide(); btnReturnMenu.hide(); }

// --- EXPERIMENT FLOW LOGIC ---
function submitMetadata() {
  metaData.experimentID = inputExpId.value();
  metaData.experimentVersion = inputExpVer.value();
  metaData.sessionID = inputSessId.value();
  metaData.participantID = inputPartId.value() || '0';

  hideMetadataUI();
  releaseFocus();

  // Configure Level Order based on CONFIG Mode
  if (CONFIG.LEVEL_ORDER_MODE === 'fixed_123') {
    levelOrder = [0, 1, 2];
  } else {
    // seeded_shuffle
    randomSeed(seedFromParticipant(metaData.participantID));
    levelOrder = shuffleArray([0, 1, 2]);
  }
  
  startApp();
}

function startApp() {
  sessionStartUtc = new Date().toISOString();
  sessionStartMs = millis();
  logs = [];
  levelScores = [];
  currentLevelIdx = 0;
  globalTrialIdx = 0;

  startLevel();
}

function startLevel() {
  if (currentLevelIdx >= 3) {
    changeState(STATES.END);
    hideInstructionUI();
    showEndUI();
    return;
  }
  let lIdx = levelOrder[currentLevelIdx];
  levelTrials = generateTrials(LEVEL_CONFIGS[lIdx]);
  currentTrialIdx = 0;
  levelScores[currentLevelIdx] = 0;
  changeState(STATES.INSTRUCTIONS);
  showInstructionUI();
}

// Setup a new trial
function startFixation() {
  trialStartMs = millis();
  trialStartSessionTime = trialStartMs - sessionStartMs;
  fixationDurationMs = random(CONFIG.FIXATION_MIN, CONFIG.FIXATION_MAX);
  
  // Reset trial responses and tracking variables
  targetPositions = levelTrials[currentTrialIdx].targetPositions;
  currentResponsePositions = [];
  clickTimesMs = [];
  firstClickLatencyMs = null;
  reactionTimeMs = null;
  clickCount = 0;
  outOfBoundsClickCount = 0;
  isSubmitting = false;
  isTimeout = false;

  changeState(STATES.FIXATION);
}

// Generates trials dynamically for a given level config
function generateTrials(levelConf) {
  let trials = [];
  for (let stageIdx = 0; stageIdx < levelConf.stages.length; stageIdx++) {
    let targetCount = levelConf.stages[stageIdx];
    let totalCells = levelConf.gridSize * levelConf.gridSize;

    for (let i = 0; i < CONFIG.TRIALS_PER_STAGE; i++) {
      let pattern = new Set();
      while (pattern.size < targetCount) {
        pattern.add(Math.floor(random(totalCells)));
      }
      trials.push({
        stage: stageIdx + 1,
        trialIndexStage: i + 1,
        gridSize: levelConf.gridSize,
        stimulusDuration: levelConf.stimulusDuration,
        responseWindow: levelConf.responseWindow,
        targetCount: targetCount,
        targetPositions: Array.from(pattern)
      });
    }
  }
  return trials;
}

// --- STATE MANAGEMENT ---
// Handles phase transitions, timer resetting, and cursor visibility
function changeState(newState) {
  state = newState;
  stateStartMs = millis(); // Reset local state timer

  // Manage cursor visibility
  if ([STATES.FIXATION, STATES.STIMULUS, STATES.BLANK].includes(newState)) {
    noCursor();
  } else {
    cursor(ARROW);
  }

  // Record onsets relative to trial start
  let timeFromTrialStart = millis() - trialStartMs;
  if (newState === STATES.FIXATION) fixationOnsetMs = 0;
  else if (newState === STATES.STIMULUS) stimulusOnsetMs = timeFromTrialStart;
  else if (newState === STATES.BLANK) blankOnsetMs = timeFromTrialStart;
  else if (newState === STATES.RECALL) recallOnsetMs = timeFromTrialStart;
}

// --- MAIN RENDER LOOP ---
function draw() {
  background(CONFIG.CANVAS_BG);
  let elapsedTime = millis() - stateStartMs; // Timer logic decoupled from session

  switch (state) {
    case STATES.MENU:
      setBlackText(30);
      text("Memory Matrix", width/2, height/2 - 90);
      break;

    case STATES.METADATA:
      setBlackText(20);
      text("Enter Metadata", width/2, height/2 - 130);
      break;

    case STATES.INSTRUCTIONS:
      let lConf = LEVEL_CONFIGS[levelOrder[currentLevelIdx]];
      setBlackText(CONFIG.INSTRUCTION_SIZE);
      text(`Level ${lConf.id}\n\nMemorize the highlighted cells.\nNo feedback will be provided.\n\nPress 'Start Level' to begin.`, width/2, height/2 - 80);
      break;

    case STATES.FIXATION:
      setBlackText(40);
      text("+", width/2, height/2);
      if (elapsedTime >= fixationDurationMs) {
        changeState(STATES.STIMULUS);
      }
      break;

    case STATES.STIMULUS:
      drawGrid(true);
      if (elapsedTime >= levelTrials[currentTrialIdx].stimulusDuration) {
        changeState(STATES.BLANK);
      }
      break;

    case STATES.BLANK:
      if (elapsedTime >= CONFIG.BLANK_DURATION) {
        changeState(STATES.RECALL);
      }
      break;

    case STATES.RECALL:
      drawGrid(false);
      drawRecallUI();
      
      let tRecall = levelTrials[currentTrialIdx];
      
      if (!isSubmitting) {
        // Evaluate Timeout
        if (elapsedTime >= tRecall.responseWindow) {
          isTimeout = true;
          processTrialSubmission();
        }
      } else {
        // Short pause to render the final clicked cell color before transitioning
        if (millis() - submissionTimer >= CONFIG.SUBMIT_DELAY_MS) {
          processTrialSubmission();
        }
      }
      break;

    case STATES.LEVEL_SCORE:
      setBlackText(CONFIG.INSTRUCTION_SIZE);
      let acc = Math.round((levelScores[currentLevelIdx] / levelTrials.length) * 100);
      text(`Level Complete!\nAccuracy: ${acc}%\nCorrect Trials: ${levelScores[currentLevelIdx]} / ${levelTrials.length}\n\nPress SPACE to continue.`, width/2, height/2);
      break;

    case STATES.END:
      setBlackText(30);
      text("Assessment Complete.", width/2, height/2 - 60);
      break;
  }
}

// --- RENDERING HELPERS ---
function setBlackText(size) {
  noStroke();
  fill(CONFIG.COLORS.TEXT);
  textSize(size);
  textStyle(NORMAL);
}

function drawGrid(isStimulus) {
  let trial = levelTrials[currentTrialIdx];
  let cellSize = CONFIG.MAX_GRID_PIXELS / trial.gridSize;
  let startX = (width - CONFIG.MAX_GRID_PIXELS) / 2;
  let startY = (height - CONFIG.MAX_GRID_PIXELS) / 2;

  rectMode(CORNER);
  stroke(CONFIG.COLORS.GRID_STROKE);
  strokeWeight(4);

  let totalCells = trial.gridSize * trial.gridSize;
  for (let i = 0; i < totalCells; i++) {
    let col = i % trial.gridSize;
    let row = Math.floor(i / trial.gridSize);
    let x = startX + col * cellSize;
    let y = startY + row * cellSize;

    let fillColor = CONFIG.COLORS.TILE_BG;
    if (isStimulus && targetPositions.includes(i)) {
      fillColor = CONFIG.COLORS.STIMULUS;
    } else if (!isStimulus && currentResponsePositions.includes(i)) {
      fillColor = CONFIG.COLORS.SELECTED; // Highlight user selections
    }

    fill(fillColor);
    rect(x, y, cellSize, cellSize, 8);
  }
  rectMode(CENTER); // Restore default
}

function drawRecallUI() {
  let trial = levelTrials[currentTrialIdx];
  setBlackText(20);
  let startY = height/2 + CONFIG.MAX_GRID_PIXELS/2 + 40;
  text(`Selected: ${currentResponsePositions.length} / ${trial.targetCount}`, width / 2, startY);
}

// --- INTERACTION LOGIC ---
function mousePressed() {
  if (state !== STATES.RECALL || isSubmitting) return;

  clickCount++;
  let trial = levelTrials[currentTrialIdx];
  let cellSize = CONFIG.MAX_GRID_PIXELS / trial.gridSize;
  let startX = (width - CONFIG.MAX_GRID_PIXELS) / 2;
  let startY = (height - CONFIG.MAX_GRID_PIXELS) / 2;

  let col = Math.floor((mouseX - startX) / cellSize);
  let row = Math.floor((mouseY - startY) / cellSize);
  let validClick = false;

  // Check if click was inside grid boundaries
  if (col >= 0 && col < trial.gridSize && row >= 0 && row < trial.gridSize) {
    let index = row * trial.gridSize + col;
    
    // Process unique, new cell selections
    if (!currentResponsePositions.includes(index) && currentResponsePositions.length < trial.targetCount) {
      validClick = true;
      currentResponsePositions.push(index);
      
      let clickTime = round(millis() - trialStartMs); // Relative to Recall Phase
      clickTimesMs.push(clickTime);
      
      if (firstClickLatencyMs === null) firstClickLatencyMs = clickTime;
      reactionTimeMs = clickTime; // Updates repeatedly to store time of last click
      
      // Auto-submit once required number of cells are clicked
      if (currentResponsePositions.length === trial.targetCount) {
        isSubmitting = true;
        submissionTimer = millis();
      }
    }
  }

  if (!validClick) outOfBoundsClickCount++;
}

function keyPressed() {
  // Advance from score screen via Spacebar
  if (state === STATES.LEVEL_SCORE && key === ' ') {
    currentLevelIdx++;
    startLevel();
  }
}

// --- DATA LOGGING & EXPORT ---
function processTrialSubmission() {
  logTrial();
  currentTrialIdx++;
  globalTrialIdx++;
  
  if (currentTrialIdx >= levelTrials.length) {
    changeState(STATES.LEVEL_SCORE);
  } else {
    startFixation();
  }
}

function logTrial() {
  let t = levelTrials[currentTrialIdx];
  let lConf = LEVEL_CONFIGS[levelOrder[currentLevelIdx]];
  
  // Accuracy Metrics
  let hitPositions = currentResponsePositions.filter(pos => targetPositions.includes(pos));
  let falsePositivePositions = currentResponsePositions.filter(pos => !targetPositions.includes(pos));
  let missPositions = targetPositions.filter(pos => !currentResponsePositions.includes(pos));

  let isCorrect = (hitPositions.length === t.targetCount && currentResponsePositions.length === t.targetCount) ? 1 : 0;
  if (isCorrect) levelScores[currentLevelIdx]++;

  let targetDensity = t.targetCount / (t.gridSize * t.gridSize);

  logs.push({
    level: lConf.id,
    stage: t.stage,
    trialIndexGlobal: globalTrialIdx + 1,
    trialIndexLevel: currentTrialIdx + 1,
    trialIndexStage: t.trialIndexStage,
    gridSize: t.gridSize,
    targetCount: t.targetCount,
    targetPositions: targetPositions.join(';'),
    targetDensity: targetDensity.toFixed(3),
    trialStartMsFromSessionStart: trialStartSessionTime.toFixed(0),
    fixationOnsetMs: fixationOnsetMs.toFixed(0),
    fixationDurationMs: fixationDurationMs.toFixed(0),
    stimulusOnsetMs: stimulusOnsetMs.toFixed(0),
    stimulusDurationMs: t.stimulusDuration,
    blankOnset: blankOnsetMs,
    blankDuration: CONFIG.BLANK_DURATION,
    recallOnsetMs: recallOnsetMs.toFixed(0),
    responseWindowMs: t.responseWindow,
    firstClickLatencyMs: firstClickLatencyMs !== null ? firstClickLatencyMs : "",
    reactionTimeMs: reactionTimeMs !== null ? reactionTimeMs : "",
    clickTimesMs: clickTimesMs.join(';'),
    responsePositions: currentResponsePositions.join(';'),
    clickCount: clickCount,
    outOfBoundsClickCount: outOfBoundsClickCount,
    accuracy: isCorrect,
    timeout: isTimeout ? 1 : 0,
    hitCount: hitPositions.length,
    hitPositions: hitPositions.join(';'),
    missCount: missPositions.length,
    missPositions: missPositions.join(';'),
    falsePositiveCount: falsePositivePositions.length,
    falsePositivePositions: falsePositivePositions.join(';')
  });
}

function exportCSV() {
  if (!logs.length) return;

  let sessionDurationMs = (millis() - sessionStartMs).toFixed(0);

  // Phase 1: Construct Metadata Table
  let metaRows = [
    ["experimentVersion", metaData.experimentVersion],
    ["experimentID", metaData.experimentID],
    ["sessionID", metaData.sessionID],
    ["participantID", metaData.participantID],
    ["inputDevice", "mouse"],
    ["phase", currentPhase],
    ["sessionStartUTC", sessionStartUtc],
    ["sessionDurationMs", sessionDurationMs]
  ];

  let csvRows = [["METADATA TABLE"], ...metaRows, [], ["TRIAL TABLE"]];

  // Phase 2: Construct Trial Table
  let headers = Object.keys(logs[0]);
  csvRows.push(headers);
  for (let row of logs) {
    csvRows.push(headers.map(h => row[h]));
  }

  // Generate & Download Blob
  let csvText = "\uFEFF" + csvRows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  a.href = url;
  a.download = `MM_${metaData.participantID}_${currentPhase}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Format individual cells properly to handle delimiters
function csvCell(value) {
  let text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// --- UTILITIES ---
function releaseFocus() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function seedFromParticipant(id) {
  let text = String(id || "0");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

function shuffleArray(arr) {
  let shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random(i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}