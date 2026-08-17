export const API_ENDPOINT = 'https://www.pcgamingwiki.com/w/api.php';
export const SOURCE_PAGE = 'https://www.pcgamingwiki.com/wiki/List_of_games_that_support_DualSense';
export const DEFAULT_REPOSITORY_URL = 'https://github.com/ewiro/dualsense-pc-games-zh';

export const QUERY_FIELDS = [
  'Infobox_game._pageName=Page',
  'Infobox_game.Developers',
  'Infobox_game.Publishers',
  'Infobox_game.Released',
  'Infobox_game.Available_on',
  'Input.Playstation_controller_support',
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
  false: '不支持',
  unknown: '未知'
};

export const CONNECTION_LABELS = {
  Wired: '有线',
  'Wireless (Bluetooth)': '无线（蓝牙）',
  Wireless: '无线',
  'Wireless (USB)': '无线（USB）'
};

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
    .trim();
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
  return [...new Set(splitValues(value).map(cleanText).filter(Boolean))];
}

export function pageUrl(title) {
  return `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(String(title).replaceAll(' ', '_'))}`;
}

export function unwrapCargoRow(row) {
  return row?.title ?? row ?? {};
}

export function parseCargoResponse(json) {
  if (!json || json.error || !Array.isArray(json.cargoquery)) {
    throw new Error(`PCGamingWiki API 响应无效：${json?.error?.info || '缺少 cargoquery'}`);
  }
  return json.cargoquery;
}

export function mergeRecords(dualSenseRows, edgeRows, fetchedAt = new Date().toISOString()) {
  const merged = new Map();
  const add = (row, model) => {
    const item = unwrapCargoRow(row);
    const title = cleanText(item.Page);
    if (!title) return;
    const key = title.toLocaleLowerCase();
    const current = merged.get(key) ?? {
      id: key.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || `game-${merged.size + 1}`,
      title,
      source: pageUrl(title),
      developers: [],
      publishers: [],
      releaseDates: [],
      platforms: [],
      modelStatuses: {},
      models: [],
      controllerSupport: 'unknown',
      connectionModes: [],
      adaptiveTriggers: 'unknown',
      hapticFeedback: 'unknown',
      hdHapticFeedback: 'unknown'
    };
    current.developers = [...new Set([...current.developers, ...cleanCompanies(item.Developers)])];
    current.publishers = [...new Set([...current.publishers, ...cleanCompanies(item.Publishers)])];
    current.releaseDates = [...new Set([...current.releaseDates, ...cleanDates(item.Released)])];
    current.platforms = [...new Set([...current.platforms, ...cleanPlatforms(item['Available on'])])];
    current.controllerSupport = normalizeStatus(item['Playstation controller support']);
    current.connectionModes = [...new Set([...current.connectionModes, ...cleanConnections(item['Playstation connection modes'])])];
    current.adaptiveTriggers = normalizeStatus(item['DualSense adaptive trigger support']);
    current.hapticFeedback = normalizeStatus(item['DualSense haptic feedback support']);
    current.hdHapticFeedback = normalizeStatus(item['Controller haptic feedback hd']);
    current.modelStatuses[model] = current.controllerSupport;
    if (!current.models.includes(model)) current.models.push(model);
    merged.set(key, current);
  };
  dualSenseRows.forEach((row) => add(row, 'DualSense'));
  edgeRows.forEach((row) => add(row, 'DualSense Edge'));
  return {
    schemaVersion: 1,
    fetchedAt,
    source: SOURCE_PAGE,
    games: [...merged.values()].sort((a, b) => a.title.localeCompare(b.title, 'en'))
  };
}

export function validateDataset(dataset, previous = null) {
  if (!dataset || !Array.isArray(dataset.games) || dataset.games.length === 0) {
    throw new Error('数据为空，拒绝发布');
  }
  if (dataset.schemaVersion !== 1 || !dataset.fetchedAt || !dataset.source) {
    throw new Error('数据缺少 schemaVersion、fetchedAt 或 source');
  }
  const ids = new Set();
  const titles = new Set();
  for (const game of dataset.games) {
    if (!game.id || !game.title || !game.source) throw new Error('存在缺少 id、title 或 source 的记录');
    if (ids.has(game.id) || titles.has(game.title.toLocaleLowerCase())) throw new Error(`发现重复游戏：${game.title}`);
    ids.add(game.id);
    titles.add(game.title.toLocaleLowerCase());
    if (!Array.isArray(game.models) || game.models.length === 0) throw new Error(`游戏缺少手柄型号：${game.title}`);
  }
  const modelSet = new Set(dataset.games.flatMap((game) => game.models));
  if (!modelSet.has('DualSense') || !modelSet.has('DualSense Edge')) throw new Error('数据必须同时包含 DualSense 和 DualSense Edge');
  if (previous?.games?.length && dataset.games.length < previous.games.length * 0.8) {
    throw new Error(`记录数从 ${previous.games.length} 降至 ${dataset.games.length}，超过 20% 骤降保护线`);
  }
  return true;
}
