import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCompanies, mergeRecords, normalizeStatus, parseCargoResponse, splitValues, validateDataset } from '../scripts/data-lib.js';

const dualSenseFixture = [
  { title: { Page: 'Alpha Game', Developers: 'Company:Alpha_Studio, Company:Second', Publishers: 'Company:Publisher', Released: '2020-01-02;2021-03-04', 'Available on': 'Windows,Linux', 'Playstation controller support': 'true', 'DualSense adaptive trigger support': 'limited', 'DualSense haptic feedback support': 'true', 'PlayStation controller models': 'DualSense,DualSense Edge', 'Playstation connection modes': 'Wired,Wireless (Bluetooth)', 'Controller haptic feedback hd': 'unknown' } },
  { title: { Page: 'Beta Game', Developers: null, Publishers: 'Company:Beta', Released: null, 'Available on': null, 'Playstation controller support': 'hackable', 'DualSense adaptive trigger support': '', 'DualSense haptic feedback support': 'false', 'PlayStation controller models': 'DualSense', 'Playstation connection modes': 'Wired', 'Controller haptic feedback hd': null } }
];
const edgeFixture = [
  { title: { Page: 'Alpha Game', Developers: 'Company:Alpha_Studio', Publishers: 'Company:Publisher', Released: '2020-01-02', 'Available on': 'Windows', 'Playstation controller support': 'limited', 'DualSense adaptive trigger support': 'true', 'DualSense haptic feedback support': 'true', 'PlayStation controller models': 'DualSense,DualSense Edge', 'Playstation connection modes': 'Wired', 'Controller haptic feedback hd': 'true' } },
  { title: { Page: 'Gamma Game', Developers: 'Company:Gamma', Publishers: null, Released: '2022-01-01', 'Available on': 'Windows', 'Playstation controller support': 'false', 'DualSense adaptive trigger support': 'false', 'DualSense haptic feedback support': 'false', 'PlayStation controller models': 'DualSense Edge', 'Playstation connection modes': 'Wireless (Bluetooth)', 'Controller haptic feedback hd': 'false' } }
];

test('normalizes statuses and list values', () => {
  assert.equal(normalizeStatus('TRUE'), 'true');
  assert.equal(normalizeStatus('not-a-status'), 'unknown');
  assert.deepEqual(splitValues('Wired,Wireless (Bluetooth); USB'), ['Wired', 'Wireless (Bluetooth)', 'USB']);
  assert.deepEqual(cleanCompanies('Company:Alpha_Studio,Company:Beta'), ['Alpha Studio', 'Beta']);
});

test('rejects empty and malformed API responses', () => {
  assert.throws(() => parseCargoResponse({}), /缺少 cargoquery/);
  assert.throws(() => parseCargoResponse({ error: { info: 'bad response' } }), /bad response/);
  assert.deepEqual(parseCargoResponse({ cargoquery: [] }), []);
});

test('merges paginated model rows and deduplicates games', () => {
  const dataset = mergeRecords(dualSenseFixture, edgeFixture, '2026-08-17T00:00:00.000Z');
  assert.equal(dataset.games.length, 3);
  const alpha = dataset.games.find((game) => game.title === 'Alpha Game');
  assert.deepEqual(alpha.models.sort(), ['DualSense', 'DualSense Edge']);
  assert.deepEqual(alpha.developers, ['Alpha Studio', 'Second']);
  assert.deepEqual(alpha.releaseDates, ['2020-01-02', '2021-03-04']);
  assert.equal(alpha.modelStatuses.DualSense, 'true');
  assert.equal(alpha.modelStatuses['DualSense Edge'], 'limited');
  assert.equal(alpha.hdHapticFeedback, 'true');
  validateDataset(dataset);
});

test('rejects empty, malformed, incomplete and sharply reduced datasets', () => {
  assert.throws(() => validateDataset({ schemaVersion: 1, fetchedAt: 'x', source: 'x', games: [] }), /数据为空/);
  const base = mergeRecords(dualSenseFixture, edgeFixture);
  assert.throws(() => validateDataset({ ...base, games: base.games.map((game) => ({ ...game, models: ['DualSense'] })) }), /DualSense 和 DualSense Edge/);
  assert.throws(() => validateDataset({ ...base, games: base.games.slice(0, 1) }, base), /骤降/);
  assert.throws(() => validateDataset({ ...base, games: [{ ...base.games[0], id: base.games[1].id }, ...base.games.slice(1)] }), /重复/);
});
