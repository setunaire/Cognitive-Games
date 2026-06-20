/* =========================================================
   Go/No-Go Task – Based on Design Plan.docx (p5.js UI Implementation)
   ========================================================= */

// Global configuration: timings and thresholds
const CONFIG = {
  CANVAS_BG: '#ebebeb',
  FIXATION_MIN: 200,
  FIXATION_MAX: 600,
  ANTICIPATORY_THRESHOLD: 150,
  TRIALS_PER_STAGE: 12,
  GO_RATIO: 0.7,
  INSTRUCTION_SIZE: 24,
  STIMULUS_SIZE: 150
};

// Color mapping for rendering
const COLOR_MAP = {
  "Green": "#008000", "Orange": "#FFA500",
  "LightSeaGreen": "#20B2AA", "Magenta": "#FF00FF",
  "Yellow": "#FFFF00", "Olive": "#808000",
  "	Dark Mint": "#31900E", "Aqua Green": "#00FFAA",
  "Dark Forest Green": "#254117", "Lime Green": "#32CD32",
  "Red": "#FF0000", "Blue": "#0000FF"
};

// Static stimulus pools for levels
const L1_SHAPES = ["Circle", "Square", "Triangle"];
const L2_COLORS = ["Green", "Red", "Blue"];

// Difficulty progression pools (expanding per stage)
const COLOR_STAGES = [
  ["Green", "Orange"],
  ["Green", "Orange", "LightSeaGreen", "Magenta"],
  ["Green", "Orange", "LightSeaGreen", "Magenta", "Yellow", "Olive"],
  ["Green", "Orange", "LightSeaGreen", "Magenta", "Yellow", "Olive", "Mint", "Aqua Green"],
  ["Green", "Orange", "LightSeaGreen", "Magenta", "Yellow", "Olive", "Mint", "Aqua Green", "Deep Emerald Green", "Lime Green"]
];

const SHAPE_STAGES = [
  ["Circle", "Square"],
  ["Circle", "Square", "Triangle", "Diamond"],
  ["Circle", "Square", "Triangle", "Diamond", "Pentagon", "Hexagon"],
  ["Circle", "Square", "Triangle", "Diamond", "Pentagon", "Hexagon", "Heptagon", "Octagon"],
  ["Circle", "Square", "Triangle", "Diamond", "Pentagon", "Hexagon", "Heptagon", "Octagon", "Oval", "Rounded Rectangle"]
];

// Level-specific rules and parameters
const LEVEL_CONFIGS = [
  {
    id: 1, name: "Color Attention", rule: "color",
    targetC: "Green", targetS: null,
    goExamples: [
      { color: "Green", shape: "Circle" },
      { color: "Green", shape: "Square" },
      { color: "Green", shape: "Triangle" }
    ],
    instructions: "Respond only when the color is GREEN.\nShape does not matter.\nPress SPACE for Go trials.\nWithhold response for all other colors.",
    durations: [1500, 1400, 1300, 1200, 1100],
    getPools: (stg) => ({ colors: COLOR_STAGES[stg], shapes: L1_SHAPES }),
    isGo: (c, s) => c === "Green"
  },
  {
    id: 2, name: "Shape Attention", rule: "shape",
    targetC: null, targetS: "Circle",
    goExamples: [
      { color: "Green", shape: "Circle" },
      { color: "Red", shape: "Circle" },
      { color: "Blue", shape: "Circle" }
    ],
    instructions: "Respond only when the shape is CIRCLE.\nColor does not matter.\nPress SPACE for Go trials.\nWithhold response for all other shapes.",
    durations: [1400, 1300, 1200, 1100, 1000],
    getPools: (stg) => ({ colors: L2_COLORS, shapes: SHAPE_STAGES[stg] }),
    isGo: (c, s) => s === "Circle"
  },
  {
    id: 3, name: "Conjunction Attention", rule: "conjunction",
    targetC: "Green", targetS: "Circle",
    goExamples: [
      { color: "Green", shape: "Circle" }
    ],
    instructions: "Respond only when BOTH are true:\nColor is GREEN and shape is CIRCLE.\nPress SPACE only for Green Circles.",
    durations: [1300, 1200, 1100, 1000, 900],
    getPools: (stg) => ({ colors: COLOR_STAGES[stg], shapes: SHAPE_STAGES[stg] }),
    isGo: (c, s) => c === "Green" && s === "Circle"
  }
];

