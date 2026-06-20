/* =========================================================
   Simon Task – FINAL DESIGN PLAN IMPLEMENTATION
   =========================================================
   Levels:
     1 – Text rectangles (LEFT/RIGHT), 2-choice, numpad keys 4 and 6
     2 – Text rectangles (LEFT/RIGHT/UP/DOWN), 4-choice, numpad keys 4, 6, 8, and 2
     3 – Text rectangles (LEFT/RIGHT/UP/DOWN), 4-choice, numpad keys 4, 6, 8, and 2, answer based on text or position according to the color of the stimulus
   =========================================================
*/

/* ============ CONFIGURATION & CONSTANTS =========== */

const CONFIG = {
  canvasBg: '#ebebeb',
  colors: { fixation: '#000000', text: '#000000', orangeCard: '#ffb400', whiteCard: '#ffffff' },
  sizes: { rectW: 160, rectH: 80, offset: 250, fixation: 60, text: 30 },
  timings: { fixationMin: 500, fixationMax: 1000 },
  // Numpad mappings
  validKeys: ['4', '6', '8', '2'],
  keys: { left: '4', up: '8', right: '6', down: '2' },
  // Experimental design parameters (Trials, Deadline in ms, % Congruent)
  levelsParams: {
    1: [
      { trials: 3, deadline: 1100, pCongruent: 1 },
      { trials: 10, deadline: 1100, pCongruent: 0.90 },
      { trials: 10, deadline: 1000,  pCongruent: 0.80 },
      { trials: 10, deadline: 1000,  pCongruent: 0.70 }
    ],
    2: [
      { trials: 10, deadline: 1100, pCongruent: 1 },
      { trials: 10, deadline: 1000, pCongruent: 0.90 },
      { trials: 5, deadline: 900, pCongruent: 0.80 },
      { trials: 10, deadline: 900, pCongruent: 0.70 }
    ],
    3: [
      { trials: 5, deadline: 1000, pCongruent: 0.80 },
      { trials: 10, deadline: 900, pCongruent: 0.70 },
      { trials: 10, deadline: 900, pCongruent: 0.60 },
      { trials: 8, deadline: 800, pCongruent: 0.50 }
    ]
  }
};

const STATES = { METADATA: 'metadata', MENU: 'menu', INSTRUCTIONS: 'instructions', FIXATION: 'fixation', STIMULUS: 'stimulus', END_PHASE: 'end_phase', LEVEL_FEEDBACK: 'LEVEL_FEEDBACK' };
const STIMULUS_TYPES = ['LEFT', 'RIGHT', 'UP', 'DOWN'];
const POSITIONS = ['left', 'right', 'up', 'down'];

/* =============== RUNTIME VARIABLES =============== */
let currentState = STATES.MENU;
let currentPhase = null; // 'Assessment' or 'Familiarization'
let metadata = { experimentVersion: '', experimentID: '', sessionID: '', participantID: '' };
// UI Elements for Metadata
let inputExpVer, inputExpId, inputSessId, inputPartId, btnSubmitMeta;
// Trial & Progression Tracking
let levelOrder = [];
let currentLevelIndex = 0;
let globalTrialIndex = 0;
let levelTrialIndex = 0;
let stageTrialIndex = 0;
let trials = [];
let logs = [];
let lastLevelScore = 0;
let lastLevelTotalTrials = 0;
// Timing & Interaction Flags
let sessionStartUtc, sessionStartTimeMs;
let trialStartMs, fixationOnsetMs, fixationDurationMs;
let stimulusOnsetMs, stimulusOffsetMs;
let responseGiven = false;
let invalidKeysBuffer = [];
let previousRule = null;
let trialsSinceSwitch = 0;

/* ===================== SETUP ===================== */

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  textFont('monospace');

  setupUIElements();
}

/* =================== DRAW LOOP =================== */

function draw() {
  background(CONFIG.canvasBg);
  
  // State Machine for Rendering
  switch (currentState) {

    case STATES.MENU:
      fill(0); textSize(30);
      text("MENU", width/2, height/2 - 80);
      textSize(20);
      break;

    case STATES.METADATA:
      fill(0); textSize(20);
      text("Enter Metadata:", width/2, height/2 - 120);
      break;
      
    case STATES.INSTRUCTIONS:
      fill(0); textSize(24);
      text(getInstructionText(levelOrder[currentLevelIndex]), width/2, height/2);
      break;
      
    case STATES.FIXATION:
      drawFixation();
      // Check if fixation duration has elapsed
      if (millis() - fixationOnsetMs >= fixationDurationMs) {
        startStimulus();
      }
      break;
      
    case STATES.STIMULUS:
      drawFixation();
      drawStimulus();
      handleStimulusTimeout();
      break;

    case STATES.LEVEL_FEEDBACK:
      fill(0); textSize(30);
      text(`Level Complete!\n\nScore: ${lastLevelScore} / ${lastLevelTotalTrials}\n\nPress SPACE to continue`, width/2, height/2);
      break;
      
    case STATES.END_PHASE:
      fill(0); textSize(30);
      text("Phase Complete.", width/2, height/2-60);
      break;
  }
}

