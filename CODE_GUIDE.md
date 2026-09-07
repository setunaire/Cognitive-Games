# CODE_GUIDE — Cognitive Games (p5.js)

A code-level map of this repository. It explains **how the code is organized and
where to look**, not the specific parameter values or the research rationale:

- **Parameter values** live in each game's `CONFIG` object (top of every `sketch.js`).
- **Rationale, design, and the experimental spec** live in `CogGames_Documentation.docx`
  and in the inline `Section X.Y` comments that point back to it.
- **This file** is the bridge: the mental model and where each thing lives.

Because it describes *structure* (not values), it stays valid even when levels,
timings, or trial counts are retuned.

---

## 1. Repository layout

```
main.html                      Launcher: enter Participant/Session/Music ONCE,
                               pick language, open a game.
CogGames_Documentation.docx    The spec (design + rationale). Source of truth for "why".
CODE_GUIDE.md                  This file (architecture map).
BUGS.docx                      Pilot bug/issue log.
fonts/                         Vazirmatn (Persian font, used by the FA tree).
p5/                            The p5.js library (loaded by each index.html).
Games_EN/                      English tree — 6 games.
Games_FA/                      Persian tree — same 6 games, RTL + Persian strings.
  <n>_<Game>/
    index.html                 Loads p5.js + sketch.js.
    sketch.js                  The whole game (one self-contained file).
```

The 12 `sketch.js` files share one engine. **`Games_EN/1_Simon/sketch.js` is the
reference file**: understand it and you understand ~90% of every game. The rest of
this guide walks through it, then lists what each other game swaps in (Section 6).

> **Why 12 near-identical files instead of a shared module?** A deliberate trade-off:
> these are validated research instruments, edited one tree/one game at a time, and
> kept self-contained so a single file fully defines a task. The cost is that a
> cross-cutting change is applied as a scripted sweep across all 12.

---

## 2. p5.js in five minutes

p5.js is a drawing library. Two ideas explain almost everything.

**The canvas + coordinates.** `createCanvas(w, h)` makes a drawing surface. The
origin `(0,0)` is the **top-left**; `x` grows right, `y` grows **down**. `width`/`height`
are the canvas size; `windowWidth`/`windowHeight` are the browser window size. So
`width/2, height/2` is the screen center — you'll see that everywhere.

**The draw loop.** p5 calls **`setup()` once**, then **`draw()` ~60×/second**, forever.
Drawing is *immediate-mode*: nothing persists — each frame **repaints the whole screen
from scratch**. That's why `draw()` starts with `background()` (wipe) then redraws the
current screen. Consequences worth internalizing:

- "Animation" = drawing slightly different things each frame.
- "A timer expired" = `draw()` checking the clock each frame and changing `state`.
  There are **no `setTimeout`s** in the trial loop; timing checks live inside the
  per-screen draw functions.

**Drawing commands** (set a style, then draw; the style applies to everything after it):

| Command | Meaning |
|---|---|
| `background(c)` | fill the whole canvas (the per-frame wipe) |
| `fill(c)` / `noFill()` | interior color of shapes/text drawn next |
| `stroke(c)` / `noStroke()` / `strokeWeight(px)` | outline color / off / thickness |
| `rect(x,y,w,h,r)` / `ellipse(x,y,w,h)` | rectangle (rounded by `r`) / oval |
| `text(str,x,y)` | draw text |
| `textSize(px)`, `textStyle(BOLD/NORMAL)`, `textWidth(str)`, `textFont(name)` | text styling / measuring |
| `textAlign(CENTER,CENTER)`, `rectMode(CENTER)` | set once in `setup` → **x,y is the CENTER** of text/rects |

**Built-in variables:** `width`/`height`, `windowWidth`/`windowHeight`, `key` (the
character; `' '` is space), `keyCode` (numeric; `LEFT_ARROW`, `RIGHT_ARROW`, `UP_ARROW`,
`DOWN_ARROW`, `ENTER` are p5 constants), `mouseX`/`mouseY`.

**Event functions p5 calls for you** (you just define them): `keyPressed()`,
`mousePressed()`, `windowResized()`.

**DOM vs. canvas — two layers.** `createButton()` / `createInput()` / `createSpan()`
create **real HTML elements floating over the canvas** (not painted pixels). They return
objects with `.position(x,y)`, `.size(w,h)`, `.show()`, `.hide()`, `.class(css)`,
`.value()`, `.mousePressed(fn)`. This is why buttons have their own show/hide/layout
logic separate from canvas drawing — they live in the **DOM** layer, on top.

**Escape hatch:** `drawingContext` is the raw browser canvas context under p5. The
Persian files use it for right-to-left text (`drawingContext.direction = 'rtl'`), which
p5 does not wrap.

Everything else (`performance.now()`, `localStorage`, `Math.round`, `Blob`, `confirm()`)
is plain JavaScript / browser API, not p5.