// State machine definition
const STATES = { MENU: 'menu', METADATA: 'metadata', INSTRUCTIONS: 'instructions', FIXATION: 'fixation', STIMULUS: 'stimulus', LEVEL_SCORE: 'level_score', END: 'end' };
let state = STATES.MENU;

// Runtime variables
let currentPhase = null;
let metaData = { experimentVersion: '', experimentID: '', sessionID: '', participantID: '' };

// UI Elements
let btnFamiliarization, btnAssessment;
let labelExpId, labelExpVer, labelSessId, labelPartId;
let inputExpId, inputExpVer, inputSessId, inputPartId, btnSubmitMeta;
let btnStartLevel, btnSaveCSV, btnReturnMenu;

let levelOrder = [], currentLevelIdx = 0;
let currentTrialIdx = 0, globalTrialIdx = 0;
let levelTrials = [], logs = [], levelScores = [];

// Timing and response tracking
let sessionStartUtc, sessionStartMs = 0, trialStartSessionTime = 0;
let trialOnset = 0, fixationOnset = 0, stimulusOnset = 0, stimulusOffset = 0;
let fixationDuration = 0, currentResponse = null, currentRT = null;
let invalidKeys = [], responseGiven = false;

// p5.js setup
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

  // MENU
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
    state = STATES.METADATA;
  });

  // METADATA
  labelExpId = createSpan('Experiment ID');
  labelExpId.position(cx - 220, cy - 82);
  inputExpId = createInput('');
  inputExpId.position(cx - 70, cy - 85);
  inputExpId.attribute('placeholder', 'experimentID');

  labelExpVer = createSpan('Experiment Version');
  labelExpVer.position(cx - 220, cy - 47);
  inputExpVer = createInput('');
  inputExpVer.position(cx - 70, cy - 50);
  inputExpVer.attribute('placeholder', 'experimentVersion');

  labelSessId = createSpan('Session ID');
  labelSessId.position(cx - 220, cy - 12);
  inputSessId = createInput('');
  inputSessId.position(cx - 70, cy - 15);
  inputSessId.attribute('placeholder', 'sessionID');

  labelPartId = createSpan('Participant ID');
  labelPartId.position(cx - 220, cy + 23);
  inputPartId = createInput('');
  inputPartId.position(cx - 70, cy + 20);
  inputPartId.attribute('placeholder', 'participantID');

  btnSubmitMeta = createButton('Start Experiment');
  btnSubmitMeta.position(cx - 80, cy + 65);
  btnSubmitMeta.size(160, 30);
  btnSubmitMeta.mousePressed(() => {
    metaData.experimentID = inputExpId.value();
    metaData.experimentVersion = inputExpVer.value();
    metaData.sessionID = inputSessId.value();
    metaData.participantID = inputPartId.value() || '0';

    hideMetadataUI();
    releaseFocus();

    // Seed random generator and set levels
    randomSeed(seedFromParticipant(metaData.participantID));

    // Use participantID=1 for strict order, otherwise shuffle
    if (metaData.participantID === '1') { levelOrder = [0, 1, 2]; }
    else { levelOrder = shuffleArray([0, 1, 2]); }

    startApp();
  });

  btnStartLevel = createButton('Start Level');
  btnStartLevel.position(cx - 80, cy + 130);
  btnStartLevel.size(160, 35);
  btnStartLevel.mousePressed(() => {
    hideInstructionUI();
    releaseFocus();
    startFixation();
  });

  // END PHASE
  btnSaveCSV = createButton('Save Logs (CSV)');
  btnSaveCSV.position(cx - 150, cy);
  btnSaveCSV.size(140, 40);
  btnSaveCSV.mousePressed(() => exportCSV());

  btnReturnMenu = createButton('Return to Menu');
  btnReturnMenu.position(cx + 10, cy);
  btnReturnMenu.size(140, 40);
  btnReturnMenu.mousePressed(() => {
    hideEndUI();
    showMenuUI();
    state = STATES.MENU;
  });

  hideMetadataUI();
  hideInstructionUI();
  hideEndUI();
}

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

