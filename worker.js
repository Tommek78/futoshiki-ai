
const N = 6;

self.onmessage = event => {
  const { type, level, seed } = event.data || {};
  if (type !== "generate") return;

  try {
    const puzzle = generatePuzzle(level, seed);
    self.postMessage({ type: "success", puzzle });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

function key(r,c) {
  return `${r}-${c}`;
}

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
  const result = [...array];
  for (let i=result.length-1;i>0;i--) {
    const j = Math.floor(rng()*(i+1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeSolution(rng) {
  // A valid Latin square remains valid after arbitrary row, column
  // and symbol permutations, plus an optional transpose.
  const base = Array.from({length:N}, (_,r) =>
    Array.from({length:N}, (_,c) => ((r + c) % N) + 1)
  );

  const rowOrder = shuffle([...Array(N).keys()], rng);
  const colOrder = shuffle([...Array(N).keys()], rng);
  const symbols = shuffle([1,2,3,4,5,6], rng);
  const transpose = rng() > 0.5;

  const permuted = rowOrder.map(r =>
    colOrder.map(c => symbols[base[r][c] - 1])
  );

  if (!transpose) return permuted;

  return Array.from({length:N}, (_,r) =>
    Array.from({length:N}, (_,c) => permuted[c][r])
  );
}

function allEdges(solution) {
  const edges = [];

  for (let r=0;r<N;r++) {
    for (let c=0;c<N-1;c++) {
      edges.push({
        a:[r,c],
        b:[r,c+1],
        rel: solution[r][c] < solution[r][c+1] ? "<" : ">"
      });
    }
  }

  for (let r=0;r<N-1;r++) {
    for (let c=0;c<N;c++) {
      edges.push({
        a:[r,c],
        b:[r+1,c],
        rel: solution[r][c] < solution[r+1][c] ? "<" : ">"
      });
    }
  }

  return edges;
}

function countSolutions(clues, inequalities, limit=2) {
  const grid = Array.from({length:N}, () => Array(N).fill(0));
  const rowUsed = Array.from({length:N}, () => new Set());
  const colUsed = Array.from({length:N}, () => new Set());
  const relationMap = new Map();

  function addRelation(a,b,rel) {
    const k = key(a[0],a[1]);
    if (!relationMap.has(k)) relationMap.set(k, []);
    relationMap.get(k).push({ other:b, rel });
  }

  for (const item of inequalities) {
    addRelation(item.a, item.b, item.rel);
    addRelation(item.b, item.a, item.rel === "<" ? ">" : "<");
  }

  for (const clue of clues) {
    if (rowUsed[clue.r].has(clue.v) || colUsed[clue.c].has(clue.v)) return 0;
    grid[clue.r][clue.c] = clue.v;
    rowUsed[clue.r].add(clue.v);
    colUsed[clue.c].add(clue.v);
  }

  function valid(r,c,v) {
    for (const rule of relationMap.get(key(r,c)) || []) {
      const [rr,cc] = rule.other;
      const other = grid[rr][cc];
      if (!other) continue;
      if (rule.rel === "<" && !(v < other)) return false;
      if (rule.rel === ">" && !(v > other)) return false;
    }
    return true;
  }

  let solutions = 0;

  function search() {
    if (solutions >= limit) return;

    let best = null;
    let bestValues = null;

    for (let r=0;r<N;r++) {
      for (let c=0;c<N;c++) {
        if (grid[r][c] !== 0) continue;

        const values = [];
        for (let v=1;v<=N;v++) {
          if (!rowUsed[r].has(v) && !colUsed[c].has(v) && valid(r,c,v)) {
            values.push(v);
          }
        }

        if (values.length === 0) return;

        if (bestValues === null || values.length < bestValues.length) {
          best = [r,c];
          bestValues = values;
          if (values.length === 1) break;
        }
      }
      if (bestValues?.length === 1) break;
    }

    if (!best) {
      solutions++;
      return;
    }

    const [r,c] = best;
    for (const value of bestValues) {
      grid[r][c] = value;
      rowUsed[r].add(value);
      colUsed[c].add(value);

      search();

      rowUsed[r].delete(value);
      colUsed[c].delete(value);
      grid[r][c] = 0;

      if (solutions >= limit) return;
    }
  }

  search();
  return solutions;
}

function configFor(level) {
  const configs = {
    easy:   { clues: 13, inequalities: 25, maxAdds: 16 },
    medium: { clues: 9,  inequalities: 22, maxAdds: 20 },
    hard:   { clues: 6,  inequalities: 19, maxAdds: 24 }
  };
  return configs[level] || configs.medium;
}

function generatePuzzle(level, seedText) {
  const cfg = configFor(level);
  const seedFactory = xmur3(seedText);
  const rng = mulberry32(seedFactory());

  for (let attempt=0; attempt<24; attempt++) {
    const solution = makeSolution(rng);
    const coordinates = shuffle(
      Array.from({length:N*N}, (_,i) => [Math.floor(i/N), i%N]),
      rng
    );
    const edges = shuffle(allEdges(solution), rng);

    const clues = coordinates.slice(0,cfg.clues).map(([r,c]) => ({
      r, c, v: solution[r][c]
    }));
    const inequalities = edges.slice(0,cfg.inequalities);

    let clueIndex = cfg.clues;
    let edgeIndex = cfg.inequalities;

    for (let add=0; add<=cfg.maxAdds; add++) {
      const solutionCount = countSolutions(clues, inequalities, 2);

      if (solutionCount === 1) {
        return {
          id: seedText,
          level,
          solution,
          clues,
          inequalities
        };
      }

      if (edgeIndex < edges.length && (add % 3 !== 2 || clueIndex >= coordinates.length)) {
        inequalities.push(edges[edgeIndex++]);
      } else if (clueIndex < coordinates.length) {
        const [r,c] = coordinates[clueIndex++];
        clues.push({ r, c, v: solution[r][c] });
      } else {
        break;
      }
    }
  }

  throw new Error("Generator konnte kein eindeutiges Rätsel erzeugen.");
}
