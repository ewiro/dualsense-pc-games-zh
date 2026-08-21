export const API_ENDPOINT = 'https://www.pcgamingwiki.com/w/api.php';
export const SOURCE_PAGE = 'https://www.pcgamingwiki.com/wiki/List_of_games_that_support_DualSense';
export const DEFAULT_REPOSITORY_URL = 'https://github.com/ewiro/dualsense-pc-games-zh';

export const QUERY_FIELDS = [
  'Infobox_game._pageName=Page',
  'Infobox_game.Developers',
  'Infobox_game.Publishers',
  'Infobox_game.Cover_URL',
  'Infobox_game.Steam_AppID',
  'Infobox_game.Released',
  'Infobox_game.Available_on',
  'Input.Playstation_controller_support',
  'Input.Playstation_prompts',
  'Input.Playstation_motion_sensors',
  'Input.Playstation_light_bar_support',
  'Input.DualSense_adaptive_trigger_support',
  'Input.DualSense_haptic_feedback_support',
  'Input.PlayStation_controller_models',
  'Input.Playstation_connection_modes',
  'Input.Controller_haptic_feedback_hd'
].join(',');

export const STATUS_LABELS = {
  true: '支持',
  limited: '有限支持',
  hackable: '需额外调整',
  'always on': '始终启用',
  false: '不支持',
  unknown: '未知'
};

export const ENHANCED_STATUSES = new Set(['true', 'limited', 'hackable', 'always on']);

export const FEATURE_KEYS = [
  'playstationPrompts',
  'motionSensors',
  'lightBar',
  'adaptiveTriggers',
  'hapticFeedback',
  'controllerSpeaker'
];

export const CONNECTION_LABELS = {
  Wired: '有线',
  'Wireless (Bluetooth)': '无线（蓝牙）',
  Wireless: '无线',
  'Wireless (USB)': '无线（USB）'
};

const STORE_DEFINITIONS = {
  steam: { name: 'Steam', url: (id) => `https://store.steampowered.com/app/${id}/` },
  'epic games store': { name: 'Epic', url: (id) => `https://store.epicgames.com/p/${id}` }
};
const STORE_ORDER = ['Steam', 'Epic'];

export function normalizeStatus(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return Object.hasOwn(STATUS_LABELS, key) ? key : 'unknown';
}

export function splitValues(value) {
  if (value == null) return [];
  return [...new Set(String(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

export function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

export function cleanWikiNote(value) {
  let note = String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<ref\b[^>]*\/>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\{\{(?:tt|abbr|tooltip|code|kbd|key|path)\|([^|{}]+)(?:\|[^{}]*)?\}\}/gi, '$1')
    .replace(/\[(https?:\/\/\S+?)(?:\s+([^\]]+))?\]/g, (_, url, label) => label || url);
  let previous;
  do {
    previous = note;
    note = note.replace(/\{\{[^{}]*\}\}/g, ' ');
  } while (note !== previous);
  return cleanText(note).replace(/\s+/g, ' ').trim();
}

export function extractWikiNoteLinks(value, sourceUrl = SOURCE_PAGE) {
  const source = String(value ?? '');
  const links = new Map();
  const add = (url, rawLabel) => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      const label = cleanWikiNote(rawLabel) || '相关链接';
      links.set(`${parsed.href}\n${label}`, { label, url: parsed.href });
    } catch {}
  };
  for (const match of source.matchAll(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?\]/gi)) add(match[1], match[2]);
  for (const match of source.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    const target = match[1].trim();
    add(target.startsWith('#') ? new URL(target.replaceAll(' ', '_'), sourceUrl).href : pageUrl(target), match[2] || target);
  }
  return [...links.values()];
}