/* ======================== INPUT HANDLERS ======================== */

function keyPressed() {
  // Extract key to handle raw string and normalize Arrow Keys if NumLock is off
  let k = key;
  if (keyCode === 100 || key === 'ArrowLeft') k = '4';
  if (keyCode === 102 || key === 'ArrowRight') k = '6';
  if (keyCode === 104 || key === 'ArrowUp') k = '8';
  if (keyCode === 98 || key === 'ArrowDown') k = '2';
  k = k.replace('Numpad', '');

  if (currentState === STATES.LEVEL_FEEDBACK && key === ' ') {
    currentLevelIndex++;
    if (currentLevelIndex >= levelOrder.length) {
      currentState = STATES.END_PHASE;
      showEndUI();
    } else { 
      levelTrialIndex = 0; stageTrialIndex = 0;
      trials = generateTrials(levelOrder[currentLevelIndex]); 
      previousRule = null;
      currentState = STATES.INSTRUCTIONS; 
    }
    return; 
  }

  if (currentState === STATES.INSTRUCTIONS && key === ' ') {
    startFixation();
  } 
  else if (currentState === STATES.STIMULUS && !responseGiven) {
    if (CONFIG.validKeys.includes(k)) {
      finalizeTrial(k);
    } else {
      invalidKeysBuffer.push(k.toUpperCase());
    }
  }
}

/* ================== UI DOM SETUP ================== */
function setupUIElements() {
  let cx = windowWidth / 2;
  let cy = windowHeight / 2;

  // MENU
  btnFamiliarization = createButton('Familiarization');
  btnFamiliarization.position(cx - 150, cy - 20);
  btnFamiliarization.size(140, 40);
  btnFamiliarization.mousePressed(() => {
    currentPhase = 'Familiarization';
    alert("Familiarization is currently empty.");
  });

  btnAssessment = createButton('Assessment');
  btnAssessment.position(cx + 10, cy - 20);
  btnAssessment.size(140, 40);
  btnAssessment.mousePressed(() => {
    currentPhase = 'Assessment';
    hideMenuUI();
    showMetadataUI();
    currentState = STATES.METADATA;
  });

  // METADATA
  inputExpId = createInput(''); inputExpId.position(cx - 80, cy - 60); inputExpId.attribute('placeholder', 'Experiment ID');
  inputExpVer = createInput(''); inputExpVer.position(cx - 80, cy - 30); inputExpVer.attribute('placeholder', 'Experiment Version');
  inputSessId = createInput(''); inputSessId.position(cx - 80, cy); inputSessId.attribute('placeholder', 'Session ID');
  inputPartId = createInput(''); inputPartId.position(cx - 80, cy + 30); inputPartId.attribute('placeholder', 'Participant ID');
  
  btnSubmitMeta = createButton('Start Experiment'); 
  btnSubmitMeta.position(cx - 80, cy + 70);
  btnSubmitMeta.size(160, 30);
  btnSubmitMeta.mousePressed(() => {
    metadata.experimentId = inputExpId.value();
    metadata.experimentVersion = inputExpVer.value();
    metadata.sessionId = inputSessId.value();
    metadata.participantId = inputPartId.value() || '0';
    
    hideMetadataUI();
    
    if (metadata.participantId === '1') { levelOrder = [1, 2, 3]; } 
    else { randomSeed(parseInt(metadata.participantId) || 0); levelOrder = shuffleArray([1, 2, 3]); }
    
    startPhase();
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
    currentState = STATES.MENU;
  });

  // Initially hide elements
  hideMetadataUI();
  hideEndUI();
}

function showMenuUI() { btnFamiliarization.show(); btnAssessment.show(); }
function hideMenuUI() { btnFamiliarization.hide(); btnAssessment.hide(); }
function showMetadataUI() { inputExpId.show(); inputExpVer.show(); inputSessId.show(); inputPartId.show(); btnSubmitMeta.show(); }
function hideMetadataUI() { inputExpId.hide(); inputExpVer.hide(); inputSessId.hide(); inputPartId.hide(); btnSubmitMeta.hide(); }
function showEndUI() { btnSaveCSV.show(); btnReturnMenu.show(); }
function hideEndUI() { btnSaveCSV.hide(); btnReturnMenu.hide(); }

