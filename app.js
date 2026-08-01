const board = document.getElementById("board");
const difficultySelect = document.getElementById("difficulty");
const message = document.getElementById("message");
const checkButton = document.getElementById("checkButton");
const hintButton = document.getElementById("hintButton");
const newGameButton = document.getElementById("newGame");
const themeButton = document.getElementById("themeButton");
const numberPad = document.getElementById("numberPad");
const noteModeButton = document.getElementById("noteMode");
const modeInfo = document.getElementById("modeInfo");
const timerElement = document.getElementById("timer");
const hintCountElement = document.getElementById("hintCount");
const puzzleLabel = document.getElementById("puzzleLabel");

let currentPuzzle = null;
let previousPuzzleId = null;
let selectedInput = null;
let noteMode = false;
let notes = new Map();
let hintCount = 0;
let startTime = Date.now();
let timerHandle = null;
let completed = false;

const key = (r,c) => `${r}-${c}`;

function setMessage(text="", type="") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function updateTimer() {
  if (completed) return;
  const elapsed = Math.floor((Date.now() - startTime)/1000);
  const min = String(Math.floor(elapsed/60)).padStart(2,"0");
  const sec = String(elapsed%60).padStart(2,"0");
  timerElement.textContent = `${min}:${sec}`;
}

function choosePuzzle(level) {
  const list = PUZZLES[level];
  const pool = list.filter(p => p.id !== previousPuzzleId);
  return (pool.length ? pool : list)[Math.floor(Math.random()*(pool.length || list.length))];
}

function clueValue(r,c) {
  return currentPuzzle.clues.find(x => x.r===r && x.c===c)?.v ?? null;
}

function inequalityAt(r,c,direction) {
  return currentPuzzle.inequalities.find(item => {
    if (direction === "horizontal") {
      return item.a[0]===r && item.a[1]===c && item.b[0]===r && item.b[1]===c+1;
    }
    return item.a[0]===r && item.a[1]===c && item.b[0]===r+1 && item.b[1]===c;
  });
}

function inequalitySvg(rel) {
  // Small, broad chevrons with a blunt opening angle.
  const path = rel === "<"
    ? "M 8.2 2.8 L 3.8 5 L 8.2 7.2"
    : "M 1.8 2.8 L 6.2 5 L 1.8 7.2";
  return `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${path}"/></svg>`;
}

function addInequality(r,c,direction) {
  const holder = document.createElement("div");
  holder.className = `ineq ${direction === "vertical" ? "vertical" : ""}`;
  holder.style.gridRow = direction === "horizontal" ? String(r * 2 + 1) : String(r * 2 + 2);
  holder.style.gridColumn = direction === "horizontal" ? String(c * 2 + 2) : String(c * 2 + 1);
  const item = inequalityAt(r,c,direction);
  if (item) holder.innerHTML = inequalitySvg(item.rel);
  board.appendChild(holder);
}

function renderNotes(wrapper,r,c) {
  const noteWrap = document.createElement("div");
  noteWrap.className = "notes";
  const values = notes.get(key(r,c)) || new Set();
  for (let n=1;n<=6;n++) {
    const span=document.createElement("span");
    span.textContent = values.has(n) ? n : "";
    noteWrap.appendChild(span);
  }
  wrapper.appendChild(noteWrap);
}

function renderBoard() {
  board.innerHTML="";
  selectedInput=null;
  for (let gr=0;gr<11;gr++) {
    for (let gc=0;gc<11;gc++) {
      const cellRow=gr%2===0, cellCol=gc%2===0;
      if (cellRow && cellCol) {
        const r=gr/2, c=gc/2;
        const value=clueValue(r,c);
        const wrapper=document.createElement("div");
        wrapper.className=`cell ${value ? "given" : ""}`;
        wrapper.dataset.key=key(r,c);

        const input=document.createElement("input");
        input.type="text";
        input.inputMode="none";
        input.readOnly=true;
        input.dataset.row=r;
        input.dataset.col=c;
        input.setAttribute("aria-label",`Zeile ${r+1}, Spalte ${c+1}`);

        if (value) {
          input.value=value;
        } else {
          input.dataset.editable="true";
          input.addEventListener("click",()=>selectInput(input));
          input.addEventListener("focus",()=>selectInput(input));
        }

        wrapper.appendChild(input);
        renderNotes(wrapper,r,c);
        board.appendChild(wrapper);
      } else if (cellRow && !cellCol) {
        addInequality(gr/2,(gc-1)/2,"horizontal");
      } else if (!cellRow && cellCol) {
        addInequality((gr-1)/2,gc/2,"vertical");
      } else {
        board.appendChild(document.createElement("span"));
      }
    }
  }
}

function selectInput(input) {
  if (!input || input.dataset.editable!=="true" || input.dataset.hinted==="true") return;
  board.querySelectorAll(".cell.selected").forEach(c=>c.classList.remove("selected"));
  selectedInput=input;
  input.closest(".cell").classList.add("selected");
  setMessage();
}

function redrawNotes(r,c) {
  const wrapper=board.querySelector(`.cell[data-key="${key(r,c)}"]`);
  const values=notes.get(key(r,c)) || new Set();
  [...wrapper.querySelectorAll(".notes span")].forEach((span,i)=>{
    span.textContent=values.has(i+1) ? i+1 : "";
  });
}

