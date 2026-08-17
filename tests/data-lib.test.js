import test from 'node:test';
import assert from 'node:assert/strict';
import { attachAvailabilityStores, cleanCompanies, cleanSteamAppId, cleanText, hasEnhancedDualSenseFeature, mergeRecords, normalizeStatus, parseAvailabilityStores, parseCargoResponse, splitValues, validateDataset } from '../scripts/data-lib.js';

const dualSenseFixture = [
  { title: { Page: 'Alpha Game', Developers: 'Company:Alpha_Studio, Company:Second', Publishers: 'Company:Publisher', 'Cover URL': 'https://example.com/alpha.jpg', 'Steam AppID': '12345,67890', Released: '2020-01-02;2021-03-04', 'Available on': 'Windows,Linux', 'Playstation controller support': 'true', 'DualSense adaptive trigger support': 'limited', 'DualSense haptic feedback support': 'true', 'PlayStation controller models': 'DualSense,DualSense Edge', 'Playstation connection modes': 'Wired,Wireless (Bluetooth)', 'Controller haptic feedback hd': 'unknown' } },
  { title: { Page: 'Beta Game', Developers: null, Publishers: 'Company:Beta', 'Cover URL': 'not-a-url', Released: null, 'Available on': null, 'Playstation controller support': 'hackable', 'DualSense adaptive trigger support': '', 'DualSense haptic feedback support': 'false', 'PlayStation controller models': 'DualSense', 'Playstation connection modes': 'Wired', 'Controller haptic feedback hd': null } }
];
const edgeFixture = [
  { title: { Page: 'Alpha Game', Developers: 'Company:Alpha_Studio', Publishers: 'Company:Publisher', Released: '2020-01-02', 'Available on': 'Windows', 'Playstation controller support': 'limited', 'DualSense adaptive trigger support': 'true', 'DualSense haptic feedback support': 'true', 'PlayStation controller models': 'DualSense,DualSense Edge', 'Playstation connection modes': 'Wired', 'Controller haptic feedback hd': 'true' } },
  { title: { Page: 'Gamma Game', Developers: 'Company:Gamma', Publishers: null, Released: '2022-01-01', 'Available on': 'Windows', 'Playstation controller support': 'false', 'DualSense adaptive trigger support': 'false', 'DualSense haptic feedback support': 'false', 'PlayStation controller models': 'DualSense Edge', 'Playstation connection modes': 'Wireless (Bluetooth)', 'Controller haptic feedback hd': 'false' } }
];

test('normalizes statuses and list values', () => {
  assert.equal(normalizeStatus('TRUE'), 'true');
  assert.equal(normalizeStatus('always on'), 'always on');
  assert.equal(normalizeStatus('not-a-status'), 'unknown');
  assert.deepEqual(splitValues('Wired,Wireless (Bluetooth); USB'), ['Wired', 'Wireless (Bluetooth)', 'USB']);
  assert.deepEqual(cleanCompanies('Company:Alpha_Studio,Company:Beta'), ['Alpha Studio', 'Beta']);
  assert.equal(cleanText('Ratchet &amp; Clank'), 'Ratchet & Clank');
  assert.equal(cleanSteamAppId('12345,67890'), '12345');
});

test('rejects empty and malformed API responses', () => {
  assert.throws(() => parseCargoResponse({}), /缺少 cargoquery/);
  assert.throws(() => parseCargoResponse({ error: { info: 'bad response' } }), /bad response/);
  assert.deepEqual(parseCargoResponse({ cargoquery: [] }), []);
});

test('keeps only Steam and Epic direct product links', () => {
  const wikitext = `{{Availability|
{{Availability/row| Epic Games Store | alpha-game | DRM-free | {{Store link|Epic Games Store|alpha-deluxe|Deluxe}} | | Windows }}
{{Availability/row| GOG.com | alpha_game | DRM-free | | | Windows }}
{{Availability/row| Microsoft Store | 9ABC123 | Microsoft Store | | | Windows }}
{{Availability/row| itch.io | https://studio.itch.io/alpha | DRM-free | | | Windows }}
{{Availability/row| retail | | Steam | | | Windows }}
}}`;
  assert.deepEqual(parseAvailabilityStores(wikitext, '12345'), [
    { name: 'Steam', url: 'https://store.steampowered.com/app/12345/' },
    { name: 'Epic', url: 'https://store.epicgames.com/p/alpha-game' }
  ]);
});

test('merges model rows and removes games without DualSense enhancements', () => {
  const dataset = mergeRecords(dualSenseFixture, edgeFixture, '2026-08-17T00:00:00.000Z', { 'Alpha Game': '阿尔法游戏' });
  assert.equal(dataset.schemaVersion, 5);
  assert.equal(dataset.games.length, 1);
  const alpha = dataset.games.find((game) => game.title === 'Alpha Game');
  assert.deepEqual(alpha.models.sort(), ['DualSense', 'DualSense Edge']);
  assert.deepEqual(alpha.developers, ['Alpha Studio', 'Second']);
  assert.deepEqual(alpha.releaseDates, ['2020-01-02', '2021-03-04']);
  assert.equal(alpha.modelStatuses.DualSense, 'true');
  assert.equal(alpha.modelStatuses['DualSense Edge'], 'limited');
  assert.equal(alpha.hdHapticFeedback, 'true');
  assert.equal(alpha.coverUrl, 'https://example.com/alpha.jpg');
  assert.equal(alpha.steamAppId, '12345');
  assert.equal(alpha.titleZh, '阿尔法游戏');
  attachAvailabilityStores(dataset, { 'alpha game': '{{Availability/row|Steam|12345|Steam||||Windows}}' });
  assert.deepEqual(alpha.stores, [{ name: 'Steam', url: 'https://store.steampowered.com/app/12345/' }]);
  assert.equal(hasEnhancedDualSenseFeature(alpha), true);
  assert.equal(dataset.games.some((game) => game.title === 'Beta Game'), false);
  assert.equal(dataset.games.some((game) => game.title === 'Gamma Game'), false);
  validateDataset(dataset);
});

test('rejects empty, malformed, incomplete and sharply reduced datasets', () => {
  assert.throws(() => validateDataset({ schemaVersion: 5, fetchedAt: 'x', source: 'x', selection: {}, games: [] }), /数据为空/);
  const base = mergeRecords(dualSenseFixture, edgeFixture);
  assert.throws(() => validateDataset({ ...base, games: base.games.map((game) => ({ ...game, models: ['DualSense'] })) }), /DualSense 和 DualSense Edge/);
  const previous = { ...base, games: Array.from({ length: 10 }, (_, index) => ({ ...base.games[0], id: `old-${index}`, title: `Old ${index}` })) };
  assert.throws(() => validateDataset(base, previous), /骤降/);
  assert.throws(() => validateDataset({ ...base, games: [{ ...base.games[0] }, { ...base.games[0] }] }), /重复/);
  assert.throws(() => validateDataset({ ...base, games: [{ ...base.games[0], adaptiveTriggers: 'false', hapticFeedback: 'unknown' }] }), /没有 DualSense 增强功能/);
});
