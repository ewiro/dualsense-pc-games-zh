import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'light.css', 'app.js', 'tester.html', 'tester.css', 'tester.js', 'tester-lib.js', '404.html']) await cp(resolve(root, file), resolve(dist, file));
await cp(resolve(root, 'data'), resolve(dist, 'data'), { recursive: true });
const marker = '<!-- BUILD_DATA -->';
const htmlPath = resolve(dist, 'index.html');
const html = await readFile(htmlPath, 'utf8');
await writeFile(htmlPath, html.replace(marker, `构建于 ${new Date().toISOString()}`), 'utf8');
console.log(`静态站点已构建到 ${dist}`);
