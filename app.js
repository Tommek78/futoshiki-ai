const N = 6;

const board = document.getElementById("board");
const difficultySelect = document.getElementById("difficulty");
const message = document.getElementById("message");
const generatorInfo = document.getElementById("generatorInfo");
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
let selectedInput = null;
let noteMode = false;
let notes = new Map();
let hintCount = 0;
let startTime = Date.now();
let timerHandle = null;
let completed = false;
let puzzleCounter = Number(localStorage.getItem("futoshikiPuzzleCounter") || 0);

const key = (r,c) => `${r}-${c}`;

function setMessage(text="", type="") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function clearCheckFeedback() {
  board.querySelectorAll(".cell.error, .cell.correct").forEach(cell => {
    cell.classList.remove("error", "correct");
  });
  setMessage();
}

function updateTimer() {
  if (completed) return;
  const elapsed = Math.floor((Date.now() - startTime)/1000);
  const min = String(Math.floor(elapsed/60)).padStart(2,"0");
  const sec = String(elapsed%60).padStart(2,"0");
  timerElement.textContent = `${min}:${sec}`;
}

/* ---------- Seeded random generator ---------- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i=0;i<str.length;i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(array, rng) {
  const a = [...array];
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(rng()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function makeSolution(rng) {
  const symbols = shuffle([1,2,3,4,5,6], rng);
  const rows = shuffle([0,1,2,3,4,5], rng);
  const cols = shuffle([0,1,2,3,4,5], rng);
  return rows.map(r => cols.map(c => symbols[(r+c)%N]));
}

function allEdges(solution) {
  const edges = [];
  for (let r=0;r<N;r++) {
    for (let c=0;c<N-1;c++) {
      edges.push({
        a:[r,c], b:[r,c+1],
        rel: solution[r][c] < solution[r][c+1] ? "<" : ">"
      });
    }
  }
  for (let r=0;r<N-1;r++) {
    for (let c=0;c<N;c++) {
      edges.push({
        a:[r,c], b:[r+1,c],
        rel: solution[r][c] < solution[r+1][c] ? "<" : ">"
      });
    }
  }
  return edges;
}

function countSolutions(clues, inequalities, limit=2) {
  const grid = Array.from({length:N},()=>Array(N).fill(0));
  const rowUsed = Array.from({length:N},()=>new Set());
  const colUsed = Array.from({length:N},()=>new Set());
  const relationMap = new Map();

  function addRel(a,b,rel) {
    const k = key(a[0],a[1]);
    if (!relationMap.has(k)) relationMap.set(k,[]);
    relationMap.get(k).push({other:b,rel});
  }

  inequalities.forEach(item => {
    addRel(item.a,item.b,item.rel);
    addRel(item.b,item.a,item.rel === "<" ? ">" : "<");
  });

  for (const clue of clues) {
    const {r,c,v} = clue;
    if (rowUsed[r].has(v) || colUsed[c].has(v)) return 0;
    grid[r][c]=v;
    rowUsed[r].add(v);
    colUsed[c].add(v);
  }

  function valid(r,c,v) {
    for (const rule of relationMap.get(key(r,c)) || []) {
      const [rr,cc] = rule.other;
      const ov = grid[rr][cc];
      if (!ov) continue;
      if (rule.rel === "<" && !(v < ov)) return false;
      if (rule.rel === ">" && !(v > ov)) return false;
    }
    return true;
  }

  let solutions = 0;

  function search() {
    if (solutions >= limit) return;

    let best = null;
    let candidates = null;

    for (let r=0;r<N;r++) {
      for (let c=0;c<N;c++) {
        if (grid[r][c] !== 0) continue;
        const vals = [];
        for (let v=1;v<=N;v++) {
          if (!rowUsed[r].has(v) && !colUsed[c].has(v) && valid(r,c,v)) vals.push(v);
        }
        if (!vals.length) return;
        if (!candidates || vals.length < candidates.length) {
          best=[r,c];
          candidates=vals;
          if (vals.length===1) break;
        }
      }
      if (candidates?.length===1) break;
    }

    if (!best) {
      solutions++;
      return;
    }

    const [r,c]=best;
    for (const v of candidates) {
      grid[r][c]=v;
      rowUsed[r].add(v);
      colUsed[c].add(v);
      search();
      rowUsed[r].delete(v);
      colUsed[c].delete(v);
      grid[r][c]=0;
      if (solutions >= limit) return;
    }
  }

  search();
  return solutions;
}

function difficultyConfig(level) {
  return {
    easy:   {targetClues:12, targetIneq:24, label:"Leicht"},
    medium: {targetClues:8,  targetIneq:21, label:"Mittel"},
    hard:   {targetClues:5,  targetIneq:18, label:"Schwer"}
  }[level];
}

function generatePuzzle(level, seedText) {
  const cfg = difficultyConfig(level);
  const seedFn = xmur3(seedText);
  const rng = mulberry32(seedFn());

  for (let attempt=0; attempt<40; attempt++) {
    const solution = makeSolution(rng);
    const coords = shuffle(
      Array.from({length:N*N},(_,i)=>[Math.floor(i/N),i%N]),
      rng
    );
    const edges = shuffle(allEdges(solution), rng);

    let clues = coords.slice(0,cfg.targetClues).map(([r,c])=>({r,c,v:solution[r][c]}));
    let inequalities = edges.slice(0,cfg.targetIneq);

    // Add information until the puzzle is unique.
    let clueIndex = cfg.targetClues;
    let edgeIndex = cfg.targetIneq;
    let guard = 0;

    while (countSolutions(clues,inequalities,2) !== 1 && guard < 40) {
      const addEdgeFirst = edgeIndex < edges.length && (clueIndex >= coords.length || rng() > 0.35);
      if (addEdgeFirst) {
        inequalities.push(edges[edgeIndex++]);
      } else if (clueIndex < coords.length) {
        const [r,c] = coords[clueIndex++];
        clues.push({r,c,v:solution[r][c]});
      }
      guard++;
    }

    if (countSolutions(clues,inequalities,2) === 1) {
      return {
        id: seedText,
        level,
        solution,
        clues,
        inequalities
      };
    }
  }

  throw new Error("Es konnte kein eindeutiges Rätsel erzeugt werden.");
}

async function createGeneratedPuzzle(level) {
  generatorInfo.textContent = "Neues Rätsel wird erzeugt …";
  newGameButton.disabled = true;
  difficultySelect.disabled = true;

  await new Promise(resolve => setTimeout(resolve, 20));

  try {
    puzzleCounter++;
    localStorage.setItem("futoshikiPuzzleCounter", String(puzzleCounter));
    const seed = `${Date.now()}-${puzzleCounter}-${level}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
    const puzzle = generatePuzzle(level, seed);
    generatorInfo.textContent = "";
    return puzzle;
  } finally {
    newGameButton.disabled = false;
    difficultySelect.disabled = false;
  }
}

/* ---------- Board UI ---------- */
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
  const path = rel === "<"
    ? "M 8.2 2.8 L 3.8 5 L 8.2 7.2"
    : "M 1.8 2.8 L 6.2 5 L 1.8 7.2";
  return `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${path}"/></svg>`;
}

