import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('build output serves index, script, styles and data', async () => {
  await exec(process.execPath, ['scripts/build.js'], { cwd: root });
  const dist = resolve(root, 'dist');
  const server = createServer(async (request, response) => {
    const requested = request.url === '/' ? '/index.html' : request.url;
    try {
      const body = await readFile(resolve(dist, `.${requested}`));
      response.writeHead(200); response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  try {
    const port = server.address().port;
    for (const path of ['/', '/app.js', '/styles.css', '/light.css', '/data/games.json']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
    }
  } finally { server.close(); }
});