/* ================= TRIAL GENERATION & LOGIC FUNCTIONS ================ */

function generateTrials(levelId) {
  let levelTrials = [];
  let stages = CONFIG.levelsParams[levelId];
  
  // Generate trials for each stage within the level
  stages.forEach((stage, index) => {
    let stageTrials = [];
    let numCongruent = Math.round(stage.trials * stage.pCongruent);
    let numIncongruent = stage.trials - numCongruent;
    
    for (let i = 0; i < numCongruent; i++) stageTrials.push(generateSingleTrial(levelId, true, stage, index));
    for (let i = 0; i < numIncongruent; i++) stageTrials.push(generateSingleTrial(levelId, false, stage, index));
    
    // Shuffle trials within the stage, then append to the level's trial list
    levelTrials = levelTrials.concat(shuffleArray(stageTrials));
  });
  
  return levelTrials;
}

function generateSingleTrial(levelId, isCongruent, stageData, stageIndex) {
  let word, pos, rule, color, correctKey;
  
  // Level 1 uses only Left/Right. Levels 2 & 3 use all 4 directions.
  let wordPool = levelId === 1 ? ['LEFT', 'RIGHT'] : STIMULUS_TYPES;
  let posPool = levelId === 1 ? ['left', 'right'] : POSITIONS;

  word = random(wordPool);
  
  if (isCongruent) {
    pos = word.toLowerCase();
  } else {
    // Pick a random position that does NOT match the word
    let availablePos = posPool.filter(p => p !== word.toLowerCase());
    pos = random(availablePos);
  }

  // Level 3 introduces Task Switching (Color/Rule)
  if (levelId === 3) {
    rule = random(['text', 'position']);
    color = rule === 'text' ? CONFIG.colors.whiteCard : CONFIG.colors.orangeCard;
    correctKey = rule === 'text' ? getCorrectKey(word) : getCorrectKey(pos);
  } else {
    rule = 'text';
    color = CONFIG.colors.whiteCard;
    correctKey = getCorrectKey(word);
  }

  return {
    level: levelId,
    stage: stageIndex + 1,
    deadline: stageData.deadline,
    word: word,
    position: pos,
    color: color,
    rule: rule,
    correctKey: correctKey,
    trialClass: isCongruent ? 'congruent' : 'incongruent'
  };
}

/* ================= EXECUTION & RENDERING HELPERS ================ */

function startPhase() {
  logs = []; 
  currentLevelIndex = 0; globalTrialIndex = 0; levelTrialIndex = 0; stageTrialIndex = 0;
  sessionStartUtc = new Date().toISOString(); 
  sessionStartTimeMs = millis();
  trials = generateTrials(levelOrder[currentLevelIndex]); 
  
  previousRule = null;
  trialsSinceSwitch = 0;
  
  currentState = STATES.INSTRUCTIONS; 
}

function startFixation() { 
  trialStartMs = Math.round(millis());
  invalidKeysBuffer = [];
  responseGiven = false;
  
  fixationOnsetMs = Math.round(millis()); 
  fixationDurationMs = Math.round(random(CONFIG.timings.fixationMin, CONFIG.timings.fixationMax)); 
  
  globalTrialIndex++;
  levelTrialIndex++;
  stageTrialIndex++;
  
  currentState = STATES.FIXATION; 
}

function startStimulus() {
  stimulusOnsetMs = Math.round(millis());
  currentState = STATES.STIMULUS;
}

function drawFixation() { 
  fill(CONFIG.colors.fixation); noStroke(); 
  textSize(CONFIG.sizes.fixation); text('+', width/2, height/2); 
}

function drawStimulus() {
  const trial = trials[levelTrialIndex - 1]; 
  let sx = width/2, sy = height/2;
  
  if (trial.position === 'left') sx -= CONFIG.sizes.offset;
  if (trial.position === 'right') sx += CONFIG.sizes.offset;
  if (trial.position === 'up') sy -= CONFIG.sizes.offset;
  if (trial.position === 'down') sy += CONFIG.sizes.offset;

  rectMode(CENTER); fill(trial.color); stroke(0); strokeWeight(2);
  rect(sx, sy, CONFIG.sizes.rectW, CONFIG.sizes.rectH, 6);
  fill(CONFIG.colors.text); noStroke(); textSize(CONFIG.sizes.text); 
  text(trial.word, sx, sy);
}

function handleStimulusTimeout() {
  const trial = trials[levelTrialIndex - 1];
  if (millis() - stimulusOnsetMs >= trial.deadline && !responseGiven) {
    finalizeTrial(null);
  }
}