function addInequality(r,c,direction) {
  const holder = document.createElement("div");
  holder.className = `ineq ${direction === "vertical" ? "vertical" : ""}`;
  holder.style.gridRow = direction === "horizontal" ? String(r*2+1) : String(r*2+2);
  holder.style.gridColumn = direction === "horizontal" ? String(c*2+2) : String(c*2+1);
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
        input.tabIndex=-1;
        input.dataset.row=r;
        input.dataset.col=c;
        input.setAttribute("aria-label",`Zeile ${r+1}, Spalte ${c+1}`);

        if (value) {
          input.value=value;
        } else {
          input.dataset.editable="true";
          wrapper.classList.add("editable");
          wrapper.addEventListener("pointerdown",event=>{
            event.preventDefault();
            selectInput(input);
          });
          wrapper.addEventListener("click",event=>{
            event.preventDefault();
            selectInput(input);
          });
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
  clearCheckFeedback();
  board.querySelectorAll(".cell.selected").forEach(c=>c.classList.remove("selected"));
  selectedInput=input;
  input.closest(".cell").classList.add("selected");
}

function redrawNotes(r,c) {
  const wrapper=board.querySelector(`.cell[data-key="${key(r,c)}"]`);
  if (!wrapper) return;
  const values=notes.get(key(r,c)) || new Set();
  [...wrapper.querySelectorAll(".notes span")].forEach((span,i)=>{
    span.textContent=values.has(i+1) ? i+1 : "";
  });
}

function removeCandidateFromPeers(r,c,n) {
  for (let i=0;i<N;i++) {
    for (const peerKey of [key(r,i),key(i,c)]) {
      if (peerKey===key(r,c)) continue;
      const set=notes.get(peerKey);
      if (set && set.delete(n)) {
        if (!set.size) notes.delete(peerKey);
        const [pr,pc]=peerKey.split("-").map(Number);
        redrawNotes(pr,pc);
      }
    }
  }
}

function enterNumber(value) {
  if (!selectedInput) {
    setMessage("Bitte zuerst ein freies Kästchen wählen.");
    return;
  }

  const r=Number(selectedInput.dataset.row);
  const c=Number(selectedInput.dataset.col);
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
    removeCandidateFromPeers(r,c,n);
    selectNextFree();
  }
}

function selectNextFree() {
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
      wrong++;
      cell.classList.add("error");
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
  const value=currentPuzzle.solution[item.r][item.c];
  item.input.value=value;
  item.input.dataset.hinted="true";
  item.input.closest(".cell").classList.add("hint");
  notes.delete(key(item.r,item.c));
  redrawNotes(item.r,item.c);
  removeCandidateFromPeers(item.r,item.c,value);
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

async function newGame() {
  const level=difficultySelect.value;
  currentPuzzle=await createGeneratedPuzzle(level);
  notes=new Map();
  hintCount=0;
  hintCountElement.textContent="0";
  puzzleLabel.textContent=String(puzzleCounter);
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
  canvas.width=innerWidth;
  canvas.height=innerHeight;

  const pieces=Array.from({length:90},()=>({
    x:Math.random()*canvas.width,
    y:-20-Math.random()*canvas.height*.35,
    vx:(Math.random()-.5)*3,
    vy:2+Math.random()*4,
    size:4+Math.random()*6,
    rot:Math.random()*Math.PI,
    color:Math.random()>.5 ? "#21d4c2" : "#ff9f1c"
  }));

  let frame=0;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p=>{
      p.x+=p.vx;
      p.y+=p.vy;
      p.rot+=.08;
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle=p.color;
      ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
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
if (savedDifficulty) difficultySelect.value=savedDifficulty;
applyTheme(localStorage.getItem("futoshikiTheme") || "dark");
newGame();

if ("serviceWorker" in navigator) {
  window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
}
