import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { findTrades, type MatchItem } from '../supabase/functions/_shared/matcher.ts';

const JAR = process.env.TM_JAR ?? '';

test('ejemplo de las instrucciones de TradeMaximizer', () => {
  const items: MatchItem[] = [
    { id: '1', owner: 'alice', wants: [{ id: '3', rank: 1 }, { id: '2', rank: 2 }, { id: '6', rank: 3 }] },
    { id: '2', owner: 'betty', wants: [{ id: '1', rank: 1 }, { id: '6', rank: 2 }, { id: '4', rank: 3 }, { id: '3', rank: 4 }] },
    { id: '3', owner: 'craig', wants: [{ id: '6', rank: 1 }, { id: '2', rank: 2 }] },
    { id: '4', owner: 'david', wants: [{ id: '2', rank: 1 }] },
    { id: '5', owner: 'ethan', wants: [1, 2, 3, 4, 6].map((x, i) => ({ id: String(x), rank: i + 1 })) },
    { id: '6', owner: 'fiona', wants: [{ id: '1', rank: 1 }, { id: '2', rank: 2 }] },
  ];
  const r = findTrades(items);
  assert.equal(r.stats.numTrades, 5);
  assert.equal(r.stats.totalCost, 7);
  assert.deepEqual(r.unmatched, ['5']);
  assert.equal(r.stats.sumSquares, 13);
});

test('sin intercambios posibles', () => {
  const r = findTrades([
    { id: 'a', owner: 'x', wants: [] },
    { id: 'b', owner: 'y', wants: [{ id: 'a' }] },
  ]);
  assert.equal(r.stats.numTrades, 0);
  assert.deepEqual(r.unmatched.sort(), ['a', 'b']);
});

test('nunca intercambia con uno mismo ni entre juegos del mismo dueño', () => {
  const r = findTrades([
    { id: 'a', owner: 'x', wants: [{ id: 'b' }] },
    { id: 'b', owner: 'x', wants: [{ id: 'a' }] },
  ]);
  assert.equal(r.stats.numTrades, 0);
});

test('cada dueño recibe exactamente un juego por cada juego entregado', () => {
  const r = findTrades(randomInstance(60, 15, 1, true), { seed: 7, iterations: 5 });
  const received = new Set(Object.values(r.receives));
  assert.equal(received.size, Object.keys(r.receives).length);
  assert.deepEqual(new Set(Object.keys(r.receives)), received);
});

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

function randomInstance(nItems: number, nUsers: number, seed: number, ranked: boolean): MatchItem[] {
  const r = rng(seed);
  const items: MatchItem[] = [];
  for (let i = 0; i < nItems; i++) items.push({ id: `I${i}`, owner: `U${Math.floor(r() * nUsers)}`, wants: [] });
  for (const it of items) {
    const k = Math.floor(r() * 6);
    const picks = new Set<string>();
    for (let t = 0; t < k; t++) {
      const o = items[Math.floor(r() * nItems)];
      if (o.id !== it.id) picks.add(o.id);
    }
    it.wants = [...picks].map((id, idx) => ({ id, rank: ranked ? idx + 1 : undefined }));
  }
  return items;
}

test('coincide con tm.jar (cantidad de trades y costo total)', { skip: !JAR || !existsSync(JAR) }, () => {
  for (let seed = 1; seed <= 40; seed++) {
    const ranked = seed % 2 === 0;
    // Un dueño distinto por juego: tm.jar permite que un dueño intercambie consigo mismo, nosotros no.
    const nItems = 20 + seed * 3;
    const items = randomInstance(nItems, nItems, seed, ranked).map((it, i) => ({ ...it, owner: `U${i}` }));
    const lines = [ranked ? '#! LINEAR-PRIORITIES HIDE-ERRORS' : '#! LINEAR-PRIORITIES SMALL-STEP=0 HIDE-ERRORS'];
    for (const it of items) lines.push(`(${it.owner}) ${it.id} : ${it.wants.map((w) => w.id).join(' ')}`);
    const out = execFileSync('java', ['-jar', JAR], { input: lines.join('\n') + '\n', encoding: 'utf8' });
    const trades = Number(/Num trades\s*=\s*(\d+)/.exec(out)?.[1]);
    const cost = Number(/Total cost\s*=\s*(\d+)/.exec(out)?.[1]);
    const mine = findTrades(items);
    assert.equal(mine.stats.numTrades, trades, `seed ${seed}: trades`);
    assert.equal(mine.stats.totalCost, cost, `seed ${seed}: costo`);
  }
});