// Transitions from UI to Experiment
function startApp() {
  sessionStartUtc = new Date().toISOString();
  sessionStartMs = millis();
  logs = [];
  levelScores = [];
  currentLevelIdx = 0;
  globalTrialIdx = 0;

  startLevel();
}

function generateTrials(levelConf) {
  let trials = [];
  const goCount = Math.round(CONFIG.TRIALS_PER_STAGE * CONFIG.GO_RATIO);
  const nogoCount = CONFIG.TRIALS_PER_STAGE - goCount;

  for (let stg = 0; stg < 5; stg++) {
    let stageTrials = [];
    let dur = levelConf.durations[stg];
    let pools = levelConf.getPools(stg);

    for (let i=0; i<goCount; i++) {
      let c, s;
      do { c = random(pools.colors); s = random(pools.shapes); } while (!levelConf.isGo(c, s));
      stageTrials.push({ stage: stg+1, duration: dur, color: c, shape: s, type: "Go" });
    }
    for (let i=0; i<nogoCount; i++) {
      let c, s;
      do { c = random(pools.colors); s = random(pools.shapes); } while (levelConf.isGo(c, s));
      stageTrials.push({ stage: stg+1, duration: dur, color: c, shape: s, type: "No-Go" });
    }

    stageTrials = shuffleArray(stageTrials);
    for(let j=0; j<stageTrials.length; j++) stageTrials[j].stageIdx = j+1;

    trials = trials.concat(stageTrials);
  }
  return trials;
}

function startLevel() {
  if (currentLevelIdx >= 3) {
    state = STATES.END;
    hideInstructionUI();
    showEndUI();
    return;
  }
  let lIdx = levelOrder[currentLevelIdx];
  levelTrials = generateTrials(LEVEL_CONFIGS[lIdx]);
  currentTrialIdx = 0;
  levelScores[currentLevelIdx] = 0;
  state = STATES.INSTRUCTIONS;
  showInstructionUI();
}

function setBlackText(size) {
  noStroke();
  fill(0);
  textSize(size);
  textStyle(NORMAL);
}

function drawInstructionScreen(levelConf) {
  setBlackText(CONFIG.INSTRUCTION_SIZE);
  text(`Level ${levelConf.id}: ${levelConf.name}`, width/2, height/2 - 180);
  text("Go stimulus", width/2, height/2 - 125);
  drawGoExamples(levelConf.goExamples, height/2 - 55);
  setBlackText(CONFIG.INSTRUCTION_SIZE);
  text(levelConf.instructions, width/2, height/2 + 55);
}

function drawGoExamples(examples, y) {
  let gap = 120;
  let startX = width/2 - ((examples.length - 1) * gap) / 2;
  for (let i = 0; i < examples.length; i++) {
    drawShapeAt(examples[i].color, examples[i].shape, startX + i * gap, y, 70);
  }
}

