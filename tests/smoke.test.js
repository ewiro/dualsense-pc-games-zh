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
    for (const path of ['/', '/app.js', '/styles.css', '/light.css', '/tester.html', '/tester.css', '/tester.js', '/tester-lib.js', '/haptics-audio.js', '/data/games.json']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
    }
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /class="feedback-link"/);
    assert.match(html, /issues\/new\?template=game-data\.yml/);
    assert.match(html, /href="tester\.html"/);
    const tester = await (await fetch(`http://127.0.0.1:${port}/tester.html`)).text();
    assert.match(tester, /id="connect-button"/);
    assert.match(tester, /id="setup-haptic-audio"/);
    assert.match(tester, /id="haptic-output-select"/);
    assert.match(tester, /id="activate-haptic-audio"/);
    assert.match(tester, /id="motion-controller"/);
    assert.match(tester, /id="motion-horizon-plane"/);
    assert.match(tester, /id="motion-roll-value"/);
    assert.match(tester, /type="module" src="tester\.js"/);
    const testerScript = await (await fetch(`http://127.0.0.1:${port}/tester.js`)).text();
    assert.match(testerScript, /enumerateAudioOutputs/);
    assert.match(testerScript, /getUserMedia\(\{ audio: true \}\)/);
    assert.match(testerScript, /track\.stop\(\)/);
    assert.doesNotMatch(testerScript, /selectAudioOutput && window\.AudioContext/);
  } finally { server.close(); }
});
