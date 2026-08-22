import { DUALSENSE_PRODUCT_IDS, SONY_VENDOR_ID, buildOutputReport, detectConnectionType, parseInputReport, triggerEffects } from './tester-lib.js';

const THEME_KEY = 'dualsense-theme';
const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const buttonLabels = {
  up: '↑', right: '→', down: '↓', left: '←', square: '□', triangle: '△', circle: '○', cross: '×',
  l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', create: 'Create', options: 'Options', l3: 'L3', r3: 'R3',
  ps: 'PS', touchpad: '触控板', mute: '静音', fnLeft: 'Fn-L', fnRight: 'Fn-R', paddleLeft: '背键 L', paddleRight: '背键 R'
};

let device = null;
let link = 'unknown';
let sequence = 1;
let outputTimer = null;
let outputSending = false;
let patternTimers = [];
let reportsSinceSample = 0;
let sampleStartedAt = performance.now();
let latestInput = null;
let lastEffect = 'off';
const output = { rumbleLeft: 0, rumbleRight: 0, leftTrigger: triggerEffects.off(), rightTrigger: triggerEffects.off() };

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
  $('theme-toggle').setAttribute('aria-label', dark ? '切换到白天模式' : '切换到黑夜模式');
  $('theme-label').textContent = dark ? '白天模式' : '黑夜模式';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#08121f' : '#ffffff';
}

