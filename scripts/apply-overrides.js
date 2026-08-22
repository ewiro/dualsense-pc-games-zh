import { readFile, writeFile } from 'node:fs/promises';
import { applyGameOverrides, validateDataset } from './data-lib.js';

const datasetPath = new URL('../data/games.json', import.meta.url);
const overridesPath = new URL('../data/game-overrides.json', import.meta.url);
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
const overrides = JSON.parse(await readFile(overridesPath, 'utf8'));

applyGameOverrides(dataset, overrides);
validateDataset(dataset);
await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`已将 ${overrides.overrides.length} 条人工覆盖应用到数据快照`);
