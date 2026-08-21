import { readFile, writeFile } from 'node:fs/promises';
import { parseInputFeatures } from './data-lib.js';

const cachePath = new URL('./feature-note-translations.json', import.meta.url);
const endpoint = 'https://translate.googleapis.com/translate_a/single';
const commonTranslations = {
  'Wired only.': '仅限有线连接。',
  'Wired only': '仅限有线连接。',
  'wired only': '仅限有线连接。',
  'Wired connection only.': '仅限有线连接。',
  'Wired': '有线连接。',
  'USB only.': '仅限 USB 有线连接。',
  'USB Only': '仅限 USB 有线连接。',
  'DualSense button prompts.': '支持 DualSense 按键提示。',
  'DualShock prompts.': '支持 DualShock 按键提示。',
  'Standard rumble only.': '仅支持普通震动。',
  'regular rumble': '仅支持普通震动。',
  'Basic rumble only.': '仅支持普通震动。',
  'Regular vibration.': '仅支持普通震动。',
  'Use regular rumble.': '使用普通震动。',
  'Named Type B.': '名称为 B 型。',
  'Modes: Off, Weak, Medium & Strong.': '可选关闭、弱、中、强四档。',
  'Switches colors depending on situation': '灯条会根据游戏情境切换颜色。',
  'React to start signal and flags.': '灯条会随起跑信号灯和赛道旗帜变化。',
  'React to start signals and flags.': '灯条会随起跑信号灯和赛道旗帜变化。',
  'Haptics is wired only, use Force Rumble for regular rumble on wireless': '触觉反馈仅限有线连接；无线连接时可使用 Force Rumble 获得普通震动。'
};

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeTranslation(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/按钮\s*提示/g, '按键提示')
    .replace(/按钮图标/g, '按键图标')
    .replace(/控制器按钮/g, '手柄按键')
    .replace(/控制器按键/g, '手柄按键')
    .replace(/面部按钮/g, '正面按键')
    .replace(/缓冲按钮/g, '肩键')
    .replace(/触发器按钮/g, '扳机键')
    .replace(/DualSense 提示/g, 'DualSense 按键提示')
    .replace(/DualShock 提示/g, 'DualShock 按键提示')
    .replace(/自适应触发器|自适应触发/g, '自适应扳机')
    .replace(/触发效果/g, '扳机效果')
    .replace(/完整触觉(?!反馈)/g, '完整触觉反馈')
    .replace(/Steam 输入/g, 'Steam Input')
    .replace(/运动传感器/g, '体感')
    .replace(/隆隆声/g, '震动')
    .replace(/常规震动/g, '普通震动')
    .replace(/正常的震动/g, '普通震动')
    .replace(/经常振动/g, '普通震动')
    .replace(/仅有线(?!连接)/g, '仅限有线连接')
    .replace(/标题更新\s*(\d+)/g, '第 $1 次游戏更新')
    .replace(/本机支持/g, '原生支持')
    .replace(/亮\/关/g, '轻\/关闭')
    .replace(/。；/g, '；')
    .replace(/\s+([，。；：！？])/g, '$1')
    .trim();
}

async function translateEnglish(text) {
  if (!/[A-Za-z]/.test(text)) return text;
  if (commonTranslations[text]) return commonTranslations[text];
  const query = new URLSearchParams({ client: 'gtx', sl: 'en', tl: 'zh-CN', dt: 't', q: text });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${endpoint}?${query}`, { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const json = await response.json();
      const translated = normalizeTranslation((json?.[0] || []).map((part) => part?.[0] || '').join(''));
      if (translated && /[\u3400-\u9fff]/u.test(translated)) return translated;
    }
    if (attempt < 2) await sleep(500 * (attempt + 1));
  }
  throw new Error(`功能说明翻译失败：${text.slice(0, 80)}`);
}

async function translateNote(note) {
  const match = note.match(/^(模式：[^；]+)(?:；([\s\S]+))?$/);
  if (match) return match[2] ? `${match[1]}；${await translateEnglish(match[2])}` : match[1];
  return translateEnglish(note);
}

export async function readNoteTranslations() {
  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    return Object.fromEntries(Object.entries(cached).map(([source, translated]) => [source, commonTranslations[source] || normalizeTranslation(translated)]));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export async function updateNoteTranslations(pageWikitext) {
  const translations = await readNoteTranslations();
  const notes = [...new Set(Object.values(pageWikitext).flatMap((wikitext) => Object.values(parseInputFeatures(wikitext).featureNotes)))];
  const missing = notes.filter((note) => !translations[note]);
  if (missing.length) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (cursor < missing.length) {
        const note = missing[cursor];
        cursor += 1;
        translations[note] = await translateNote(note);
      }
    });
    await Promise.all(workers);
  }
  const sorted = Object.fromEntries(Object.entries(translations).sort(([a], [b]) => a.localeCompare(b, 'en')));
  await writeFile(cachePath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  if (missing.length) console.log(`已新增 ${missing.length} 条中文功能说明`);
  return sorted;
}
