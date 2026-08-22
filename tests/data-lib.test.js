import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyGameOverrides, attachAvailabilityStores, attachInfoboxCompanies, attachInputFeatures, cleanCompanies, cleanSteamAppId, cleanText, cleanWikiNote, detectControllerSpeakerSupport, extractWikiNoteLinks, hasEnhancedDualSenseFeature, mergeRecords, normalizeStatus, parseAvailabilityStores, parseCargoResponse, parseExpandedCargoTable, parseInfoboxCompanies, parseInputFeatures, splitValues, validateDataset } from '../scripts/data-lib.js';
import { readNoteTranslations } from '../scripts/note-translations.js';

const dualSenseFixture = [
  { title: { Page: 'Alpha Game', Developers: 'Company:Alpha_Studio, Company:Second', Publishers: 'Company:Publisher', 'Cover URL': 'https://example.com/alpha.jpg', 'Steam AppID': '12345,67890', Released: '2020-01-02;2021-03-04', 'Available on': 'Windows,Linux', 'Playstation controller support': 'true', 'DualSense adaptive trigger support': 'limited', 'DualSense haptic feedback support': 'true', 'PlayStation controller models': 'DualSense,DualSense Edge', 'Playstation connection modes': 'Wired,Wireless (Bluetooth),Wireless (USB)', 'Controller haptic feedback hd': 'unknown' } },
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
  assert.equal(cleanWikiNote("Named '''Type B'''.<ref>{{Refcheck|user=Test}}</ref>"), 'Named Type B.');
  assert.deepEqual(extractWikiNoteLinks('Use [https://example.com/mod this mod] or [[Controller:DualSense|DualSense guide]].'), [
    { label: 'this mod', url: 'https://example.com/mod' },
    { label: 'DualSense guide', url: 'https://www.pcgamingwiki.com/wiki/Controller%3ADualSense' }
  ]);
  assert.deepEqual(extractWikiNoteLinks('See [[#Controller support|controller support]].', 'https://www.pcgamingwiki.com/wiki/Test_Game'), [
    { label: 'controller support', url: 'https://www.pcgamingwiki.com/wiki/Test_Game#Controller_support' }
  ]);
});

test('rejects empty and malformed API responses', () => {
  assert.throws(() => parseCargoResponse({}), /缺少 cargoquery/);
  assert.throws(() => parseCargoResponse({ error: { info: 'bad response' } }), /bad response/);
  assert.deepEqual(parseCargoResponse({ cargoquery: [] }), []);
});

test('parses expanded Cargo tables into the legacy response shape', () => {
  const html = `<table class="cargoTable"><thead><tr><th>Page</th></tr></thead><tbody>
<tr><td class="field_PcgwPage"><a href="/wiki/Alpha_%26_Beta">Alpha &amp; Beta</a></td>
<td class="field_PcgwDevelopers"><a href="/wiki/Company:Studio">Company:Studio</a> <span class="CargoDelimiter">&bull;</span> Company:Second</td>
<td class="field_PcgwPublishers"></td><td class="field_PcgwSteamAppId">123 <span class="CargoDelimiter">&bull;</span> 456</td>
<td class="field_PcgwAdaptiveTriggers">true</td><td class="field_PcgwHapticFeedback">limited</td></tr>
</tbody></table>`;
  assert.deepEqual(parseExpandedCargoTable(html), [{ title: {
    Page: 'Alpha & Beta',
    Developers: 'Company:Studio;Company:Second',
    Publishers: null,
    'Steam AppID': '123;456',
    'DualSense adaptive trigger support': 'true',
    'DualSense haptic feedback support': 'limited'
  } }]);
  assert.deepEqual(parseExpandedCargoTable('<em>No results</em>'), []);
  assert.throws(() => parseExpandedCargoTable('<div class="error">Permission denied</div>'), /Permission denied/);
  assert.throws(() => parseExpandedCargoTable('<table></table>'), /缺少 Cargo 表格/);
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
  const fallback = { games: [{ title: 'Alpha Game', steamAppId: '', stores: [] }] };
  attachAvailabilityStores(fallback, { 'alpha game': '{{Availability/row|Steam|12345|Steam||||Windows}}' });
  assert.equal(fallback.games[0].steamAppId, '12345');
});