function enterNumber(value) {
  if (!selectedInput) {
    setMessage("Bitte zuerst ein freies Kästchen wählen.");
    return;
  }
  const r=Number(selectedInput.dataset.row), c=Number(selectedInput.dataset.col);
  const wrapper=selectedInput.closest(".cell");
  wrapper.classList.remove("error","correct");

  if (value==="clear") {
    selectedInput.value="";
    notes.delete(key(r,c));
    redrawNotes(r,c);
    return;
  }

  const n=Number(value);
  if (noteMode) {
    selectedInput.value="";
    const set=notes.get(key(r,c)) || new Set();
    set.has(n) ? set.delete(n) : set.add(n);
    notes.set(key(r,c),set);
    redrawNotes(r,c);
  } else {
    selectedInput.value=n;
    notes.delete(key(r,c));
    redrawNotes(r,c);
    selectNextFree(r,c);
  }
}

function selectNextFree(r,c) {
  const inputs=[...board.querySelectorAll('input[data-editable="true"]')];
  const idx=inputs.indexOf(selectedInput);
  for (let offset=1;offset<=inputs.length;offset++) {
    const candidate=inputs[(idx+offset)%inputs.length];
    if (!candidate.value && candidate.dataset.hinted!=="true") {
      selectInput(candidate);
      return;
    }
  }
}

function getValues() {
  return [...board.querySelectorAll("input")].map(input=>({
    input,
    r:Number(input.dataset.row),
    c:Number(input.dataset.col),
    value:Number(input.value)
  }));
}

function checkGame() {
  let wrong=0, empty=0;
  for (const item of getValues()) {
    const cell=item.input.closest(".cell");
    cell.classList.remove("error","correct");
    if (!item.value) empty++;
    else if (item.value!==currentPuzzle.solution[item.r][item.c]) {
      wrong++; cell.classList.add("error");
    } else if (item.input.dataset.editable==="true") {
      cell.classList.add("correct");
    }
  }
  if (wrong) setMessage(`${wrong} ${wrong===1?"Feld ist":"Felder sind"} noch falsch.`,"error-text");
  else if (empty) setMessage(`Bisher richtig – noch ${empty} ${empty===1?"Feld":"Felder"} frei.`);
  else finishGame();
}

function revealHint() {
  const candidates=getValues().filter(item =>
    item.input.dataset.editable==="true" &&
    item.input.dataset.hinted!=="true" &&
    item.value!==currentPuzzle.solution[item.r][item.c]
  );
  if (!candidates.length) {
    setMessage("Kein ungelöstes Feld mehr vorhanden.");
    return;
  }
  const item=candidates[Math.floor(Math.random()*candidates.length)];
  item.input.value=currentPuzzle.solution[item.r][item.c];
  item.input.dataset.hinted="true";
  item.input.closest(".cell").classList.add("hint");
  notes.delete(key(item.r,item.c));
  redrawNotes(item.r,item.c);
  hintCount++;
  hintCountElement.textContent=hintCount;
  setMessage("Eine Zahl wurde aufgedeckt.");
}

function finishGame() {
  completed=true;
  clearInterval(timerHandle);
  setMessage("Geschafft! Das Rätsel ist vollständig gelöst.","success");
  launchConfetti();
}

function newGame() {
  const level=difficultySelect.value;
  currentPuzzle=choosePuzzle(level);
  previousPuzzleId=currentPuzzle.id;
  notes=new Map();
  hintCount=0;
  hintCountElement.textContent="0";
  puzzleLabel.textContent=currentPuzzle.id.split("-")[1];
  completed=false;
  startTime=Date.now();
  clearInterval(timerHandle);
  timerHandle=setInterval(updateTimer,1000);
  updateTimer();
  renderBoard();
  setMessage();
  localStorage.setItem("futoshikiDifficulty",level);
}

function toggleNoteMode() {
  noteMode=!noteMode;
  noteModeButton.setAttribute("aria-pressed",String(noteMode));
  modeInfo.textContent=noteMode ? "Kandidaten eintragen" : "Zahleingabe";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme=theme;
  localStorage.setItem("futoshikiTheme",theme);
}

function launchConfetti() {
  const canvas=document.getElementById("confetti");
  const ctx=canvas.getContext("2d");
  canvas.width=innerWidth; canvas.height=innerHeight;
  const pieces=Array.from({length:90},()=>({
    x:Math.random()*canvas.width, y:-20-Math.random()*canvas.height*.35,
    vx:(Math.random()-.5)*3, vy:2+Math.random()*4,
    size:4+Math.random()*6, rot:Math.random()*Math.PI,
    color:Math.random()>.5 ? "#21d4c2" : "#ff9f1c"
  }));
  let frame=0;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.rot+=.08;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.fillStyle=p.color; ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
      ctx.restore();
    });
    frame++;
    if (frame<150) requestAnimationFrame(draw);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  draw();
}

themeButton.addEventListener("click",()=>{
  const current=document.documentElement.dataset.theme || "dark";
  applyTheme(current==="dark" ? "light" : "dark");
});
newGameButton.addEventListener("click",newGame);
difficultySelect.addEventListener("change",newGame);
checkButton.addEventListener("click",checkGame);
hintButton.addEventListener("click",revealHint);
noteModeButton.addEventListener("click",toggleNoteMode);
numberPad.addEventListener("click",event=>{
  const button=event.target.closest("button[data-number]");
  if (button) enterNumber(button.dataset.number);
});

const savedDifficulty=localStorage.getItem("futoshikiDifficulty");
if (savedDifficulty && PUZZLES[savedDifficulty]) difficultySelect.value=savedDifficulty;
applyTheme(localStorage.getItem("futoshikiTheme") || "dark");
newGame();

if ("serviceWorker" in navigator) {
  window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
}
