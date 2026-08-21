import { readFile, writeFile } from 'node:fs/promises';
import { API_ENDPOINT, DEFAULT_REPOSITORY_URL, attachInputFeatures, validateDataset } from './data-lib.js';

const userAgent = process.env.PCGW_USER_AGENT || `dualsense-pc-games-zh/1.0 (${process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : DEFAULT_REPOSITORY_URL})`;
const outputPath = new URL('../data/games.json', import.meta.url);

async function requestJson(params) {
  const response = await fetch(`${API_ENDPOINT}?${params}`, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`PCGamingWiki API HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(`PCGamingWiki API 响应无效：${json.error.info || '未知错误'}`);
  return json;
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
      if (!content) continue;
      const key = page.title.toLocaleLowerCase();
      result[key] = content;
      if (redirects.has(key)) result[redirects.get(key)] = content;
    }
  }
  return result;
}

const dataset = JSON.parse(await readFile(outputPath, 'utf8'));
attachInputFeatures(dataset, await queryPageWikitext(dataset.games.map((game) => game.title)));
validateDataset(dataset);
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`已为 ${dataset.games.length} 条游戏补充按键提示、体感、灯条和手柄小喇叭状态`);