// Main p5.js render loop
function draw() {
  background(CONFIG.CANVAS_BG);

  switch (state) {
    case STATES.MENU:
      setBlackText(30);
      text("Go / No-Go", width/2, height/2 - 90);
      break;

    case STATES.METADATA:
      setBlackText(20);
      text("Enter Metadata", width/2, height/2 - 130);
      break;

    case STATES.INSTRUCTIONS:
      let lConf = LEVEL_CONFIGS[levelOrder[currentLevelIdx]];
      drawInstructionScreen(lConf);
      break;

    case STATES.FIXATION:
      setBlackText(40);
      text("+", width/2, height/2);
      let fNow = millis() - trialStartSessionTime;
      if (fNow - fixationOnset >= fixationDuration) {
        stimulusOnset = fNow;
        state = STATES.STIMULUS;
      }
      break;

    case STATES.STIMULUS:
      let t = levelTrials[currentTrialIdx];
      drawShape(t.color, t.shape);
      let sNow = millis() - trialStartSessionTime;
      if (sNow - stimulusOnset >= t.duration) {
        stimulusOffset = sNow;
        logTrial();
        nextTrial();
      }
      break;

    case STATES.LEVEL_SCORE:
      setBlackText(CONFIG.INSTRUCTION_SIZE);
      text(`Level Complete!\nScore: ${levelScores[currentLevelIdx]} / ${levelTrials.length}\nPress SPACE to continue.`, width/2, height/2);
      break;

    case STATES.END:
      setBlackText(30);
      text("Assessment Complete.", width/2, height/2 - 60);
      break;
  }
}

// Geometry helper for n-sided shapes
function drawPolygon(x, y, radius, npoints) {
  let angle = TWO_PI / npoints;
  beginShape();
  for (let a = -HALF_PI; a < TWO_PI - HALF_PI; a += angle) {
    vertex(x + cos(a) * radius, y + sin(a) * radius);
  }
  endShape(CLOSE);
}

// Renders the specific shape geometry based on type
function drawShape(cStr, sStr) {
  drawShapeAt(cStr, sStr, width/2, height/2, CONFIG.STIMULUS_SIZE);
}

function drawShapeAt(cStr, sStr, cx, cy, size) {
  let hexStr = COLOR_MAP[cStr] || "#000000";
  fill(hexStr); stroke(hexStr);

  if (sStr === "Circle") ellipse(cx, cy, size);
  else if (sStr === "Square") rect(cx, cy, size, size);
  else if (sStr === "Triangle") drawPolygon(cx, cy, size * 0.53, 3);
  else if (sStr === "Diamond") drawPolygon(cx, cy, size * 0.6, 4);
  else if (sStr === "Pentagon") drawPolygon(cx, cy, size * 0.53, 5);
  else if (sStr === "Hexagon") drawPolygon(cx, cy, size * 0.53, 6);
  else if (sStr === "Heptagon") drawPolygon(cx, cy, size * 0.53, 7);
  else if (sStr === "Octagon") drawPolygon(cx, cy, size * 0.53, 8);
  else if (sStr === "Oval") ellipse(cx, cy, size * 1.2, size * 0.8);
  else if (sStr === "Rounded Rectangle") rect(cx, cy, size * 1.2, size * 0.8, 20);
}

// Handles input state logic
function keyPressed() {
  if (state === STATES.INSTRUCTIONS && key === ' ') {
    hideInstructionUI();
    startFixation();
  }
  else if (state === STATES.STIMULUS) {
    if (key === ' ' && !responseGiven) {
      let now = millis() - trialStartSessionTime;
      responseGiven = true;
      currentResponse = "press";
      currentRT = now - stimulusOnset;
      stimulusOffset = now;
      logTrial();
      nextTrial();
    } else if (!responseGiven) {
      invalidKeys.push(key);
    }
  }
  else if (state === STATES.LEVEL_SCORE && key === ' ') {
    currentLevelIdx++;
    startLevel();
  }
}

// Resets trial variables and starts fixation cross
function startFixation() {
  trialStartSessionTime = millis();
  trialOnset = 0;
  fixationOnset = 0;
  fixationDuration = random(CONFIG.FIXATION_MIN, CONFIG.FIXATION_MAX);
  responseGiven = false;
  currentResponse = "no_press";
  currentRT = null;
  invalidKeys = [];

  state = STATES.FIXATION;
}

function nextTrial() {
  currentTrialIdx++;
  globalTrialIdx++;
  if (currentTrialIdx >= levelTrials.length) {
    state = STATES.LEVEL_SCORE;
  } else {
    startFixation();
  }
}