**Glossary:** *DOM* = Document Object Model, the browser's tree of live HTML elements
(here: the buttons/inputs over the canvas). *HUD* = Heads-Up Display, status info
(`Trial 3/40`, countdown) drawn over the stimulus without interrupting it.

---

## 3. The 12 sections of a `sketch.js`

Every file is laid out in the same numbered sections (see its header comment):

| # | Section | What it holds |
|---|---|---|
| 1 | **CONFIG** | Every tunable: `GAME_NAME`, timing, ratios, `COLORS`, geometry, and the `FAMILIARIZATION` block. Change behavior here, not in logic. |
| 2 | **STRINGS** | Every user-visible text — the single translation point (Persian in the FA files). Templated strings use `{placeholders}`. |
| 3 | **LEVELS** | One object per level (difficulty knobs + `responseWindowMs`). Add a level = add an entry. |
| 4 | **STATES** | Named labels for each screen (`MENU`, `ITI`, `STIMULUS`, `END`, `FAM_*`, …). |
| 5 | **RUNTIME STATE** | The `let` variables that change during play (see Section 4 below). |
| 6 | **p5 LIFECYCLE** | `setup` / `draw` / `windowResized`. |
| 7 | **SCREENS** | DOM setup (`buildUI`/`layoutUI`/`showOnly`) + one canvas draw function per screen. |
| 8 | **TRIAL GENERATION** | `generateTrialPool(level)` → the array of trial objects. |
| 9 | **TRIAL FLOW** | The small functions that walk a trial from ITI to log. |
| 10 | **INPUT** | `keyPressed` / `mousePressed` → `recordResponse`. |
| 11 | **LOGGING & EXPORT** | `trialLogs` array + `exportCSV`. |
| 12 | **HELPERS** | `nowMs`, `shuffleArray`, `fmtNum`, `fmtTemplate`, `csvCell`, `saveFileToDisk`. |

---

## 4. Key runtime variables (Section 5)

These change during play (`CONFIG` never does):

- `state` — which screen we're on; `draw()` switches on it. **The spine of the program.**
- `metaData` — participant / session / music values.
- `currentPhase` — `'familiarization'` or `'assessment'`.
- `sessionStartUtc` / `sessionStartMonotonic` — wall-clock start (for the record) and the
  precise `performance.now()` start (for timing math).
- `levelIdx` — 0-based current level. `trialPool` — the current level's trials.
  `trialIdxLevel` / `trialIdxGlobal` — trial counters (within level / whole session).
- `levelStats` / `totalStats` — running `{correct, incorrect, timeout}` tallies.
- `itiOnsetMs` / `stimulusOnsetMs` / `trialStartSessionMs` — timestamps for elapsed-time
  and reaction-time math.
- `responded` — guard so a trial can't be answered twice.
- `trialLogs` — the growing array of result rows (becomes the CSV). `csvSaved` — whether
  it's been downloaded.
- `ui` — references to the DOM buttons/inputs. `metadataErrorMsg` — the validation message.
- `fam*` block — the familiarization machine's state (Section 5 of this guide).

---

## 5. How it runs

### The screen state machine (`draw` → `switch (state)`)

```
MENU ──[Familiarization]──┐
  └──[Assessment]─────────┤→ METADATA (skipped if launcher session present)
                          → per level: INSTRUCTIONS → (trial loop) → LEVEL_SUMMARY
                          → … next level … → END (Save CSV / Main Menu)
```

`showOnly(group)` hides all DOM elements, then shows just the group the current screen
needs — that keeps the HTML buttons in sync with the canvas `state`.

### The trial loop (Section 9)

```
beginIti()      → state = ITI       (blank gap of a fresh jittered length drawn into
                                     itiDurationMs from CONFIG.ITI_MIN_MS/ITI_MAX_MS)
beginStimulus() → state = STIMULUS  (draw stimulus; drawStimulusScreen checks the
                                     response window → recordResponse('timeout'))
keyPressed()/mousePressed()         (a real response) ─┐
                                                       ▼
recordResponse(x)  ← the SINGLE exit point of every trial:
                     computes result (1 correct / -1 wrong / 0 timeout) + reaction time,
                     pushes one row to trialLogs, updates tallies.
                     then → famAfterResponse (if famMode) else advanceTrial()
advanceTrial()  → next trial (beginIti) or LEVEL_SUMMARY when the pool is done
continueFromSummary() → next level or END
```

The important pattern: **timers live inside the draw functions.** Each frame,
`drawItiScreen` / `drawStimulusScreen` check `nowMs() - onset >= limit` and advance the
state. `nowMs()` = `performance.now() - sessionStartMonotonic` — a high-precision clock
zeroed at session start, used for all timing and reaction times.

### The familiarization engine (spec: `CogGames_Documentation.docx` §8)