function setupTheme() {
  applyTheme(document.documentElement.dataset.theme);
  $('theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  });
}

function setupButtonGrid() {
  $('button-grid').innerHTML = Object.entries(buttonLabels).map(([key, label]) => `<span class="input-chip" data-input="${key}">${label}</span>`).join('');
}

function showMessage(message = '') {
  const element = $('compatibility-message');
  element.textContent = message;
  element.hidden = !message;
}

function setConnectionState(state, status, details) {
  $('connection-dot').className = `connection-dot${state === 'connected' ? ' is-connected' : state === 'error' ? ' is-error' : ''}`;
  $('connection-status').textContent = status;
  if (details) $('device-details').textContent = details;
  const connected = state === 'connected';
  $('connect-button').disabled = connected || state === 'busy';
  $('disconnect-button').disabled = !connected;
  document.querySelectorAll('.output-card button, .output-card input, .adaptive-card button, .adaptive-card input, .adaptive-card fieldset').forEach((element) => { element.disabled = !connected; });
}

async function requestConnection() {
  if (!navigator.hid) return;
  setConnectionState('busy', '等待选择手柄…');
  showMessage();
  try {
    const devices = await navigator.hid.requestDevice({ filters: DUALSENSE_PRODUCT_IDS.map((productId) => ({ vendorId: SONY_VENDOR_ID, productId })) });
    if (!devices.length) return setConnectionState('idle', '尚未连接');
    await openDevice(devices[0]);
  } catch (error) {
    setConnectionState('error', '连接失败');
    showMessage(`无法连接手柄：${error.message}。请关闭可能占用手柄的程序后重试。`);
  }
}

async function openDevice(candidate) {
  device = candidate;
  if (!device.opened) await device.open();
  link = detectConnectionType(device.collections);
  device.oninputreport = handleInputReport;
  try { await device.receiveFeatureReport(0x05); } catch {}
  const model = device.productId === 0x0df2 ? 'DualSense Edge' : 'DualSense';
  setConnectionState('connected', '已连接', `${model} · ${link === 'usb' ? 'USB 有线' : link === 'bluetooth' ? '蓝牙' : '正在识别连接方式'}`);
  $('link-type').textContent = link === 'usb' ? 'USB' : link === 'bluetooth' ? 'Bluetooth' : 'Detecting';
  startOutputLoop();
}

async function autoReconnect() {
  if (!navigator.hid) {
    setConnectionState('error', '当前浏览器不支持 WebHID', '请使用桌面版 Chrome 或 Edge 打开此页面。');
    showMessage('当前浏览器不支持 WebHID，无法发送 DualSense 自适应扳机和触觉反馈指令。');
    return;
  }
  navigator.hid.addEventListener('disconnect', (event) => { if (device === event.device) disconnect(false); });
  try {
    const devices = await navigator.hid.getDevices();
    const granted = devices.find((item) => item.vendorId === SONY_VENDOR_ID && DUALSENSE_PRODUCT_IDS.includes(item.productId));
    if (granted) await openDevice(granted);
  } catch (error) {
    showMessage(`自动重连失败：${error.message}`);
  }
}

function handleInputReport(event) {
  const parsed = parseInputReport(event.reportId, event.data);
  if (!parsed) return;
  latestInput = parsed;
  reportsSinceSample += 1;
  if (link === 'unknown') {
    link = parsed.link;
    $('link-type').textContent = link === 'usb' ? 'USB' : 'Bluetooth';
  }
}

async function sendOutput() {
  if (!device?.opened || outputSending || link === 'unknown') return;
  outputSending = true;
  try {
    const report = buildOutputReport({ link, sequence, ...output });
    sequence = sequence === 15 ? 0 : sequence + 1;
    await device.sendReport(report.reportId, report.data);
  } catch (error) {
    if (device?.opened) showMessage(`反馈指令发送失败：${error.message}`);
  } finally {
    outputSending = false;
  }
}

function startOutputLoop() {
  if (outputTimer) clearInterval(outputTimer);
  outputTimer = setInterval(sendOutput, 32);
  sendOutput();
}

function clearPatternTimers() {
  for (const timer of patternTimers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  patternTimers = [];
}

function setRumble(left, right) {
  output.rumbleLeft = left;
  output.rumbleRight = right;
  $('rumble-left').value = left;
  $('rumble-right').value = right;
  $('rumble-left-value').textContent = left;
  $('rumble-right-value').textContent = right;
}

function playRumblePattern(name) {
  clearPatternTimers();
  if (name === 'stop') return setRumble(0, 0);
  if (name === 'pulse') {
    setRumble(90, 145);
    patternTimers.push(setTimeout(() => setRumble(0, 0), 280));
  } else if (name === 'heartbeat') {
    const beat = () => {
      setRumble(125, 85);
      patternTimers.push(setTimeout(() => setRumble(0, 0), 100));
      patternTimers.push(setTimeout(() => setRumble(90, 65), 180));
      patternTimers.push(setTimeout(() => setRumble(0, 0), 300));
    };
    beat();
    patternTimers.push(setInterval(beat, 900));
  } else if (name === 'texture') {
    let step = 0;
    patternTimers.push(setInterval(() => {
      step += 1;
      setRumble(30 + (step % 4) * 18, 55 + (step % 3) * 28);
      if (step >= 24) { clearPatternTimers(); setRumble(0, 0); }
    }, 70));
  }
}

function selectedSide() {
  return document.querySelector('input[name="trigger-side"]:checked')?.value || 'both';
}

function applyTriggerEffect(name) {
  const side = selectedSide();
  const position = Number($('trigger-position').value);
  const strength = Number($('trigger-strength').value);
  const effect = triggerEffects[name]?.(position, strength) || triggerEffects.off();
  if (name === 'off') {
    output.leftTrigger = triggerEffects.off();
    output.rightTrigger = triggerEffects.off();
  } else {
    output.leftTrigger = side === 'left' || side === 'both' ? effect : triggerEffects.off();
    output.rightTrigger = side === 'right' || side === 'both' ? effect : triggerEffects.off();
  }
  lastEffect = name;
  const labels = { off: '已关闭', resistance: '持续阻力', weapon: '武器段落', vibration: '扳机震动', bow: '弓弦手感' };
  $('adaptive-state').textContent = labels[name] || name;
  sendOutput();
}

function resetOutputs() {
  clearPatternTimers();
  setRumble(0, 0);
  output.leftTrigger = triggerEffects.off();
  output.rightTrigger = triggerEffects.off();
  lastEffect = 'off';
  $('adaptive-state').textContent = '已关闭';
}

async function disconnect(close = true) {
  resetOutputs();
  await sendOutput();
  if (outputTimer) clearInterval(outputTimer);
  outputTimer = null;
  if (device) {
    device.oninputreport = null;
    if (close && device.opened) try { await device.close(); } catch {}
  }
  device = null;
  link = 'unknown';
  latestInput = null;
  setConnectionState('idle', '尚未连接', '推荐使用 Chrome 或 Edge。首次连接时请选择“Wireless Controller”。');
  $('link-type').textContent = '—';
}

function placeStick(id, stick, pressed) {
  const dot = $(id);
  dot.style.transform = `translate(calc(-50% + ${clamp(stick.x, -1, 1) * 52}px), calc(-50% + ${clamp(stick.y, -1, 1) * 52}px))`;
  dot.classList.toggle('is-pressed', pressed);
}

function renderInput() {
  if (latestInput) {
    const { sticks, triggers, buttons, gyro, accelerometer, touch, battery } = latestInput;
    const leftPercent = Math.round(triggers.left * 100);
    const rightPercent = Math.round(triggers.right * 100);
    $('left-trigger-meter').style.width = `${leftPercent}%`;
    $('right-trigger-meter').style.width = `${rightPercent}%`;
    $('left-trigger-value').textContent = `${leftPercent}%`;
    $('right-trigger-value').textContent = `${rightPercent}%`;
    placeStick('left-stick-dot', sticks.left, buttons.l3);
    placeStick('right-stick-dot', sticks.right, buttons.r3);
    $('left-stick-value').textContent = `${sticks.left.x.toFixed(2)}, ${sticks.left.y.toFixed(2)}`;
    $('right-stick-value').textContent = `${sticks.right.x.toFixed(2)}, ${sticks.right.y.toFixed(2)}`;
    document.querySelectorAll('[data-input]').forEach((chip) => chip.classList.toggle('is-active', Boolean(buttons[chip.dataset.input])));
    $('gyro-value').textContent = gyro.map((value) => Math.round(value / 1024)).join(' / ');
    $('accelerometer-value').textContent = accelerometer.map((value) => (value / 8192).toFixed(2)).join(' / ');
    $('touch-one-value').textContent = touch[0].active ? `${touch[0].x}, ${touch[0].y}` : '未触摸';
    $('touch-two-value').textContent = touch[1].active ? `${touch[1].x}, ${touch[1].y}` : '未触摸';
    $('battery-value').textContent = `${battery.level}%${battery.full ? ' · 已充满' : battery.charging ? ' · 充电中' : ''}`;
    const roll = Math.atan2(accelerometer[1], accelerometer[2]) * 180 / Math.PI;
    const pitch = Math.atan2(-accelerometer[0], Math.hypot(accelerometer[1], accelerometer[2])) * 180 / Math.PI;
    $('motion-core').style.transform = `scaleY(1.54) rotateX(${clamp(pitch, -45, 45)}deg) rotateZ(${clamp(roll, -45, 45)}deg)`;
  }
  const now = performance.now();
  if (now - sampleStartedAt >= 750) {
    $('report-rate').textContent = `${Math.round(reportsSinceSample / ((now - sampleStartedAt) / 1000))} Hz`;
    reportsSinceSample = 0;
    sampleStartedAt = now;
  }
  requestAnimationFrame(renderInput);
}

function setupControls() {
  $('connect-button').addEventListener('click', requestConnection);
  $('disconnect-button').addEventListener('click', () => disconnect());
  for (const side of ['left', 'right']) {
    const input = $(`rumble-${side}`);
    input.addEventListener('input', () => {
      clearPatternTimers();
      output[`rumble${side[0].toUpperCase()}${side.slice(1)}`] = Number(input.value);
      $(`rumble-${side}-value`).textContent = input.value;
    });
  }
  document.querySelectorAll('[data-rumble]').forEach((button) => button.addEventListener('click', () => playRumblePattern(button.dataset.rumble)));
  document.querySelectorAll('[data-trigger-effect]').forEach((button) => button.addEventListener('click', () => applyTriggerEffect(button.dataset.triggerEffect)));
  for (const id of ['trigger-position', 'trigger-strength']) {
    $(id).addEventListener('input', () => {
      $(`${id}-value`).textContent = $(id).value;
      if (lastEffect !== 'off') applyTriggerEffect(lastEffect);
    });
  }
  document.querySelectorAll('input[name="trigger-side"]').forEach((radio) => radio.addEventListener('change', () => { if (lastEffect !== 'off') applyTriggerEffect(lastEffect); }));
  window.addEventListener('pagehide', () => { resetOutputs(); sendOutput(); });
}

setupTheme();
setupButtonGrid();
setupControls();
setConnectionState('idle', '尚未连接');
autoReconnect();
requestAnimationFrame(renderInput);
