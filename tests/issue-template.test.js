import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('issue form collects complete and verifiable game data feedback', async () => {
  const form = await readFile(resolve(root, '.github/ISSUE_TEMPLATE/game-data.yml'), 'utf8');
  const config = await readFile(resolve(root, '.github/ISSUE_TEMPLATE/config.yml'), 'utf8');
  const ids = [...form.matchAll(/^\s+id:\s+([\w-]+)\s*$/gm)].map((match) => match[1]);

  assert.equal(new Set(ids).size, ids.length, 'Issue Form field IDs must be unique');
  for (const id of ['feedback-type', 'game-name', 'data-categories', 'current-data', 'proposed-data', 'evidence-types', 'evidence', 'confirmations']) {
    assert.ok(ids.includes(id), `missing field: ${id}`);
  }
  assert.match(form, /^title: "\[游戏数据\] "$/m);
  assert.match(form, /^\s+- 数据反馈$/m);
  assert.match(form, /Steam Input：/);
  assert.doesNotMatch(form, /游戏版本|系统版本/);
  assert.match(config, /^blank_issues_enabled: true$/m);
  assert.match(config, /^contact_links: \[\]$/m);
});
