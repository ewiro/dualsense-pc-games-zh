const STATUS_LABELS = { true: '支持', limited: '有限支持', hackable: '需额外调整', 'always on': '始终启用', false: '不支持', unknown: '未知' };
const STATUS_CLASS = { true: 'status-good', limited: 'status-limited', hackable: 'status-adjust', 'always on': 'status-good', false: 'status-no', unknown: 'status-unknown' };
const ENHANCED_STATUSES = new Set(['true', 'limited', 'hackable', 'always on']);
const CONNECTION_LABELS = { Wired: '有线', 'Wireless (Bluetooth)': '无线（蓝牙）', Wireless: '无线', 'Wireless (USB)': '无线（USB）' };
const pageSize = 20;
let games = [];
let page = 1;
let sortKey = 'titleZh';
let sortDirection = 1;

const $ = (id) => document.getElementById(id);
const text = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const list = (value) => Array.isArray(value) && value.length ? value.map(text).join('、') : '—';
const labelStatus = (status) => STATUS_LABELS[status] || STATUS_LABELS.unknown;
const statusPill = (status) => `<span class="status ${STATUS_CLASS[status] || STATUS_CLASS.unknown}">${labelStatus(status)}</span>`;
const formatDate = (date) => date ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(`${date}T00:00:00`)) : '—';

