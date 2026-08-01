const board = document.getElementById("board");
const difficultySelect = document.getElementById("difficulty");
const message = document.getElementById("message");
const checkButton = document.getElementById("checkButton");
const hintButton = document.getElementById("hintButton");
const newGameButton = document.getElementById("newGame");
const themeButton = document.getElementById("themeButton");
const numberPad = document.getElementById("numberPad");

let currentPuzzle = null;
let previousPuzzleId = null;
let hintedCells = new Set();
let selectedInput = null;

function key(r, c) {
  return `${r}-${c}`;
}

function setMessage(text = "", type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function choosePuzzle(level) {
  const list = PUZZLES[level];
  const alternatives = list.filter(p => p.id !== previousPuzzleId);
  const pool = alternatives.length ? alternatives : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function inequalityAt(r, c, direction) {
  if (!currentPuzzle) return null;
  return currentPuzzle.inequalities.find(item => {
    if (direction === "horizontal") {
      return item.a[0] === r && item.a[1] === c &&
             item.b[0] === r && item.b[1] === c + 1;
    }
    return item.a[0] === r && item.a[1] === c &&
           item.b[0] === r + 1 && item.b[1] === c;
  });
}

function addInequality(r, c, direction) {
  const item = inequalityAt(r, c, direction);
  const marker = document.createElement("div");
  marker.className = `ineq ${direction === "vertical" ? "vertical" : ""}`;
  marker.setAttribute("aria-hidden", "true");
  if (item) marker.textContent = item.rel;
  board.appendChild(marker);
}

function clueValue(r, c) {
  const clue = currentPuzzle.clues.find(x => x.r === r && x.c === c);
  return clue ? clue.v : null;
}

function renderBoard() {
  board.innerHTML = "";
  hintedCells.clear();
  selectedInput = null;
  setMessage();

  for (let gridRow = 0; gridRow < 11; gridRow++) {
    for (let gridCol = 0; gridCol < 11; gridCol++) {
      const isCellRow = gridRow % 2 === 0;
      const isCellCol = gridCol % 2 === 0;

      if (isCellRow && isCellCol) {
        const r = gridRow / 2;
        const c = gridCol / 2;
        const value = clueValue(r, c);
        const wrapper = document.createElement("div");
        wrapper.className = `cell ${value ? "given" : ""}`;
        wrapper.dataset.key = key(r, c);

        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "none";
        input.maxLength = 1;
        input.autocomplete = "off";
        input.readOnly = true;
        input.setAttribute("aria-label", `Zeile ${r + 1}, Spalte ${c + 1}`);
        input.dataset.row = r;
        input.dataset.col = c;

        if (value) {
          input.value = value;
          input.setAttribute("aria-readonly", "true");
        } else {
          input.dataset.editable = "true";
          input.addEventListener("click", () => selectInput(input));
          input.addEventListener("focus", () => selectInput(input));
        }

        wrapper.appendChild(input);
        board.appendChild(wrapper);
      } else if (isCellRow && !isCellCol) {
        addInequality(gridRow / 2, (gridCol - 1) / 2, "horizontal");
      } else if (!isCellRow && isCellCol) {
        addInequality((gridRow - 1) / 2, gridCol / 2, "vertical");
      } else {
        board.appendChild(document.createElement("span"));
      }
    }
  }
}

function handleInput(event) {
  const input = event.target;
  input.value = input.value.replace(/[^1-6]/g, "").slice(-1);
  input.closest(".cell").classList.remove("error", "correct");
  setMessage();
  if (input.value) moveFocus(input, 1);
}

function handleKeydown(event) {
  if (event.key === "Backspace" && !event.target.value) {
    event.preventDefault();
    moveFocus(event.target, -1);
  }
  const arrows = { ArrowRight:[0,1], ArrowLeft:[0,-1], ArrowDown:[1,0], ArrowUp:[-1,0] };
  if (arrows[event.key]) {
    event.preventDefault();
    const [dr, dc] = arrows[event.key];
    focusCell(Number(event.target.dataset.row) + dr, Number(event.target.dataset.col) + dc);
  }
}

function editableInputs() {
  return [...board.querySelectorAll('input[data-editable="true"]')];
}

function selectInput(input) {
  if (!input || input.dataset.editable !== "true" || input.dataset.hinted === "true") return;
  board.querySelectorAll(".cell.selected").forEach(cell => cell.classList.remove("selected"));
  selectedInput = input;
  input.closest(".cell").classList.add("selected");
  setMessage();
}

function enterNumber(value) {
  if (!selectedInput) {
    setMessage("Bitte zuerst ein freies Kästchen auswählen.");
    return;
  }
  const cell = selectedInput.closest(".cell");
  cell.classList.remove("error", "correct");
  selectedInput.value = value === "clear" ? "" : value;
}

function moveFocus(input, offset) {
  const inputs = editableInputs();
  const index = inputs.indexOf(input);
  const next = inputs[index + offset];
  if (next) next.focus();
}

function focusCell(r, c) {
  const target = board.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
  if (target) target.focus();
}

function getValues() {
  return [...board.querySelectorAll("input")].map(input => ({
    input,
    r: Number(input.dataset.row),
    c: Number(input.dataset.col),
    value: Number(input.value)
  }));
}

function checkGame() {
  let wrong = 0;
  let empty = 0;

  for (const item of getValues()) {
    const cell = item.input.closest(".cell");
    cell.classList.remove("error", "correct");
    if (!item.value) {
      empty++;
    } else if (item.value !== currentPuzzle.solution[item.r][item.c]) {
      wrong++;
      cell.classList.add("error");
    } else if (!item.input.readOnly) {
      cell.classList.add("correct");
    }
  }

  if (wrong > 0) {
    setMessage(`${wrong} ${wrong === 1 ? "Feld ist" : "Felder sind"} noch falsch.`, "error-text");
  } else if (empty > 0) {
    setMessage(`Bisher alles richtig – noch ${empty} ${empty === 1 ? "Feld" : "Felder"} frei.`);
  } else {
    setMessage("Geschafft! Das Futoshiki ist vollständig gelöst.", "success");
    launchCelebration();
  }
}

function revealHint() {
  const candidates = getValues().filter(item =>
    item.input.dataset.editable === "true" &&
    item.input.dataset.hinted !== "true" &&
    item.value !== currentPuzzle.solution[item.r][item.c]
  );

  if (!candidates.length) {
    setMessage("Es gibt kein ungelöstes Feld mehr.");
    return;
  }

  const item = candidates[Math.floor(Math.random() * candidates.length)];
  item.input.value = currentPuzzle.solution[item.r][item.c];
  item.input.dataset.hinted = "true";
  const cell = item.input.closest(".cell");
  cell.classList.remove("error", "correct");
  cell.classList.add("hint");
  hintedCells.add(key(item.r, item.c));
  setMessage("Eine passende Zahl wurde aufgedeckt.");
}

function newGame() {
  const level = difficultySelect.value;
  currentPuzzle = choosePuzzle(level);
  previousPuzzleId = currentPuzzle.id;
  renderBoard();
  localStorage.setItem("futoshikiDifficulty", level);
}

function launchCelebration() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelector(".game-card").animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.015)" },
      { transform: "scale(1)" }
    ],
    { duration: 420, easing: "ease-out" }
  );
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("futoshikiTheme", theme);
}

themeButton.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme || "light";
  applyTheme(current === "dark" ? "light" : "dark");
});
checkButton.addEventListener("click", checkGame);
hintButton.addEventListener("click", revealHint);
newGameButton.addEventListener("click", newGame);
difficultySelect.addEventListener("change", newGame);
numberPad.addEventListener("click", event => {
  const button = event.target.closest("button[data-number]");
  if (!button) return;
  enterNumber(button.dataset.number);
});

const savedDifficulty = localStorage.getItem("futoshikiDifficulty");
if (savedDifficulty && PUZZLES[savedDifficulty]) difficultySelect.value = savedDifficulty;

const savedTheme = localStorage.getItem("futoshikiTheme");
if (savedTheme) {
  applyTheme(savedTheme);
} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  applyTheme("dark");
}

newGame();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}