function logTrial() {
  let t = levelTrials[currentTrialIdx];
  let lConf = LEVEL_CONFIGS[levelOrder[currentLevelIdx]];
  let isAnticipatory = currentRT !== null && currentRT < CONFIG.ANTICIPATORY_THRESHOLD;
  let correctResponse = t.type === "Go" ? "press" : "no_press";

  let accuracy = 0, timeout = 0, commissionError = 0, omissionError = 0;

  if (t.type === "Go") {
    if (currentResponse === "press" && !isAnticipatory) accuracy = 1;
    else if (currentResponse === "no_press") { omissionError = 1; timeout = 1; }
  } else {
    if (currentResponse === "no_press") accuracy = 1;
    else commissionError = 1;
  }

  if (accuracy === 1) levelScores[currentLevelIdx]++;

  let taskSwitch = false;
  let trialsSinceLastSwitch = 0;
  if (globalTrialIdx > 0 && logs.length > 0) {
    let lastLog = logs[logs.length - 1];
    taskSwitch = lastLog.ruleType !== lConf.rule;
    trialsSinceLastSwitch = taskSwitch ? 0 : Number(lastLog.trialsSinceLastSwitch) + 1;
  }

  logs.push({
    level: lConf.id,
    stage: t.stage,
    trialIndexGlobal: globalTrialIdx + 1,
    trialIndexLevel: currentTrialIdx + 1,
    trialIndexStage: t.stageIdx,
    trialClass: t.type,
    ruleType: lConf.rule,
    stimulusColorName: t.color,
    stimulusColorHex: COLOR_MAP[t.color] || "",
    stimulusShapeName: t.shape,
    isGoTargetColor: t.color === "Green" ? 1 : 0,
    isGoTargetShape: t.shape === "Circle" ? 1 : 0,
    isGoTargetConjunction: (t.color === "Green" && t.shape === "Circle") ? 1 : 0,
    taskSwitch: taskSwitch,
    trialsSinceLastSwitch: trialsSinceLastSwitch,
    trialStartMsFromSessionStart: (trialStartSessionTime - sessionStartMs).toFixed(0),
    trialStartMs: trialOnset.toFixed(0),
    fixationOnsetMs: fixationOnset.toFixed(0),
    fixationDurationMs: fixationDuration.toFixed(0),
    stimulusOnsetMs: stimulusOnset.toFixed(0),
    stimulusOffsetMs: stimulusOffset.toFixed(0),
    responseWindowMs: t.duration.toFixed(0),
    reactionTimeMs: currentRT !== null ? currentRT.toFixed(0) : "",
    correctResponse: correctResponse,
    userResponse: currentResponse,
    invalidKeysBeforeResponse: JSON.stringify(invalidKeys),
    accuracy: accuracy,
    timeout: timeout,
    commissionError: commissionError,
    omissionError: omissionError,
    anticipatoryResponse: isAnticipatory ? 1 : 0
  });
}

function releaseFocus() {
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
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

function exportCSV() {
  if (!logs.length) return;

  let sessionDurationMs = (millis() - sessionStartMs).toFixed(0);

  let metaRows = [
    ["experimentID", metaData.experimentID],
    ["experimentVersion", metaData.experimentVersion],
    ["sessionID", metaData.sessionID],
    ["participantID", metaData.participantID],
    ["inputDevice", "keyboard"],
    ["phase", currentPhase],
    ["sessionStartUTC", sessionStartUtc],
    ["sessionDurationMs", sessionDurationMs]
  ];

  let csvRows = [];
  csvRows.push(["SESSION METADATA"]);
  csvRows = csvRows.concat(metaRows);
  csvRows.push([]);
  csvRows.push(["TRIAL DATA"]);

  let headers = Object.keys(logs[0]);
  csvRows.push(headers);
  for (let row of logs) {
    csvRows.push(headers.map(h => row[h]));
  }

  let csvText = "\uFEFF" + csvRows
    .map(row => row.map(csvCell).join(","))
    .join("\r\n");

  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `GoNoGo_${metaData.participantID}_${currentPhase}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}