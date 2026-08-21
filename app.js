const STATUS_LABELS = { true: '支持', limited: '有限支持', hackable: '需额外调整', 'always on': '始终启用', false: '不支持', unknown: '未知' };
const STATUS_CLASS = { true: 'status-good', limited: 'status-limited', hackable: 'status-adjust', 'always on': 'status-good', false: 'status-no', unknown: 'status-unknown' };
const ENHANCED_STATUSES = new Set(['true', 'limited', 'hackable', 'always on']);
const CONNECTION_LABELS = { Wired: '有线', 'Wireless (Bluetooth)': '无线（蓝牙）', Wireless: '无线', 'Wireless (USB)': '无线（USB）' };
const FEATURE_DEFINITIONS = [
  { key: 'playstationPrompts', label: '按键提示' },
  { key: 'motionSensors', label: '体感' },
  { key: 'lightBar', label: '灯条' },
  { key: 'adaptiveTriggers', label: '自适应扳机' },
  { key: 'hapticFeedback', label: '触觉反馈' },
  { key: 'controllerSpeaker', label: '手柄小喇叭' }
];
const STORE_ORDER = ['Steam', 'Epic'];
const THEME_KEY = 'dualsense-theme';
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
  const store = $('store').value;
  const model = $('model').value;
  const status = $('status').value;
  const connection = $('connection').value;
  const feature = $('feature').value;
  return games.filter((game) => {
    const haystack = [game.title, game.titleZh, ...(game.developers || []), ...(game.publishers || []), ...(game.platforms || []), ...(game.stores || []).map((item) => item.name)].join(' ').toLocaleLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (store !== 'all' && !(game.stores || []).some((item) => item.name === store)) return false;
    if (model !== 'all' && !game.models.includes(model)) return false;
    if (status !== 'all' && activeStatus(game, model) !== status) return false;
    if (connection !== 'all' && !(game.connectionModes || []).includes(connection)) return false;
    if (feature !== 'all' && !ENHANCED_STATUSES.has(game[feature])) return false;
    return true;
  }).sort((a, b) => {
    const av = Array.isArray(a[sortKey]) ? a[sortKey][0] || '' : a[sortKey] || '';
    const bv = Array.isArray(b[sortKey]) ? b[sortKey][0] || '' : b[sortKey] || '';
    return String(av).localeCompare(String(bv), sortKey === 'titleZh' ? 'zh-CN' : 'en') * sortDirection;
  });
}
function storeLinks(game) {
  if (!game.stores?.length) return '<span class="muted">—</span>';
  return `<div class="store-links">${game.stores.map((store) => `<a class="store-link" href="${text(store.url)}" target="_blank" rel="noreferrer" aria-label="前往 ${text(store.name)} 购买：${text(game.titleZh || game.title)}"><span>${text(store.name)}</span><i aria-hidden="true">↗</i></a>`).join('')}</div>`;
}
function featureInfoIcon() {
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"></circle><path d="M10 8.6v5M10 6.2h.01"></path></svg>';
}
function features(game, context) {
  return FEATURE_DEFINITIONS.map(({ key, label }) => {
    const status = Object.hasOwn(STATUS_LABELS, game[key]) ? game[key] : 'unknown';
    const note = game.featureNotes?.[key]?.trim();
    const noteId = `feature-note-${context}-${game.id}-${key}`;
    const info = note ? `<button class="feature-info" type="button" aria-expanded="false" aria-controls="${text(noteId)}" aria-label="查看${text(game.titleZh || game.title)}的${text(label)}说明">${featureInfoIcon()}</button>` : '';
    const details = note ? `<span class="feature-note" id="${text(noteId)}" role="note" hidden>${text(note)}</span>` : '';
    return `<span class="feature-item"><span class="feature"><span>${label}</span><i class="${STATUS_CLASS[status] || STATUS_CLASS.unknown}">${labelStatus(status)}</i>${info}</span>${details}</span>`;
  }).join('');
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
function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  $('theme-toggle').setAttribute('aria-pressed', String(isDark));
  $('theme-toggle').setAttribute('aria-label', isDark ? '切换到白天模式' : '切换到黑夜模式');
  $('theme-label').textContent = isDark ? '白天模式' : '黑夜模式';
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#08121f' : '#ffffff';
}
function setupTheme() {
  applyTheme(document.documentElement.dataset.theme);
  $('theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  });
}
function renderRow(game) {
  const model = $('model').value;
  const modelList = game.models.map((item) => `<span class="model-tag ${item === 'DualSense Edge' ? 'edge' : ''}">${text(item.replace('DualSense ', ''))}</span>`).join('');
  return `<tr><td><div class="game-identity">${coverMarkup(game)}<div><a class="game-title" href="${text(steamUrl(game))}" target="_blank" rel="noreferrer"><span class="title-zh">${text(game.titleZh || game.title)}</span><small class="title-en">${text(game.title)}</small></a></div></div></td><td>${storeLinks(game)}</td><td><div class="model-list">${modelList}</div></td><td><div class="connections">${(game.connectionModes || []).map((item) => `<span>${text(CONNECTION_LABELS[item] || item)}</span>`).join('') || '<span class="muted">—</span>'}</div></td><td><div class="features">${features(game, 'table')}</div></td><td class="date-cell">${text(formatDate(game.releaseDates?.[0]))}</td><td><a class="source" href="${text(game.source)}" target="_blank" rel="noreferrer">查看 ↗</a></td></tr>`;
}
function renderCard(game) {
  const model = $('model').value;
  return `<article class="game-card"><div class="card-top"><div class="game-identity">${coverMarkup(game)}<div><a class="game-title" href="${text(steamUrl(game))}" target="_blank" rel="noreferrer"><span class="title-zh">${text(game.titleZh || game.title)}</span><small class="title-en">${text(game.title)}</small></a></div></div>${statusPill(activeStatus(game, model))}</div><div class="card-details"><div class="card-detail card-stores"><b>购买平台</b>${storeLinks(game)}</div><div class="card-detail"><b>支持型号</b>${game.models.map((item) => text(item.replace('DualSense ', ''))).join(' / ')}</div><div class="card-detail"><b>连接方式</b>${(game.connectionModes || []).map((item) => text(CONNECTION_LABELS[item] || item)).join('、') || '—'}</div><div class="card-detail card-features"><b>功能</b><div class="features">${features(game, 'card')}</div></div><div class="card-detail"><b>发行</b>${text(formatDate(game.releaseDates?.[0]))}</div></div></article>`;
}
function toggleFeatureNote(button) {
  const item = button.closest('.feature-item');
  const note = document.getElementById(button.getAttribute('aria-controls'));
  if (!item || !note) return;
  const willOpen = button.getAttribute('aria-expanded') !== 'true';
  const scope = button.closest('tr, .game-card');
  scope?.querySelectorAll('.feature-info[aria-expanded="true"]').forEach((openButton) => {
    if (openButton === button) return;
    openButton.setAttribute('aria-expanded', 'false');
    openButton.closest('.feature-item')?.classList.remove('is-expanded');
    const openNote = document.getElementById(openButton.getAttribute('aria-controls'));
    if (openNote) openNote.hidden = true;
  });
  button.setAttribute('aria-expanded', String(willOpen));
  item.classList.toggle('is-expanded', willOpen);
  note.hidden = !willOpen;
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
  document.querySelectorAll('th[data-sort]').forEach((header) => header.setAttribute('aria-sort', header.dataset.sort === sortKey ? (sortDirection === 1 ? 'ascending' : 'descending') : 'none'));
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
function renderStoreFilter() {
  const names = [...new Set(games.flatMap((game) => (game.stores || []).map((store) => store.name)))];
  names.sort((a, b) => {
    const ai = STORE_ORDER.indexOf(a);
    const bi = STORE_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b, 'zh-CN');
  });
  $('store').innerHTML = '<option value="all">全部购买平台</option>' + names.map((name) => `<option value="${text(name)}">${text(name)}</option>`).join('');
}
function listen() {
  ['search', 'store', 'model', 'status', 'connection', 'feature'].forEach((id) => $(id).addEventListener('input', () => { page = 1; render(); }));
  document.querySelectorAll('th[data-sort]').forEach((header) => header.addEventListener('click', () => { const key = header.dataset.sort; if (sortKey === key) sortDirection *= -1; else { sortKey = key; sortDirection = 1; } render(); }));
  $('pagination').addEventListener('click', (event) => { const button = event.target.closest('[data-page]'); if (button) { page = Number(button.dataset.page); render(); window.scrollTo({ top: $('catalog').offsetTop - 20, behavior: 'smooth' }); } });
  $('table-wrap').addEventListener('click', (event) => { const button = event.target.closest('.feature-info'); if (button) toggleFeatureNote(button); });
  $('table-wrap').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const button = event.target.closest('.feature-info');
    if (button?.getAttribute('aria-expanded') === 'true') { toggleFeatureNote(button); button.focus(); }
  });
}
async function start() {
  setupTheme();
  renderLegend();
  try {
    const response = await fetch('data/games.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dataset = await response.json();
    if (!Array.isArray(dataset.games)) throw new Error('数据格式无效');
    games = dataset.games;
    renderStoreFilter();
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