function finalizeTrial(responseKey) {
  responseGiven = true;
  stimulusOffsetMs = Math.round(millis());
  const trial = trials[levelTrialIndex - 1];
  
  let rt = responseKey ? (stimulusOffsetMs - stimulusOnsetMs) : null;
  let isCorrect = responseKey === trial.correctKey;
  let accuracy = isCorrect ? 1 : 0;
  let isTimeout = !responseKey ? 1 : 0;
  let outcome = isTimeout ? 'timeout' : (isCorrect ? 'correct' : 'incorrect');
  let anticipatory = rt !== null && rt < 150;
  let stimColName = trial.color === CONFIG.colors.orangeCard ? 'orange' : 'white';

  let taskSwitch = false;
  if (trial.level === 3) {
    if (previousRule && previousRule !== trial.rule) {
      taskSwitch = true;
      trialsSinceSwitch = 0;
    } else if (previousRule === trial.rule) {
      trialsSinceSwitch++;
    }
    previousRule = trial.rule;
  } else {
    previousRule = null;
    trialsSinceSwitch = 0;
  }

  logs.push({
    level: trial.level, stage: trial.stage,
    trialIndexGlobal: globalTrialIndex, trialIndexLevel: levelTrialIndex, trialIndexStage: stageTrialIndex,
    trialClass: trial.trialClass, stimulusText: trial.word, stimulusPosition: trial.position, stimulusColor: stimColName,
    ruleType: trial.level === 3 ? trial.rule : '',
    taskSwitch: trial.level === 3 ? taskSwitch : '', trialsSinceLastSwitch: trial.level === 3 ? trialsSinceSwitch : '',
    trialStartMs: trialStartMs, fixationOnsetMs: fixationOnsetMs, fixationDurationMs: fixationDurationMs,
    stimulusOnsetMs: stimulusOnsetMs, stimulusOffsetMs: stimulusOffsetMs,
    responseWindowMs: trial.deadline, reactionTimeMs: rt !== null ? rt : '',
    correctResponse: trial.correctKey, userResponse: responseKey || '',
    invalidKeysBeforeResponse: invalidKeysBuffer.length > 0 ? `[${invalidKeysBuffer.join(' ')}]` : `[]`,
    accuracy: accuracy, timeout: isTimeout, responseOutcome: outcome, anticipatoryResponse: anticipatory
  });

if (levelTrialIndex >= trials.length) {
    let currentLevelLogs = logs.filter(log => log.level === trials[trials.length - 1].level);
    lastLevelScore = currentLevelLogs.filter(log => log.accuracy === 1).length;
    lastLevelTotalTrials = trials.length; 
    currentState = STATES.LEVEL_FEEDBACK;
} else {
    startFixation();
}
}

/* ================== UTILITY FUNCTIONS ================== */

function getCorrectKey(target) {
  let t = target.toLowerCase();
  return CONFIG.keys[t] || null;
}

function getInstructionText(levelId) {
  if (levelId === 1) return `Level 1: Basic Simon\nA word (LEFT or RIGHT) will appear.\nPress Numpad 4 for LEFT, Numpad 6 for RIGHT.\n\nIgnore WHERE it appears. Respond to the WORD.\n\nPress SPACE to start.`;
  if (levelId === 2) return `Level 2: Expanded Simon\nA word (LEFT, RIGHT, UP, DOWN) will appear.\nUse Numpad 4(L), 6(R), 8(U), 2(D).\n\nIgnore WHERE it appears. Respond to the WORD.\n\nPress SPACE to start.`;
  if (levelId === 3) return `Level 3: Simon + Task Switching\nA card with a word appears.\nIf WHITE, respond to WORD.\nIf ORANGE, respond to POSITION.\n\nPress SPACE to start.`;
}

function shuffleArray(arr) {
  let shuffled = [...arr]; // Avoid mutating original array directly
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random(i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/* ====================== DATA EXPORT ===================== */

function exportCSV() {
  if (!logs.length) return;
  
  let sessionDurationMs = Math.round(millis() - sessionStartTimeMs);

  let csvContent = `[SESSION METADATA]\n` +
                   `experimentID,${metadata.experimentId}\n` +
                   `experimentVersion,${metadata.experimentVersion}\n` +
                   `sessionID,${metadata.sessionId}\n` +
                   `participantID,${metadata.participantId}\n` +
                   `phase,${currentPhase}\n` +
                   `inputDevice,keyboard_numpad\n` +
                   `sessionStartUTC,${sessionStartUtc}\n` +
                   `sessionDurationMs,${sessionDurationMs}\n\n` +
                   `[TRIAL DATA]\n`;
  
  csvContent += Object.keys(logs[0]).join(',') + '\n';
  csvContent += logs.map(row => Object.values(row).join(',')).join('\n');
  
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv' }));
  a.download = `SimonTask_${metadata.participantId}_${currentPhase}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}