test('keeps official company casing from page source', () => {
  const wikitext = `{{Infobox game
|developers =
{{Infobox game/row/developer|id Software}}
{{Infobox game/row/developer|Beethoven & Dinosaur}}
|publishers =
{{Infobox game/row/publisher|miHoYo|China}}
}}`;
  assert.deepEqual(parseInfoboxCompanies(wikitext, 'developer'), ['id Software', 'Beethoven & Dinosaur']);
  const dataset = { games: [{ title: 'Alpha Game', developers: ['Id Software'], publishers: ['MiHoYo'] }] };
  attachInfoboxCompanies(dataset, { 'alpha game': wikitext });
  assert.deepEqual(dataset.games[0].developers, ['id Software', 'Beethoven & Dinosaur']);
  assert.deepEqual(dataset.games[0].publishers, ['miHoYo']);
});

test('keeps a complete Chinese feature note translation cache', async () => {
  const translations = await readNoteTranslations();
  assert.equal(translations['Named Type B.'], '名称为 B 型。');
  assert.ok(Object.keys(translations).length >= 250);
  assert.ok(Object.values(translations).every((note) => typeof note === 'string' && note.trim()));
  assert.match(translations['Use this mod.'], /[\u3400-\u9fff]/u);
  assert.equal(translations['DualSense Edge'], 'DualSense Edge');
});

test('parses PlayStation features and explicit controller speaker evidence', () => {
  const wikitext = `{{Input
|playstation prompts = true
|playstation prompts notes = Use [https://example.com/mod this mod].
|playstation motion sensors = false
|light bar support = limited
|dualsense adaptive trigger support = true
|dualsense adaptive trigger support modes = usb
|dualsense adaptive trigger support notes = Pressing R2 offers resistance.
|dualsense haptics support = hackable
|dualsense haptics support notes = <ref>{{Refcheck|user=Test}}</ref>
|playstation controllers notes = Also supports the built-in speaker on the controllers in wired connection.
}}`;
  assert.deepEqual(parseInputFeatures(wikitext), {
    playstationPrompts: 'true',
    motionSensors: 'false',
    lightBar: 'limited',
    adaptiveTriggers: 'true',
    hapticFeedback: 'hackable',
    controllerSpeaker: 'limited',
    featureNotes: {
      playstationPrompts: 'Use this mod.',
      adaptiveTriggers: '模式：有线（USB）；Pressing R2 offers resistance.',
      controllerSpeaker: 'Also supports the built-in speaker on the controllers in wired connection.'
    },
    featureNoteLinks: {
      playstationPrompts: [{ label: 'this mod', url: 'https://example.com/mod' }]
    }
  });
  assert.equal(detectControllerSpeakerSupport('{{Input\n|playstation speaker = true\n}}'), 'true');
  assert.equal(detectControllerSpeakerSupport('{{Input\n|playstation controllers notes = Speaker and Haptic Feedback functions are not supported.\n}}'), 'false');
  assert.equal(detectControllerSpeakerSupport('{{Audio\n|subtitles notes = Speaker names can be shown.\n}}'), 'unknown');
});