export function cleanCoverUrl(value) {
  const url = cleanText(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

export function cleanSteamAppId(value) {
  return cleanText(value).match(/\d+/)?.[0] || '';
}

function extractTemplateCalls(wikitext, templateName) {
  const source = String(wikitext ?? '');
  const needle = `{{${templateName}`.toLocaleLowerCase();
  const lower = source.toLocaleLowerCase();
  const calls = [];
  let cursor = 0;
  while ((cursor = lower.indexOf(needle, cursor)) !== -1) {
    let depth = 0;
    let end = cursor;
    for (; end < source.length - 1; end += 1) {
      const pair = source.slice(end, end + 2);
      if (pair === '{{') { depth += 1; end += 1; continue; }
      if (pair === '}}') {
        depth -= 1;
        end += 1;
        if (depth === 0) { calls.push(source.slice(cursor + 2, end - 1)); break; }
      }
    }
    cursor = Math.max(cursor + needle.length, end + 1);
  }
  return calls;
}

function splitTemplateArguments(call) {
  const parts = [];
  let current = '';
  let templateDepth = 0;
  let linkDepth = 0;
  for (let index = 0; index < call.length; index += 1) {
    const pair = call.slice(index, index + 2);
    if (pair === '{{') { templateDepth += 1; current += pair; index += 1; continue; }
    if (pair === '}}') { templateDepth -= 1; current += pair; index += 1; continue; }
    if (pair === '[[') { linkDepth += 1; current += pair; index += 1; continue; }
    if (pair === ']]') { linkDepth -= 1; current += pair; index += 1; continue; }
    if (call[index] === '|' && templateDepth === 0 && linkDepth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += call[index];
  }
  parts.push(current.trim());
  return parts;
}

function templateParameters(wikitext, templateName) {
  const call = extractTemplateCalls(wikitext, templateName)[0];
  if (!call) return {};
  const parameters = {};
  for (const argument of splitTemplateArguments(call).slice(1)) {
    const separator = argument.indexOf('=');
    if (separator === -1) continue;
    const key = argument.slice(0, separator).trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    parameters[key] = argument.slice(separator + 1).trim();
  }
  return parameters;
}

export function detectControllerSpeakerSupport(wikitext, inputParameters = templateParameters(wikitext, 'Input')) {
  const direct = normalizeStatus(inputParameters['playstation speaker']);
  if (direct !== 'unknown') return direct;

  const evidence = String(wikitext ?? '')
    .split(/\r?\n/)
    .filter((line) => /speaker/i.test(line) && (
      /^\|playstation controllers notes\s*=/i.test(line)
      || /(?:controller|dualsense|dualshock|gamepad|built[- ]?in|internal|wireless controller).{0,100}speaker/i.test(line)
      || /speaker.{0,100}(?:controller|dualsense|dualshock|gamepad)/i.test(line)
    ))
    .join(' ');
  if (!evidence) return 'unknown';
  if (/(?:speaker(?: and .{0,50})? functions?\s+(?:are|is)\s+not supported|speaker support\s+(?:is\s+)?(?:not supported|unsupported)|does not support.{0,60}speaker)/i.test(evidence)) return 'false';
  if (/(?:wired|\busb\b|not (?:available|supported|working|work) (?:over|with) bluetooth|not with bluetooth|no .{0,50}speaker support (?:over|with) bluetooth)/i.test(evidence)) return 'limited';
  return 'true';
}

function formatFeatureModes(value) {
  const labels = {
    usb: '有线（USB）',
    wired: '有线',
    wireless: '无线',
    bluetooth: '无线（蓝牙）',
    gyro: '陀螺仪',
    gyroscope: '陀螺仪',
    camera: '镜头控制',
    gesture: '手势',
    waggle: '摇动'
  };
  const modes = splitValues(cleanWikiNote(value)).map((mode) => labels[mode.toLocaleLowerCase()] || mode);
  return modes.length ? `模式：${modes.join('、')}` : '';
}

function featureNote(parameters, notesKeys, modesKeys = []) {
  const mode = modesKeys.map((key) => formatFeatureModes(parameters[key])).find(Boolean) || '';
  const note = notesKeys.map((key) => cleanWikiNote(parameters[key])).find(Boolean) || '';
  return [mode, note].filter(Boolean).join('；');
}

function featureLinks(parameters, notesKeys, sourceUrl) {
  const links = notesKeys.flatMap((key) => extractWikiNoteLinks(parameters[key], sourceUrl));
  return [...new Map(links.map((link) => [`${link.url}\n${link.label}`, link])).values()];
}

function controllerSpeakerNoteSources(wikitext, parameters) {
  const direct = [parameters['playstation speaker notes']].filter(Boolean);
  if (direct.length) return direct;
  return String(wikitext ?? '')
    .split(/\r?\n/)
    .filter((line) => /speaker/i.test(line) && (
      /^\|playstation controllers notes\s*=/i.test(line)
      || /(?:controller|dualsense|dualshock|gamepad|built[- ]?in|internal|wireless controller).{0,100}speaker/i.test(line)
      || /speaker.{0,100}(?:controller|dualsense|dualshock|gamepad)/i.test(line)
    ))
    .map((line) => line.replace(/^\|[^=]+=/, '').trim())
    .filter(Boolean);
}

function controllerSpeakerNote(wikitext, parameters) {
  const direct = featureNote(parameters, ['playstation speaker notes'], ['playstation speaker modes']);
  if (direct) return direct;
  const evidence = controllerSpeakerNoteSources(wikitext, parameters)
    .map(cleanWikiNote)
    .filter(Boolean);
  return [...new Set(evidence)].join('；');
}

export function parseInputFeatures(wikitext, sourceUrl = SOURCE_PAGE) {
  const parameters = templateParameters(wikitext, 'Input');
  const status = (...keys) => {
    for (const key of keys) {
      const value = normalizeStatus(parameters[key]);
      if (value !== 'unknown') return value;
    }
    return 'unknown';
  };
  const featureNotes = {
    playstationPrompts: featureNote(parameters, ['playstation prompts notes', 'dualshock prompts notes']),
    motionSensors: featureNote(parameters, ['playstation motion sensors notes'], ['playstation motion sensors modes']),
    lightBar: featureNote(parameters, ['light bar support notes']),
    adaptiveTriggers: featureNote(parameters, ['dualsense adaptive trigger support notes'], ['dualsense adaptive trigger support modes']),
    hapticFeedback: featureNote(parameters, ['dualsense haptics support notes'], ['dualsense haptics support modes']),
    controllerSpeaker: controllerSpeakerNote(wikitext, parameters)
  };
  const featureNoteLinks = {
    playstationPrompts: featureLinks(parameters, ['playstation prompts notes', 'dualshock prompts notes'], sourceUrl),
    motionSensors: featureLinks(parameters, ['playstation motion sensors notes'], sourceUrl),
    lightBar: featureLinks(parameters, ['light bar support notes'], sourceUrl),
    adaptiveTriggers: featureLinks(parameters, ['dualsense adaptive trigger support notes'], sourceUrl),
    hapticFeedback: featureLinks(parameters, ['dualsense haptics support notes'], sourceUrl),
    controllerSpeaker: controllerSpeakerNoteSources(wikitext, parameters).flatMap((note) => extractWikiNoteLinks(note, sourceUrl))
  };
  return {
    playstationPrompts: status('playstation prompts', 'dualshock prompts'),
    motionSensors: status('playstation motion sensors'),
    lightBar: status('light bar support'),
    adaptiveTriggers: status('dualsense adaptive trigger support'),
    hapticFeedback: status('dualsense haptics support'),
    controllerSpeaker: detectControllerSpeakerSupport(wikitext, parameters),
    featureNotes: Object.fromEntries(Object.entries(featureNotes).filter(([, note]) => note)),
    featureNoteLinks: Object.fromEntries(Object.entries(featureNoteLinks).filter(([, links]) => links.length))
  };
}

function cleanStoreId(value) {
  const id = String(value ?? '').replace(/<!--[^]*?-->/g, '').trim();
  if (!id || /[{}\[\]<>\s]/.test(id)) return '';
  return id;
}

export function parseAvailabilityStores(wikitext, steamAppId = '') {
  const stores = new Map();
  for (const call of extractTemplateCalls(wikitext, 'Availability/row')) {
    const [template, rawStore, rawId] = splitTemplateArguments(call);
    if (template.toLocaleLowerCase() !== 'availability/row') continue;
    const definition = STORE_DEFINITIONS[cleanText(rawStore).toLocaleLowerCase()];
    const id = cleanStoreId(rawId);
    if (!definition || !id) continue;
    const url = definition.url(id);
    if (!/^https:\/\//i.test(url)) continue;
    stores.set(definition.name, { name: definition.name, url });
  }
  const fallbackSteamId = cleanSteamAppId(steamAppId);
  if (fallbackSteamId && !stores.has('Steam')) {
    stores.set('Steam', { name: 'Steam', url: STORE_DEFINITIONS.steam.url(fallbackSteamId) });
  }
  return [...stores.values()].sort((a, b) => {
    const ai = STORE_ORDER.indexOf(a.name);
    const bi = STORE_ORDER.indexOf(b.name);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.name.localeCompare(b.name, 'en');
  });
}

export function attachAvailabilityStores(dataset, pageWikitext = {}) {
  for (const game of dataset.games) {
    const wikitext = pageWikitext[game.title.toLocaleLowerCase()] || '';
    game.stores = parseAvailabilityStores(wikitext, game.steamAppId);
  }
  return dataset;
}

export function attachInputFeatures(dataset, pageWikitext = {}, noteTranslations = {}) {
  for (const game of dataset.games) {
    const features = parseInputFeatures(pageWikitext[game.title.toLocaleLowerCase()] || '', game.source);
    if (features.playstationPrompts !== 'unknown' || !game.playstationPrompts) game.playstationPrompts = features.playstationPrompts;
    if (features.motionSensors !== 'unknown' || !game.motionSensors) game.motionSensors = features.motionSensors;
    if (features.lightBar !== 'unknown' || !game.lightBar) game.lightBar = features.lightBar;
    game.controllerSpeaker = features.controllerSpeaker;
    if (features.adaptiveTriggers !== 'unknown') game.adaptiveTriggers = features.adaptiveTriggers;
    if (features.hapticFeedback !== 'unknown') game.hapticFeedback = features.hapticFeedback;
    game.featureNotes = Object.fromEntries(Object.entries(features.featureNotes).map(([key, note]) => [key, noteTranslations[note] || note]));
    game.featureNoteLinks = Object.fromEntries(Object.entries(features.featureNoteLinks).map(([key, links]) => [key, links.map((link) => ({ ...link, label: noteTranslations[link.label] || link.label }))]));
  }
  dataset.schemaVersion = 8;
  return dataset;
}

export function cleanCompany(value) {
  const text = cleanText(value).replace(/^Company:/i, '').replaceAll('_', ' ');
  return text.trim();
}

export function cleanCompanies(value) {
  return [...new Set(splitValues(value).map(cleanCompany).filter(Boolean))];
}

export function cleanDates(value) {
  return [...new Set(splitValues(value).map((date) => date.trim()).filter(Boolean))];
}

export function cleanPlatforms(value) {
  return [...new Set(splitValues(value).map(cleanText).filter(Boolean))];
}

export function cleanConnections(value) {
  const supported = new Set(['Wired', 'Wireless (Bluetooth)']);
  return [...new Set(splitValues(value).map(cleanText).filter((item) => supported.has(item)))];
}

export function pageUrl(title) {
  const [page, ...fragmentParts] = String(title).split('#');
  const base = `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(page.replaceAll(' ', '_'))}`;
  const fragment = fragmentParts.join('#').replaceAll(' ', '_');
  return fragment ? `${base}#${encodeURIComponent(fragment)}` : base;
}

export function unwrapCargoRow(row) {
  return row?.title ?? row ?? {};
}

export function hasEnhancedDualSenseFeature(game) {
  return ENHANCED_STATUSES.has(game?.adaptiveTriggers) || ENHANCED_STATUSES.has(game?.hapticFeedback);
}

export function parseCargoResponse(json) {
  if (!json || json.error || !Array.isArray(json.cargoquery)) {
    throw new Error(`PCGamingWiki API 响应无效：${json?.error?.info || '缺少 cargoquery'}`);
  }
  return json.cargoquery;
}

export function mergeRecords(dualSenseRows, edgeRows, fetchedAt = new Date().toISOString(), translations = {}) {
  const merged = new Map();
  const add = (row, model) => {
    const item = unwrapCargoRow(row);
    const title = cleanText(item.Page);
    if (!title) return;
    const key = title.toLocaleLowerCase();
    const current = merged.get(key) ?? {
      id: key.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || `game-${merged.size + 1}`,
      title,
      titleZh: translations[title] || title,
      source: pageUrl(title),
      coverUrl: '',
      steamAppId: '',
      stores: [],
      developers: [],
      publishers: [],
      releaseDates: [],
      platforms: [],
      modelStatuses: {},
      models: [],
      controllerSupport: 'unknown',
      connectionModes: [],
      playstationPrompts: 'unknown',
      motionSensors: 'unknown',
      lightBar: 'unknown',
      adaptiveTriggers: 'unknown',
      hapticFeedback: 'unknown',
      hdHapticFeedback: 'unknown',
      controllerSpeaker: 'unknown',
      featureNotes: {},
      featureNoteLinks: {}
    };
    current.developers = [...new Set([...current.developers, ...cleanCompanies(item.Developers)])];
    current.publishers = [...new Set([...current.publishers, ...cleanCompanies(item.Publishers)])];
    current.coverUrl ||= cleanCoverUrl(item['Cover URL']);
    current.steamAppId ||= cleanSteamAppId(item['Steam AppID']);
    current.releaseDates = [...new Set([...current.releaseDates, ...cleanDates(item.Released)])];
    current.platforms = [...new Set([...current.platforms, ...cleanPlatforms(item['Available on'])])];
    current.controllerSupport = normalizeStatus(item['Playstation controller support']);
    current.connectionModes = [...new Set([...current.connectionModes, ...cleanConnections(item['Playstation connection modes'])])];
    current.playstationPrompts = normalizeStatus(item['Playstation prompts']);
    current.motionSensors = normalizeStatus(item['Playstation motion sensors']);
    current.lightBar = normalizeStatus(item['Playstation light bar support']);
    current.adaptiveTriggers = normalizeStatus(item['DualSense adaptive trigger support']);
    current.hapticFeedback = normalizeStatus(item['DualSense haptic feedback support']);
    current.hdHapticFeedback = normalizeStatus(item['Controller haptic feedback hd']);
    current.modelStatuses[model] = current.controllerSupport;
    if (!current.models.includes(model)) current.models.push(model);
    merged.set(key, current);
  };
  dualSenseRows.forEach((row) => add(row, 'DualSense'));
  edgeRows.forEach((row) => add(row, 'DualSense Edge'));
  const games = [...merged.values()]
    .filter(hasEnhancedDualSenseFeature)
    .sort((a, b) => a.title.localeCompare(b.title, 'en'));
  return {
    schemaVersion: 8,
    fetchedAt,
    source: SOURCE_PAGE,
    selection: {
      rule: 'adaptiveTriggers OR hapticFeedback',
      statuses: [...ENHANCED_STATUSES]
    },
    games
  };
}

export function validateDataset(dataset, previous = null) {
  if (!dataset || !Array.isArray(dataset.games) || dataset.games.length === 0) {
    throw new Error('数据为空，拒绝发布');
  }
  if (dataset.schemaVersion !== 8 || !dataset.fetchedAt || !dataset.source || !dataset.selection) {
    throw new Error('数据缺少 schemaVersion、fetchedAt 或 source');
  }
  const ids = new Set();
  const titles = new Set();
  for (const game of dataset.games) {
    if (!game.id || !game.title || !game.titleZh || !game.source) throw new Error('存在缺少 id、title、titleZh 或 source 的记录');
    if (ids.has(game.id) || titles.has(game.title.toLocaleLowerCase())) throw new Error(`发现重复游戏：${game.title}`);
    ids.add(game.id);
    titles.add(game.title.toLocaleLowerCase());
    if (!Array.isArray(game.models) || game.models.length === 0) throw new Error(`游戏缺少手柄型号：${game.title}`);
    if (!Array.isArray(game.stores)) throw new Error(`游戏缺少购买平台列表：${game.title}`);
    for (const key of FEATURE_KEYS) {
      if (!Object.hasOwn(STATUS_LABELS, game[key])) throw new Error(`游戏包含无效功能状态 ${key}：${game.title}`);
    }
    if (!game.featureNotes || typeof game.featureNotes !== 'object' || Array.isArray(game.featureNotes)) {
      throw new Error(`游戏缺少功能说明对象：${game.title}`);
    }
    for (const [key, note] of Object.entries(game.featureNotes)) {
      if (!FEATURE_KEYS.includes(key) || typeof note !== 'string' || !note.trim()) throw new Error(`游戏包含无效功能说明 ${key}：${game.title}`);
    }
    if (!game.featureNoteLinks || typeof game.featureNoteLinks !== 'object' || Array.isArray(game.featureNoteLinks)) {
      throw new Error(`游戏缺少功能说明链接对象：${game.title}`);
    }
    for (const [key, links] of Object.entries(game.featureNoteLinks)) {
      if (!FEATURE_KEYS.includes(key) || !Array.isArray(links)) throw new Error(`游戏包含无效功能说明链接 ${key}：${game.title}`);
      for (const link of links) {
        if (!link?.label || !/^https?:\/\//i.test(link.url)) throw new Error(`游戏包含无效功能说明链接 ${key}：${game.title}`);
      }
    }
    for (const store of game.stores) {
      if (!store?.name || !/^https:\/\//i.test(store.url)) throw new Error(`游戏包含无效购买平台链接：${game.title}`);
    }
    if (!hasEnhancedDualSenseFeature(game)) throw new Error(`游戏没有 DualSense 增强功能：${game.title}`);
  }
  const modelSet = new Set(dataset.games.flatMap((game) => game.models));
  if (!modelSet.has('DualSense') || !modelSet.has('DualSense Edge')) throw new Error('数据必须同时包含 DualSense 和 DualSense Edge');
  if (previous?.schemaVersion === dataset.schemaVersion && previous?.games?.length && dataset.games.length < previous.games.length * 0.8) {
    throw new Error(`记录数从 ${previous.games.length} 降至 ${dataset.games.length}，超过 20% 骤降保护线`);
  }
  return true;
}