function modelStatus(game, model) { return game.modelStatuses?.[model] || 'unknown'; }
function activeStatus(game, model) { return model === 'all' ? (game.modelStatuses?.DualSense || game.controllerSupport) : modelStatus(game, model); }
function filteredGames() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const model = $('model').value;
  const status = $('status').value;
  const connection = $('connection').value;
  const feature = $('feature').value;
  return games.filter((game) => {
    const haystack = [game.title, game.titleZh, ...(game.developers || []), ...(game.publishers || []), ...(game.platforms || [])].join(' ').toLocaleLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (model !== 'all' && !game.models.includes(model)) return false;
    if (status !== 'all' && activeStatus(game, model) !== status) return false;
    if (connection !== 'all' && !(game.connectionModes || []).includes(connection)) return false;
    if (feature === 'adaptiveTriggers' && !ENHANCED_STATUSES.has(game.adaptiveTriggers)) return false;
    if (feature === 'hapticFeedback' && !ENHANCED_STATUSES.has(game.hapticFeedback)) return false;
    return true;
  }).sort((a, b) => {
    const av = Array.isArray(a[sortKey]) ? a[sortKey][0] || '' : a[sortKey] || '';
    const bv = Array.isArray(b[sortKey]) ? b[sortKey][0] || '' : b[sortKey] || '';
    return String(av).localeCompare(String(bv), sortKey === 'titleZh' ? 'zh-CN' : 'en') * sortDirection;
  });
}
function features(game) {
  const values = [];
  if (ENHANCED_STATUSES.has(game.adaptiveTriggers)) values.push(`<span class="feature feature-trigger">扳机 · ${labelStatus(game.adaptiveTriggers)}</span>`);
  if (ENHANCED_STATUSES.has(game.hapticFeedback)) values.push(`<span class="feature feature-haptic">触觉 · ${labelStatus(game.hapticFeedback)}</span>`);
  return values.join('') || '<span class="muted">—</span>';
}
function coverMarkup(game) {
  const title = game.titleZh || game.title;
  const fallback = text(title.slice(0, 2).toUpperCase());
  if (!game.coverUrl) return `<span class="cover-placeholder" aria-hidden="true">${fallback}</span>`;
  const coverUrl = `https://images.weserv.nl/?url=${encodeURIComponent(game.coverUrl)}&w=120&h=180&fit=cover&output=webp`;
  return `<img class="cover" src="${text(coverUrl)}" alt="${text(title)} 封面" loading="lazy" width="48" height="72" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="cover-placeholder" aria-hidden="true" hidden>${fallback}</span>`;
}
function steamUrl(game) {
  return game.steamAppId ? `https://store.steampowered.com/app/${game.steamAppId}/` : `https://store.steampowered.com/search/?term=${encodeURIComponent(game.title)}`;
}
function renderRow(game) {
  const model = $('model').value;
  const modelList = game.models.map((item) => `<span class="model-tag ${item === 'DualSense Edge' ? 'edge' : ''}">${text(item.replace('DualSense ', ''))}</span>`).join('');
  return `<tr><td><div class="game-identity">${coverMarkup(game)}<div><a class="game-title" href="${text(steamUrl(game))}" target="_blank" rel="noreferrer"><span class="title-zh">${text(game.titleZh || game.title)}</span><small class="title-en">${text(game.title)}</small></a></div></div></td><td><div class="platforms">${list(game.platforms)}</div></td><td><div class="model-list">${modelList}</div></td><td>${statusPill(activeStatus(game, model))}<small>${game.controllerSupport === 'true' ? 'PlayStation 控制器' : '控制器支持记录'}</small></td><td><div class="connections">${(game.connectionModes || []).map((item) => `<span>${text(CONNECTION_LABELS[item] || item)}</span>`).join('') || '<span class="muted">—</span>'}</div></td><td><div class="features">${features(game)}</div></td><td class="date-cell">${text(formatDate(game.releaseDates?.[0]))}</td><td><a class="source" href="${text(game.source)}" target="_blank" rel="noreferrer">查看 ↗</a></td></tr>`;
}
function renderCard(game) {
  const model = $('model').value;
  return `<article class="game-card"><div class="card-top"><div class="game-identity">${coverMarkup(game)}<div><a class="game-title" href="${text(steamUrl(game))}" target="_blank" rel="noreferrer"><span class="title-zh">${text(game.titleZh || game.title)}</span><small class="title-en">${text(game.title)}</small></a></div></div>${statusPill(activeStatus(game, model))}</div><div class="card-details"><span><b>平台</b>${list(game.platforms)}</span><span><b>型号</b>${game.models.map((item) => text(item.replace('DualSense ', ''))).join(' / ')}</span><span><b>连接</b>${(game.connectionModes || []).map((item) => text(CONNECTION_LABELS[item] || item)).join('、') || '—'}</span><span><b>功能</b>${features(game)}</span><span><b>发行</b>${text(formatDate(game.releaseDates?.[0]))}</span></div></article>`;
}
function render() {
  const result = filteredGames();
  const totalPages = Math.max(1, Math.ceil(result.length / pageSize));
  page = Math.min(page, totalPages);
  const visible = result.slice((page - 1) * pageSize, page * pageSize);
  $('result-count').textContent = `显示 ${result.length.toLocaleString('zh-CN')} 条结果`;
  $('game-table').innerHTML = visible.map(renderRow).join('');
  $('mobile-list').innerHTML = visible.map(renderCard).join('');
  $('empty').hidden = result.length !== 0;
  $('table-wrap').hidden = games.length === 0 || result.length === 0;
  $('pagination').innerHTML = totalPages > 1 ? `<button ${page === 1 ? 'disabled' : ''} data-page="${page - 1}">上一页</button><span>第 ${page} / ${totalPages} 页</span><button ${page === totalPages ? 'disabled' : ''} data-page="${page + 1}">下一页</button>` : '';
}
function renderStats(dataset) {
  const haptics = games.filter((game) => ENHANCED_STATUSES.has(game.hapticFeedback)).length;
  const triggers = games.filter((game) => ENHANCED_STATUSES.has(game.adaptiveTriggers)).length;
  $('stat-total').textContent = games.length.toLocaleString('zh-CN');
  $('stat-haptics').textContent = haptics.toLocaleString('zh-CN');
  $('stat-triggers').textContent = triggers.toLocaleString('zh-CN');
  const date = dataset.fetchedAt ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(dataset.fetchedAt)) : '—';
  $('stat-date').textContent = date;
  $('footer-updated').textContent = `最后更新：${date}`;
}
function renderLegend() { $('legend').innerHTML = Object.entries(STATUS_LABELS).map(([key, value]) => `<span><i class="status-dot ${STATUS_CLASS[key]}"></i>${value}</span>`).join(''); }
function listen() {
  ['search', 'model', 'status', 'connection', 'feature'].forEach((id) => $(id).addEventListener('input', () => { page = 1; render(); }));
  document.querySelectorAll('th[data-sort]').forEach((header) => header.addEventListener('click', () => { const key = header.dataset.sort; if (sortKey === key) sortDirection *= -1; else { sortKey = key; sortDirection = 1; } render(); }));
  $('pagination').addEventListener('click', (event) => { const button = event.target.closest('[data-page]'); if (button) { page = Number(button.dataset.page); render(); window.scrollTo({ top: $('catalog').offsetTop - 20, behavior: 'smooth' }); } });
}
async function start() {
  renderLegend();
  try {
    const response = await fetch('data/games.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dataset = await response.json();
    if (!Array.isArray(dataset.games)) throw new Error('数据格式无效');
    games = dataset.games;
    renderStats(dataset);
    $('loading').hidden = true;
    listen();
    render();
  } catch (error) {
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').textContent = `数据加载失败：${error.message}。请稍后重试，或直接访问数据源。`;
  }
}
start();
