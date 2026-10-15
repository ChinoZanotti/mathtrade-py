// Motor de Math Trade: encuentra el máximo número de intercambios simultáneos
// (ciclos) y, entre esas soluciones, el de menor costo total según prioridades.
//
// Modelo (igual que TradeMaximizer): cada juego ofrecido es un nodo. Si el dueño
// del juego A acepta recibir el juego B, hay una arista A -> B con costo = rank.
// Se busca una asignación perfecta (cada juego "recibe" exactamente un juego,
// incluido él mismo = no intercambia, con costo enorme) de costo mínimo.
// Resolver la asignación con el algoritmo húngaro garantiza el máximo de trades.
//
// Sin dependencias: corre igual en Deno (Edge Functions) y Node (tests).

export interface MatchWant {
  /** id del juego deseado */
  id: string;
  /** Prioridad (1 = la más deseada). Si se omite, todos cuestan lo mismo. */
  rank?: number;
}

export interface MatchItem {
  id: string;
  owner: string;
  wants: MatchWant[];
}

export interface MatchOptions {
  /** Semilla para desempates reproducibles. */
  seed?: number;
  /** Cantidad de soluciones aleatorias a probar (se elige la de menor suma de cuadrados). */
  iterations?: number;
  /** Costo de no intercambiar un juego. Debe ser mucho mayor que cualquier rank. */
  nontradeCost?: number;
}

export interface MatchResult {
  /** Cada ciclo lista juegos [a, b, c]: el dueño de a recibe b, el de b recibe c, el de c recibe a. */
  cycles: string[][];
  /** itemId -> itemId que recibe su dueño (solo juegos que intercambian). */
  receives: Record<string, string>;
  /** itemId -> itemId que recibe el juego que se entrega (a quién se envía). */
  sendsTo: Record<string, string>;
  /** Juegos sin intercambio. */
  unmatched: string[];
  stats: {
    numItems: number;
    numTrades: number;
    totalCost: number;
    numGroups: number;
    groupSizes: number[];
    sumSquares: number;
  };
}

const DEFAULT_NONTRADE_COST = 1_000_000_000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(n: number, rnd: (() => number) | null): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  if (!rnd) return p;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

/**
 * Algoritmo húngaro (versión O(n^3) con potenciales). `cost` es n x n, 0-indexada.
 * Devuelve assign[i] = columna asignada a la fila i.
 */
function hungarian(cost: Float64Array[], n: number): number[] {
  const INF = Number.POSITIVE_INFINITY;
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1); // p[j] = fila asignada a la columna j (1-indexado)
  const way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      const row = cost[i0 - 1];
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = row[j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const assign = new Array<number>(n);
  for (let j = 1; j <= n; j++) assign[p[j] - 1] = j - 1;
  return assign;
}

export function findTrades(items: MatchItem[], options: MatchOptions = {}): MatchResult {
  const n = items.length;
  const nontrade = options.nontradeCost ?? DEFAULT_NONTRADE_COST;
  const iterations = Math.max(1, options.iterations ?? 1);

  const index = new Map<string, number>();
  items.forEach((it, i) => {
    if (index.has(it.id)) throw new Error(`Juego duplicado: ${it.id}`);
    index.set(it.id, i);
  });

  // Aristas válidas: sin autointercambio, sin juegos de uno mismo, sin duplicados.
  const edges: Map<number, number>[] = items.map(() => new Map());
  items.forEach((it, i) => {
    it.wants.forEach((w) => {
      const j = index.get(w.id);
      if (j === undefined || j === i) return;
      if (items[j].owner === it.owner) return;
      const c = w.rank === undefined ? 1 : Math.max(1, w.rank);
      const prev = edges[i].get(j);
      if (prev === undefined || c < prev) edges[i].set(j, c);
    });
  });

  const forbidden = (n + 1) * nontrade;
  const rnd = options.seed !== undefined || iterations > 1 ? mulberry32(options.seed ?? 1) : null;

  let best: { assign: number[]; sumSquares: number } | null = null;
  for (let it = 0; it < iterations; it++) {
    const rowPerm = shuffled(n, rnd);
    const colPerm = shuffled(n, rnd);
    // Matriz permutada: fila r representa al juego rowPerm[r]; columna c, al juego colPerm[c].
    const cost: Float64Array[] = new Array(n);
    for (let r = 0; r < n; r++) {
      const i = rowPerm[r];
      const row = new Float64Array(n).fill(forbidden);
      for (let c = 0; c < n; c++) {
        const j = colPerm[c];
        if (j === i) row[c] = nontrade;
        else {
          const e = edges[i].get(j);
          if (e !== undefined) row[c] = e;
        }
      }
      cost[r] = row;
    }
    const a = hungarian(cost, n);
    const assign = new Array<number>(n);
    for (let r = 0; r < n; r++) assign[rowPerm[r]] = colPerm[a[r]];
    const { sumSquares } = groupStats(assign);
    if (!best || sumSquares < best.sumSquares) best = { assign, sumSquares };
  }

  const assign = best ? best.assign : [];
  return buildResult(items, edges, assign);
}

function groupStats(assign: number[]) {
  const seen = new Uint8Array(assign.length);
  const sizes: number[] = [];
  for (let s = 0; s < assign.length; s++) {
    if (seen[s] || assign[s] === s) continue;
    let size = 0;
    let k = s;
    while (!seen[k]) {
      seen[k] = 1;
      size++;
      k = assign[k];
    }
    sizes.push(size);
  }
  return { sizes, sumSquares: sizes.reduce((acc, x) => acc + x * x, 0) };
}

function buildResult(items: MatchItem[], edges: Map<number, number>[], assign: number[]): MatchResult {
  const n = items.length;
  const seen = new Uint8Array(n);
  const cycles: string[][] = [];
  const receives: Record<string, string> = {};
  const sendsTo: Record<string, string> = {};
  const unmatched: string[] = [];
  let totalCost = 0;
  let numTrades = 0;

  for (let s = 0; s < n; s++) {
    if (assign[s] === s) {
      unmatched.push(items[s].id);
      seen[s] = 1;
    }
  }
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const cycle: string[] = [];
    let k = s;
    while (!seen[k]) {
      seen[k] = 1;
      cycle.push(items[k].id);
      const next = assign[k];
      receives[items[k].id] = items[next].id;
      sendsTo[items[next].id] = items[k].id;
      totalCost += edges[k].get(next) ?? 0;
      numTrades++;
      k = next;
    }
    cycles.push(cycle);
  }
  const groupSizes = cycles.map((c) => c.length);
  return {
    cycles,
    receives,
    sendsTo,
    unmatched,
    stats: {
      numItems: n,
      numTrades,
      totalCost,
      numGroups: cycles.length,
      groupSizes,
      sumSquares: groupSizes.reduce((acc, x) => acc + x * x, 0),
    },
  };
}
