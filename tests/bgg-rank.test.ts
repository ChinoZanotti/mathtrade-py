import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchScore, rankSearch } from '../supabase/functions/_shared/bgg-rank.ts';
import { searchDemoGames } from '../supabase/functions/_shared/demo-games.ts';

const item = (id: number, name: string, type = 'primary') =>
  `<item type="boardgame" id="${id}"><name type="${type}" value="${name}"/><yearpublished value="2020"/></item>`;

// Formato de BGG `/search`: el juego exacto puede venir al final, detrás de muchas coincidencias parciales.
const XML = `<?xml version="1.0" encoding="utf-8"?><items total="7" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
${item(10, 'Super Trio')}
${item(11, 'Triominos')}
${item(12, 'Patriot Games')}
${item(13, 'Trio: Disney')}
${item(14, 'Trío', 'alternate')}
${item(15, 'Trio')}
${item(14, 'Cartas Mágicas')}
</items>`;

test('matchScore: exacto, prefijo con separador, prefijo, palabra, resto', () => {
  assert.equal(matchScore('Trio', 'trio'), 0);
  assert.equal(matchScore('TRÍO', 'trio'), 0);
  assert.equal(matchScore('Trio: Disney', 'trio'), 1);
  assert.equal(matchScore('Triominos', 'trio'), 2);
  assert.equal(matchScore('Super Trio', 'trio'), 3);
  assert.equal(matchScore('Patriot Games', 'trio'), 4);
});

test('rankSearch pone primero el nombre exacto aunque BGG lo mande al final', () => {
  const r = rankSearch(XML, 'trio');
  // 14 y 15 empatan en 0; se respeta el orden de BGG (14 apareció antes).
  assert.deepEqual(
    r.map((c) => c.id),
    [14, 15, 13, 11, 10, 12],
  );
  assert.deepEqual(r[0], { id: 14, score: 0 });
});

test('rankSearch: un id con varios nombres vale por su mejor nombre y no se repite', () => {
  const r = rankSearch(XML, 'trio');
  assert.equal(r.filter((c) => c.id === 14).length, 1);
  assert.equal(new Set(r.map((c) => c.id)).size, r.length);
});

test('rankSearch respeta el máximo de candidatos', () => {
  const many = Array.from({ length: 100 }, (_, i) => item(1000 + i, `Trio ${i}`)).join('');
  assert.equal(rankSearch(`<items>${many}${item(1, 'Trio')}</items>`, 'trio', 60).length, 60);
  assert.equal(rankSearch(`<items>${many}${item(1, 'Trio')}</items>`, 'trio', 60)[0].id, 1);
});

test('rankSearch decodifica entidades en los nombres', () => {
  const r = rankSearch(`<items>${item(2, 'Ticket &amp; Ride')}${item(3, 'Ticket & Ride Europe')}</items>`, 'ticket & ride');
  assert.equal(r[0].id, 2);
  assert.equal(r[0].score, 0);
});

test('searchDemoGames ordena por coincidencia', () => {
  const r = searchDemoGames('catan');
  assert.ok(r.length > 0);
  assert.equal(matchScore(r[0].name, 'catan') <= matchScore(r[r.length - 1].name, 'catan'), true);
});
