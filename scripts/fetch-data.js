import { readFile, writeFile } from 'node:fs/promises';
import { API_ENDPOINT, DEFAULT_REPOSITORY_URL, EXPANDED_CARGO_QUERY_FIELDS, attachAvailabilityStores, attachInfoboxCompanies, attachInputFeatures, mergeRecords, parseExpandedCargoTable, validateDataset } from './data-lib.js';
import { updateNoteTranslations } from './note-translations.js';

const userAgent = process.env.PCGW_USER_AGENT || `dualsense-pc-games-zh/1.0 (${process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : DEFAULT_REPOSITORY_URL})`;
const outputPath = new URL('../data/games.json', import.meta.url);
const translationsPath = new URL('../data/title-translations.json', import.meta.url);
const cargoPageSize = 500;
const minimumRequestInterval = 2100;
let nextRequestAt = 0;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForRequestSlot() {
  const delay = Math.max(0, nextRequestAt - Date.now());
  if (delay) await sleep(delay);
  nextRequestAt = Date.now() + minimumRequestInterval;
}

function retryDelay(response, attempt) {
  const retryAfter = response.headers.get('retry-after');
  const seconds = Number(retryAfter);
  if (retryAfter !== null && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(retryAfter);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return response.status === 429 ? 60_000 : 2 ** attempt * 1000;
}

async function requestJson(params) {
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    await waitForRequestSlot();
    const response = await fetch(`${API_ENDPOINT}?${params}`, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (!response.ok) throw new Error(`PCGamingWiki API HTTP ${response.status}`);
    const json = await response.json();
    if (json.error) throw new Error(`PCGamingWiki API 响应无效：${json.error.info || '未知错误'}`);
    return json;
  }
  throw new Error('PCGamingWiki API 重试失败');
}

async function queryPage(model, offset) {
  const cargoQuery = `{{#cargo_query:\n` +
    `tables=Infobox_game,Input\n` +
    `|join on=Infobox_game._pageID=Input._pageID\n` +
    `|fields=${EXPANDED_CARGO_QUERY_FIELDS}\n` +
    `|where=Input.PlayStation_controller_models HOLDS '${model}'\n` +
    `|order by=Infobox_game._pageName\n` +
    `|limit=${cargoPageSize}\n` +
    `|offset=${offset}\n` +
    `|format=table\n` +
    `|more results text=\n` +
    `}}`;
  const params = new URLSearchParams({
    action: 'expandtemplates', format: 'json', formatversion: '2', prop: 'wikitext',
    title: 'List of games that support DualSense', text: cargoQuery
  });
  const json = await requestJson(params);
  if (typeof json.expandtemplates?.wikitext !== 'string') throw new Error('PCGamingWiki 页面解析响应缺少 wikitext');
  return parseExpandedCargoTable(json.expandtemplates.wikitext);
}

async function queryModel(model) {
  const rows = [];
  for (let offset = 0; ; offset += cargoPageSize) {
    const page = await queryPage(model, offset);
    rows.push(...page);
    if (page.length < cargoPageSize) break;
  }
  return rows;
}

async function queryPageWikitext(titles) {
  const result = {};
  for (let index = 0; index < titles.length; index += 50) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'revisions',
      rvprop: 'content', rvslots: 'main', redirects: '1', titles: titles.slice(index, index + 50).join('|')
    });
    const json = await requestJson(params);
    const redirects = new Map((json.query?.redirects || []).map((item) => [item.to.toLocaleLowerCase(), item.from.toLocaleLowerCase()]));
    for (const page of json.query?.pages || []) {
      const content = page.revisions?.[0]?.slots?.main?.content;
      if (content) {
        const key = page.title.toLocaleLowerCase();
        result[key] = content;
        if (redirects.has(key)) result[redirects.get(key)] = content;
      }
    }
  }
  return result;
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
const pageWikitext = await queryPageWikitext(dataset.games.map((game) => game.title));
attachInfoboxCompanies(dataset, pageWikitext);
attachAvailabilityStores(dataset, pageWikitext);
attachInputFeatures(dataset, pageWikitext, await updateNoteTranslations(pageWikitext));
validateDataset(dataset, await readPrevious());
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`已从 ${dualSenseRows.length} 条 DualSense / ${edgeRows.length} 条 Edge 原始记录中筛选 ${dataset.games.length} 条增强功能游戏`);
const untranslated = dataset.games.filter((game) => !Object.hasOwn(translations, game.title)).map((game) => game.title);
if (untranslated.length) console.warn(`有 ${untranslated.length} 个标题未找到中文映射，将安全回退英文：${untranslated.join('、')}`);