A parallel mini-machine layered on the same trial loop, gated by `famMode`:

- `startFamiliarization()` turns on `famMode`, builds `famPlan` (ordered demo + practice
  steps). `famNextStep()` walks it; `famAdvanceDemo()` flips the self-paced demo cards
  (not logged).
- Practice trials are **fixed**, identical for every participant: `FAM_PRACTICE_SETS`
  holds two sets (A, B); `famPracticeSet()` picks one by `(famAttempt-1) % 2`, and
  `famPracticePool(step)` returns that level's list. An accepted repeat uses the next set.
- Practice reuses the real trial loop, but `famMode` routes the response to
  `famAfterResponse()`, which tags the log row and shows `FAM_FEEDBACK`.
- `drawFamFeedbackScreen()` overlays the result **on the trial display itself**; on
  errors/timeouts it also shows the correct answer via the per-game `drawFamAnswerHint()`.
- `effectiveWindowMs()` relaxes the window to `base × PRACTICE_WINDOW_SCALE` (1.5) while
  practicing.
- `famFinishAttempt()` releases the cursor and offers **Practice again / Continue**.
  Most games show both buttons to everyone. **Brain Shift gates it**: below
  `PRACTICE_PASS_ACCURACY` it withholds Continue and shows Practice again alone
  (`famMustRepeat`), until `MAX_PRACTICE_ATTEMPTS` is reached, after which the gate
  opens so nobody is stuck. `famDone()` sets the run-once localStorage flag and ends.

### Logging (Section 11)

`exportCSV()` writes a **SESSION METADATA** header block (identity + config; trimmed for
familiarization) then a **TRIAL DATA** table (columns = union of all row keys), then the
rows from `trialLogs`. `saveFileToDisk` wraps it in a `Blob` and triggers a download; a
UTF-8 BOM is prepended so Excel reads Persian correctly.

---

## 6. Per-game differences

The engine (Sections 4–5 above, input, logging, familiarization) is **identical
everywhere**. Only the *stimulus* pieces change:

| Game | Trial object (from `generateTrialPool`) | Response / notable extras |
|---|---|---|
| **Simon** (reference) | `{word, position, congruency}` | Arrow key matching the word's MEANING. `keyMap` changes per level. |
| **Go/No-Go** | `{color, shape, trialType}` | SPACE for Go targets, withhold otherwise. `recordResponse` also computes `sdtOutcome` (hit/miss/falseAlarm/correctRejection). Drawer: `drawStimulusShape`. |
| **Memory Matrix** | `{stage, gridSize, nTargets, targetSet}` | Cells flash → blank retention → **click** recalled cells (clicking again de-selects) + Done. Scored with **partial credit** (`(nHits − nFalseAlarms) / nTargets`); `result` is a pass mark on that score at `CONFIG.PASS_SCORE`. Uses a **pointer-lock virtual cursor** (`requestPointerLock`, `vCursorX/Y`); `mousePressed` handles clicks; `drawGrid` renders. |
| **Star Search** | `{targetColor, targetShape, d1Color, d2Shape, d1Count, d2Count}` | Click the odd-one-out (feature vs conjunction). Item **positions** computed by `rejectionPositions` / `gridJitterPositions`; familiarization seeds the RNG (`famBuildItemsSeeded`) so displays are identical for all participants. Also uses the **pointer-lock virtual cursor**, recentred at each stimulus onset so cursor-to-target distance does not vary trial to trial. |
| **Brain Shift** | `{stimulusNumber, stimulusColor, stimulusPosition, taskDomain, expectedCategory, correctResponse, switchType}` | Four labeled boxes (`BOXES`); `←/→` = No/Yes; tracks task-switching. L1 pure blocks, L3 labels hidden. |
| **Chalkboard** | `{leftExpr, rightExpr, leftValue, rightValue, correctResponse, diffRatio}` | `←/→` picks the larger side; `drawExpressionCards` renders the two sums; difficulty = `diffRatio`. |

---

## 7. Cross-cutting notes

- **Persian rendering (FA tree):** an `@font-face` Vazirmatn family, a single
  `textFont('Vazirmatn')`, and `drawingContext.direction = 'rtl'`. `fmtNum()` converts
  digits to Persian (۰۱۲۳). Chalkboard temporarily flips to `ltr` for arithmetic so
  numbers read correctly.
- **Where to change what:** a value → `CONFIG`; a wording → `STRINGS`; a level →
  `LEVELS`; a familiarization practice trial → `FAM_PRACTICE_SETS`; the *why* → the
  `Section X.Y` comments and `CogGames_Documentation.docx`.
- **Two DOM/canvas layers:** if a click "does nothing", check whether the target is a
  canvas-drawn element (needs manual hit-testing, e.g. the Done button) or a real DOM
  button (`ui.*`, handled by the browser).
