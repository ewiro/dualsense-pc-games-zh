import { readFile, writeFile } from 'node:fs/promises';
import { API_ENDPOINT, DEFAULT_REPOSITORY_URL, QUERY_FIELDS, mergeRecords, parseCargoResponse, validateDataset } from './data-lib.js';

const userAgent = process.env.PCGW_USER_AGENT || `dualsense-pc-games-zh/1.0 (${process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : DEFAULT_REPOSITORY_URL})`;
const outputPath = new URL('../data/games.json', import.meta.url);
const translationsPath = new URL('../data/title-translations.json', import.meta.url);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function queryPage(model, offset) {
  const params = new URLSearchParams({
    action: 'cargoquery', format: 'json', tables: 'Infobox_game,Input',
    join_on: 'Infobox_game._pageID=Input._pageID', fields: QUERY_FIELDS,
    where: `Input.PlayStation_controller_models HOLDS '${model}'`,
    order_by: 'Infobox_game._pageName', limit: '500', offset: String(offset)
  });
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const response = await fetch(`${API_ENDPOINT}?${params}`, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) ? retryAfter : 2 ** attempt) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`PCGamingWiki API HTTP ${response.status}`);
    return parseCargoResponse(await response.json());
  }
  throw new Error('PCGamingWiki API 限流重试失败');
}

async function queryModel(model) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await queryPage(model, offset);
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}

async function readPrevious() {
  try { return JSON.parse(await readFile(outputPath, 'utf8')); } catch { return null; }
}

async function readTranslations() {
  try { return JSON.parse(await readFile(translationsPath, 'utf8')); } catch { return {}; }
}

const dualSenseRows = await queryModel('DualSense');
const edgeRows = await queryModel('DualSense Edge');
const translations = await readTranslations();
const dataset = mergeRecords(dualSenseRows, edgeRows, new Date().toISOString(), translations);
validateDataset(dataset, await readPrevious());
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`已从 ${dualSenseRows.length} 条 DualSense / ${edgeRows.length} 条 Edge 原始记录中筛选 ${dataset.games.length} 条增强功能游戏`);
const untranslated = dataset.games.filter((game) => !Object.hasOwn(translations, game.title)).map((game) => game.title);
if (untranslated.length) console.warn(`有 ${untranslated.length} 个标题未找到中文映射，将安全回退英文：${untranslated.join('、')}`);