test('merges model rows and removes games without DualSense enhancements', () => {
  const dataset = mergeRecords(dualSenseFixture, edgeFixture, '2026-08-17T00:00:00.000Z', { 'Alpha Game': '阿尔法游戏' });
  assert.equal(dataset.schemaVersion, 8);
  assert.equal(dataset.games.length, 1);
  const alpha = dataset.games.find((game) => game.title === 'Alpha Game');
  assert.deepEqual(alpha.models.sort(), ['DualSense', 'DualSense Edge']);
  assert.deepEqual(alpha.developers, ['Alpha Studio', 'Second']);
  assert.deepEqual(alpha.releaseDates, ['2020-01-02', '2021-03-04']);
  assert.equal(alpha.modelStatuses.DualSense, 'true');
  assert.deepEqual(alpha.connectionModes, ['Wired', 'Wireless (Bluetooth)']);
  assert.equal(alpha.modelStatuses['DualSense Edge'], 'limited');
  assert.equal(alpha.hdHapticFeedback, 'true');
  assert.equal(alpha.coverUrl, 'https://example.com/alpha.jpg');
  assert.equal(alpha.steamAppId, '12345');
  assert.equal(alpha.titleZh, '阿尔法游戏');
  attachAvailabilityStores(dataset, { 'alpha game': '{{Availability/row|Steam|12345|Steam||||Windows}}' });
  assert.deepEqual(alpha.stores, [{ name: 'Steam', url: 'https://store.steampowered.com/app/12345/' }]);
  attachInputFeatures(dataset, { 'alpha game': '{{Input\n|playstation prompts=true\n|playstation prompts notes=Use [https://example.com/mod this mod].\n|playstation motion sensors=false\n|light bar support=true\n|playstation speaker=true\n}}' }, { 'Use this mod.': '使用这个模组。', 'this mod': '这个模组' });
  assert.equal(alpha.playstationPrompts, 'true');
  assert.equal(alpha.motionSensors, 'false');
  assert.equal(alpha.lightBar, 'true');
  assert.equal(alpha.controllerSpeaker, 'true');
  assert.deepEqual(alpha.featureNotes, { playstationPrompts: '使用这个模组。' });
  assert.deepEqual(alpha.featureNoteLinks, { playstationPrompts: [{ label: '这个模组', url: 'https://example.com/mod' }] });
  assert.equal(hasEnhancedDualSenseFeature(alpha), true);
  assert.equal(dataset.games.some((game) => game.title === 'Beta Game'), false);
  assert.equal(dataset.games.some((game) => game.title === 'Gamma Game'), false);
  validateDataset(dataset);
});

test('applies validated local data overrides after PCGamingWiki enrichment', () => {
  const dataset = mergeRecords(dualSenseFixture, edgeFixture, '2026-08-17T00:00:00.000Z', { 'Alpha Game': '阿尔法游戏' });
  applyGameOverrides(dataset, {
    schemaVersion: 1,
    overrides: [{
      title: 'Alpha Game',
      issue: 1,
      reason: 'Verified correction',
      statuses: { hapticFeedback: 'false' },
      featureNotes: { hapticFeedback: '本站核验为不支持。' },
      featureNoteLinks: { hapticFeedback: [{ label: 'Issue #1', url: 'https://example.com/issues/1' }] }
    }]
  });
  const alpha = dataset.games[0];
  assert.equal(alpha.hapticFeedback, 'false');
  assert.equal(alpha.featureNotes.hapticFeedback, '本站核验为不支持。');
  assert.deepEqual(alpha.featureNoteLinks.hapticFeedback, [{ label: 'Issue #1', url: 'https://example.com/issues/1' }]);
  assert.throws(() => applyGameOverrides(dataset, { schemaVersion: 1, overrides: [{ title: 'Missing Game', issue: 2, reason: 'x' }] }), /未匹配到游戏/);
});

test('keeps the Days Gone correction in the committed snapshot', async () => {
  const dataset = JSON.parse(await readFile(new URL('../data/games.json', import.meta.url), 'utf8'));
  const daysGone = dataset.games.find((game) => game.title === 'Days Gone');
  assert.equal(daysGone.hapticFeedback, 'false');
  assert.equal(daysGone.hdHapticFeedback, 'false');
  assert.equal(daysGone.featureNoteLinks.hapticFeedback[0].url, 'https://github.com/ewiro/dualsense-pc-games-zh/issues/1');
});

test('rejects empty, malformed, incomplete and sharply reduced datasets', () => {
  assert.throws(() => validateDataset({ schemaVersion: 8, fetchedAt: 'x', source: 'x', selection: {}, games: [] }), /数据为空/);
  const base = mergeRecords(dualSenseFixture, edgeFixture);
  assert.throws(() => validateDataset({ ...base, games: base.games.map((game) => ({ ...game, models: ['DualSense'] })) }), /DualSense 和 DualSense Edge/);
  const previous = { ...base, games: Array.from({ length: 10 }, (_, index) => ({ ...base.games[0], id: `old-${index}`, title: `Old ${index}` })) };
  assert.throws(() => validateDataset(base, previous), /骤降/);
  assert.throws(() => validateDataset({ ...base, games: [{ ...base.games[0] }, { ...base.games[0] }] }), /重复/);
  assert.throws(() => validateDataset({ ...base, games: [{ ...base.games[0], adaptiveTriggers: 'false', hapticFeedback: 'unknown' }] }), /没有 DualSense 增强功能/);
});
