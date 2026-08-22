import { DUALSENSE_PRODUCT_IDS, SONY_VENDOR_ID, applyMotionDeadzone, buildOutputReport, calculateMotionPose, calibrateMotionSensors, detectConnectionType, isMotionStable, parseInputReport, parseMotionCalibration, smoothMotionPose, triggerEffects } from './tester-lib.js';
import { createHapticPattern, hapticPatternLabels } from './haptics-audio.js';

const THEME_KEY = 'dualsense-theme';
const MOTION_CALIBRATION_FRAMES = 48;
const MOTION_TELEMETRY_INTERVAL = 125;
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
let rumbleAnimation = null;
let reportsSinceSample = 0;
let sampleStartedAt = performance.now();
let latestInput = null;
let lastEffect = 'off';
let hapticAudio = null;
let motionNeutral = { roll: 0, pitch: 0, yawRate: 0 };
let motionCalibration = null;
let motionFactoryCalibration = null;
let motionFiltered = null;
let motionTelemetryFiltered = null;
let motionTelemetryUpdatedAt = 0;
const output = { rumbleLeft: 0, rumbleRight: 0, audioHaptics: false, leftTrigger: triggerEffects.off(), rightTrigger: triggerEffects.off() };

function hapticReadyMessage(audio = hapticAudio) {
  return `已就绪 · ${audio?.deviceLabel || '4 声道手柄音频'} · ${audio.context.sampleRate / 1000} kHz · 建议 Windows 音量 50%，网页强度从 40% 开始`;
}

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
  $('calibrate-motion').disabled = !connected || Boolean(motionCalibration);
  document.querySelectorAll('.compat-haptics-controls button, .compat-haptics-controls input, .adaptive-card button, .adaptive-card input, .adaptive-card fieldset').forEach((element) => { element.disabled = !connected; });
  updateHapticAvailability(connected);
}

function canRouteHapticAudio() {
  return Boolean(navigator.mediaDevices?.enumerateDevices && window.AudioContext?.prototype?.setSinkId);
}

function resetHapticOutputPicker() {
  $('haptic-output-picker').hidden = true;
  $('haptic-output-select').replaceChildren();
  $('haptic-output-select').disabled = true;
  $('activate-haptic-audio').disabled = true;
  $('setup-haptic-audio').textContent = '查找音频设备';
}

function updateHapticAvailability(connected = Boolean(device?.opened)) {
  const canRouteAudio = canRouteHapticAudio();
  const usbReady = connected && link === 'usb';
  $('setup-haptic-audio').disabled = !usbReady || !canRouteAudio;
  $('activate-haptic-audio').disabled = !usbReady || $('haptic-output-picker').hidden || !$('haptic-output-select').value;
  $('haptic-intensity').disabled = !hapticAudio;
  document.querySelectorAll('[data-audio-haptic]').forEach((button) => { button.disabled = !hapticAudio; });
  if (hapticAudio) {
    $('haptic-audio-status').textContent = hapticReadyMessage();
    $('haptic-mode-tag').textContent = 'HD READY';
    $('setup-haptic-audio').textContent = '更换音频设备';
  } else if (!connected) {
    resetHapticOutputPicker();
    $('haptic-audio-status').textContent = '连接 USB 手柄后可启用。';
    $('haptic-mode-tag').textContent = 'USB AUDIO';
  } else if (link === 'bluetooth') {
    resetHapticOutputPicker();
    $('haptic-audio-status').textContent = '蓝牙没有触觉音频通道，请改用 USB 数据线；下方兼容震动仍可使用。';
    $('haptic-mode-tag').textContent = 'USB REQUIRED';
  } else if (link === 'unknown') {
    resetHapticOutputPicker();
    $('haptic-audio-status').textContent = '正在识别连接方式…';
    $('haptic-mode-tag').textContent = 'DETECTING';
  } else if (!canRouteAudio) {
    resetHapticOutputPicker();
    $('haptic-audio-status').textContent = '当前浏览器不支持 Web Audio 输出路由，请使用最新版 Chrome 或 Edge。';
    $('haptic-mode-tag').textContent = 'UNAVAILABLE';
  } else {
    $('haptic-audio-status').textContent = '点击“查找音频设备”，再选择 Wireless Controller。';
    $('haptic-mode-tag').textContent = 'USB READY';
  }
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
  motionFactoryCalibration = null;
  try { motionFactoryCalibration = parseMotionCalibration(await device.receiveFeatureReport(0x05)); } catch {}
  const model = device.productId === 0x0df2 ? 'DualSense Edge' : 'DualSense';
  setConnectionState('connected', '已连接', `${model} · ${link === 'usb' ? 'USB 有线' : link === 'bluetooth' ? '蓝牙' : '正在识别连接方式'}`);
  $('link-type').textContent = link === 'usb' ? 'USB' : link === 'bluetooth' ? 'Bluetooth' : 'Detecting';
  beginMotionCalibration(true);
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
    updateHapticAvailability(true);
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

function stopAudioHaptics(immediate = false) {
  if (!hapticAudio?.playing) return;
  const { context, playing } = hapticAudio;
  hapticAudio.playing = null;
  try {
    if (immediate) {
      playing.source.stop();
    } else {
      const now = context.currentTime;
      playing.gain.gain.cancelScheduledValues(now);
      playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
      playing.gain.gain.linearRampToValueAtTime(0, now + 0.045);
      playing.source.stop(now + 0.055);
    }
  } catch {}
  $('haptic-audio-status').textContent = hapticReadyMessage();
}

async function closeHapticAudio() {
  if (!hapticAudio) {
    output.audioHaptics = false;
    return;
  }
  const audio = hapticAudio;
  stopAudioHaptics(true);
  hapticAudio = null;
  output.audioHaptics = false;
  output.rumbleLeft = 0;
  output.rumbleRight = 0;
  await sendOutput();
  try { await audio.context.close(); } catch {}
  updateHapticAvailability(Boolean(device?.opened));
}

function isControllerAudioOutput(outputDevice) {
  return /wireless controller|dualsense/i.test(outputDevice.label);
}

async function enumerateAudioOutputs(requestPermission = false) {
  let permissionStream = null;
  try {
    if (requestPermission) {
      if (!navigator.mediaDevices.getUserMedia) throw new Error('浏览器无法申请音频设备列表权限');
      permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((item) => item.kind === 'audiooutput' && item.deviceId);
  } finally {
    permissionStream?.getTracks().forEach((track) => track.stop());
  }
}

function showAudioOutputPicker(outputDevices) {
  const select = $('haptic-output-select');
  select.replaceChildren();
  const ordered = [...outputDevices].sort((left, right) => Number(isControllerAudioOutput(right)) - Number(isControllerAudioOutput(left)) || left.label.localeCompare(right.label));
  for (const outputDevice of ordered) {
    const label = outputDevice.label || (outputDevice.deviceId === 'default' ? '系统默认音频输出' : '未命名音频输出');
    select.add(new Option(label, outputDevice.deviceId));
  }
  const preferredIndex = ordered.findIndex(isControllerAudioOutput);
  select.selectedIndex = preferredIndex >= 0 ? preferredIndex : 0;
  select.disabled = false;
  $('haptic-output-picker').hidden = false;
  $('activate-haptic-audio').disabled = !select.value;
  $('setup-haptic-audio').disabled = false;
  $('setup-haptic-audio').textContent = '重新查找';
  $('haptic-mode-tag').textContent = 'SELECT OUTPUT';
  $('haptic-audio-status').textContent = preferredIndex >= 0
    ? `已找到 ${ordered.length} 个音频输出，并优先选择 Wireless Controller。确认后启用。`
    : `已找到 ${ordered.length} 个音频输出。请选择 Wireless Controller；如果列表中没有，请确认手柄使用 USB 数据线连接。`;
}

function audioDiscoveryErrorMessage(error) {
  if (error.name === 'NotAllowedError') return '未获得音频设备列表权限。请允许麦克风权限后重试；页面读取列表后会立即停止音频轨道。';
  if (error.name === 'NotFoundError') return '系统没有发现可用的音频设备。请重新插拔 USB 数据线后重试。';
  return `无法读取音频设备：${error.message}`;
}

async function setupHapticAudio() {
  if (!device?.opened || link !== 'usb') return;
  if (!canRouteHapticAudio()) return updateHapticAvailability(true);
  $('setup-haptic-audio').disabled = true;
  $('activate-haptic-audio').disabled = true;
  $('haptic-audio-status').textContent = '正在读取音频输出设备…';
  try {
    if (navigator.mediaDevices.selectAudioOutput) {
      const outputDevice = await navigator.mediaDevices.selectAudioOutput();
      return activateHapticAudio(outputDevice.deviceId, outputDevice.label);
    }
    let outputDevices = await enumerateAudioOutputs(false);
    if (!outputDevices.some(isControllerAudioOutput)) {
      $('haptic-audio-status').textContent = 'Chrome 需要一次麦克风权限来显示完整的音频设备名称；授权后会立即停止音频轨道。';
      outputDevices = await enumerateAudioOutputs(true);
    }
    if (!outputDevices.length) throw new DOMException('没有可用的音频输出设备', 'NotFoundError');
    showAudioOutputPicker(outputDevices);
  } catch (error) {
    $('haptic-output-picker').hidden = true;
    $('haptic-audio-status').textContent = audioDiscoveryErrorMessage(error);
    $('haptic-mode-tag').textContent = 'NOT READY';
    $('setup-haptic-audio').disabled = !(device?.opened && link === 'usb');
    $('activate-haptic-audio').disabled = true;
  }
}

async function activateHapticAudio(deviceId = $('haptic-output-select').value, deviceLabel = $('haptic-output-select').selectedOptions[0]?.textContent) {
  if (!deviceId || !device?.opened || link !== 'usb') return;
  const AudioContextClass = window.AudioContext;
  let context = null;
  $('setup-haptic-audio').disabled = true;
  $('activate-haptic-audio').disabled = true;
  $('haptic-audio-status').textContent = `正在检查 ${deviceLabel || '所选音频设备'} 的声道…`;
  try {
    await closeHapticAudio();
    $('haptic-audio-status').textContent = `正在检查 ${deviceLabel || '所选音频设备'} 的声道…`;
    context = new AudioContextClass({ sampleRate: 48_000, latencyHint: 'interactive' });
    await context.setSinkId(deviceId);
    await context.resume();
    if (context.destination.maxChannelCount < 4) throw new Error('所选设备只提供双声道输出，未检测到 DualSense 的 4 声道触觉端点');
    context.destination.channelCount = 4;
    context.destination.channelCountMode = 'explicit';
    context.destination.channelInterpretation = 'discrete';
    hapticAudio = { context, deviceLabel, playing: null };
    output.rumbleLeft = 0;
    output.rumbleRight = 0;
    output.audioHaptics = true;
    await sendOutput();
    context = null;
    $('haptic-output-picker').hidden = true;
    updateHapticAvailability(true);
  } catch (error) {
    try { await context?.close(); } catch {}
    hapticAudio = null;
    $('haptic-audio-status').textContent = `未启用：${error.message}。请选择 Wireless Controller 的 4 声道输出后重试。`;
    $('haptic-mode-tag').textContent = 'NOT READY';
    $('setup-haptic-audio').disabled = false;
    $('activate-haptic-audio').disabled = !$('haptic-output-select').value;
  }
}

async function playAudioHaptic(name) {
  if (!hapticAudio) return;
  if (name === 'stop') return stopAudioHaptics();
  stopAudioHaptics(true);
  const { context } = hapticAudio;
  if (context.state === 'suspended') await context.resume();
  output.rumbleLeft = 0;
  output.rumbleRight = 0;
  output.audioHaptics = true;
  await sendOutput();
  const intensity = Number($('haptic-intensity').value) / 100;
  const pattern = createHapticPattern(name, { sampleRate: context.sampleRate, intensity });
  const buffer = context.createBuffer(2, pattern.left.length, pattern.sampleRate);
  buffer.copyToChannel(pattern.left, 0);
  buffer.copyToChannel(pattern.right, 1);

  const source = context.createBufferSource();
  const gain = context.createGain();
  const splitter = context.createChannelSplitter(2);
  const merger = context.createChannelMerger(4);
  source.buffer = buffer;
  gain.gain.value = 1;
  source.connect(gain).connect(splitter);
  splitter.connect(merger, 0, 2);
  splitter.connect(merger, 1, 3);
  merger.connect(context.destination);
  const playing = { source, gain, splitter, merger };
  hapticAudio.playing = playing;
  source.onended = () => {
    try { source.disconnect(); gain.disconnect(); splitter.disconnect(); merger.disconnect(); } catch {}
    if (hapticAudio?.playing === playing) {
      hapticAudio.playing = null;
      $('haptic-audio-status').textContent = hapticReadyMessage();
    }
  };
  $('haptic-audio-status').textContent = `正在播放：${hapticPatternLabels[name]} · ${$('haptic-intensity').value}%`;
  source.start(context.currentTime + 0.05);
}

function clearPatternTimers() {
  for (const timer of patternTimers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  patternTimers = [];
  if (rumbleAnimation !== null) cancelAnimationFrame(rumbleAnimation);
  rumbleAnimation = null;
}

function setRumble(left, right) {
  output.rumbleLeft = left;
  output.rumbleRight = right;
  output.audioHaptics = Boolean(hapticAudio && left === 0 && right === 0);
  $('rumble-left').value = left;
  $('rumble-right').value = right;
  $('rumble-left-value').textContent = left;
  $('rumble-right-value').textContent = right;
}

function playRumblePattern(name) {
  clearPatternTimers();
  if (name === 'stop') return setRumble(0, 0);
  const patterns = {
    tap: [[0, 0, 0], [75, 12, 20], [190, 0, 0]],
    double: [[0, 0, 0], [65, 13, 22], [135, 0, 0], [215, 9, 16], [325, 0, 0]],
    texture: [[0, 0, 0], [120, 5, 9], [260, 9, 13], [410, 4, 8], [570, 11, 15], [740, 6, 10], [910, 12, 17], [1080, 5, 9], [1260, 8, 12], [1440, 0, 0]]
  };
  const frames = patterns[name];
  if (!frames) return;
  const startedAt = performance.now();
  const animate = (now) => {
    const elapsed = now - startedAt;
    let index = 1;
    while (index < frames.length && elapsed > frames[index][0]) index += 1;
    if (index >= frames.length) {
      setRumble(0, 0);
      rumbleAnimation = null;
      return;
    }
    const previous = frames[index - 1];
    const next = frames[index];
    const progress = clamp((elapsed - previous[0]) / Math.max(1, next[0] - previous[0]), 0, 1);
    const eased = 0.5 - Math.cos(Math.PI * progress) / 2;
    setRumble(Math.round(previous[1] + (next[1] - previous[1]) * eased), Math.round(previous[2] + (next[2] - previous[2]) * eased));
    rumbleAnimation = requestAnimationFrame(animate);
  };
  rumbleAnimation = requestAnimationFrame(animate);
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
  stopAudioHaptics(true);
  setRumble(0, 0);
  output.audioHaptics = false;
  output.leftTrigger = triggerEffects.off();
  output.rightTrigger = triggerEffects.off();
  lastEffect = 'off';
  $('adaptive-state').textContent = '已关闭';
}

async function disconnect(close = true) {
  resetOutputs();
  await sendOutput();
  await closeHapticAudio();
  if (outputTimer) clearInterval(outputTimer);
  outputTimer = null;
  if (device) {
    device.oninputreport = null;
    if (close && device.opened) try { await device.close(); } catch {}
  }
  device = null;
  link = 'unknown';
  latestInput = null;
  motionNeutral = { roll: 0, pitch: 0, yawRate: 0 };
  motionCalibration = null;
  motionFactoryCalibration = null;
  motionFiltered = null;
  motionTelemetryFiltered = null;
  motionTelemetryUpdatedAt = 0;
  $('motion-calibration-status').textContent = '连接后请静置，自动校准';
  renderMotionPose();
  setConnectionState('idle', '尚未连接', '推荐使用 Chrome 或 Edge。首次连接时请选择“Wireless Controller”。');
  $('link-type').textContent = '—';
}

function placeStick(id, stick, pressed) {
  const dot = $(id);
  dot.style.transform = `translate(calc(-50% + ${clamp(stick.x, -1, 1) * 52}px), calc(-50% + ${clamp(stick.y, -1, 1) * 52}px))`;
  dot.classList.toggle('is-pressed', pressed);
}

function beginMotionCalibration(automatic = false) {
  if (!device?.opened) return;
  motionCalibration = { roll: 0, pitch: 0, yawRate: 0, frames: 0, automatic };
  motionFiltered = null;
  $('calibrate-motion').disabled = true;
  $('motion-calibration-status').textContent = automatic ? '正常握持并静置，正在自动校准…' : '保持正常握持并静置，正在校准…';
}

function renderMotionPose(accelerometer = [0, 0, 0], gyro = [0, 0, 0]) {
  const rawPose = calculateMotionPose(accelerometer, gyro);
  if (motionCalibration) {
    if (!isMotionStable(gyro, accelerometer)) {
      motionCalibration.roll = 0;
      motionCalibration.pitch = 0;
      motionCalibration.yawRate = 0;
      motionCalibration.frames = 0;
      $('motion-calibration-status').textContent = '检测到移动，请正常握持并保持静止…';
    } else {
      $('motion-calibration-status').textContent = motionCalibration.automatic ? '正常握持并静置，正在自动校准…' : '保持正常握持并静置，正在校准…';
      motionCalibration.roll += rawPose.roll;
      motionCalibration.pitch += rawPose.pitch;
      motionCalibration.yawRate += rawPose.yawRate;
      motionCalibration.frames += 1;
      if (motionCalibration.frames >= MOTION_CALIBRATION_FRAMES) {
        motionNeutral = {
          roll: motionCalibration.roll / motionCalibration.frames,
          pitch: motionCalibration.pitch / motionCalibration.frames,
          yawRate: motionCalibration.yawRate / motionCalibration.frames
        };
        motionCalibration = null;
        motionFiltered = null;
        $('calibrate-motion').disabled = !device?.opened;
        $('motion-calibration-status').textContent = '已归零 · 稳定滤波已开启';
      }
    }
  }
  const calibrating = Boolean(motionCalibration);
  const centeredPose = calibrating ? { roll: 0, pitch: 0, yawRate: 0 } : {
    roll: clamp(rawPose.roll - motionNeutral.roll, -60, 60),
    pitch: clamp(rawPose.pitch - motionNeutral.pitch, -50, 50),
    yawRate: clamp(rawPose.yawRate - motionNeutral.yawRate, -32, 32)
  };
  motionFiltered = smoothMotionPose(motionFiltered, centeredPose);
  const { roll, pitch, yawRate } = applyMotionDeadzone(motionFiltered);
  const yawOffset = -yawRate / 32 * 58;
  // The player-facing top view mirrors sensor pitch depth and screen-space roll.
  $('motion-controller').style.transform = `rotateX(${-pitch}deg) rotateZ(${-roll}deg)`;
  $('motion-horizon-plane').style.transform = `translateY(${pitch * 0.52}px) rotate(${roll}deg)`;
  $('motion-yaw-indicator').style.transform = `translateX(calc(-50% + ${yawOffset}px))`;
  $('motion-roll-value').textContent = `${Math.round(roll)}°`;
  $('motion-pitch-value').textContent = `${Math.round(pitch)}°`;
  $('motion-yaw-value').textContent = `${yawRate >= 0 ? '+' : ''}${Math.round(yawRate)}`;
}

function renderMotionTelemetry(gyro, accelerometer) {
  const next = { gyro: [...gyro], accelerometer: [...accelerometer] };
  if (!motionTelemetryFiltered) {
    motionTelemetryFiltered = next;
  } else {
    for (const key of ['gyro', 'accelerometer']) {
      motionTelemetryFiltered[key] = next[key].map((value, index) => motionTelemetryFiltered[key][index] + (value - motionTelemetryFiltered[key][index]) * 0.08);
    }
  }
  const now = performance.now();
  if (now - motionTelemetryUpdatedAt < MOTION_TELEMETRY_INTERVAL) return;
  motionTelemetryUpdatedAt = now;
  const gyroValues = motionTelemetryFiltered.gyro.map((value) => {
    const degreesPerSecond = value / 1024;
    return Math.abs(degreesPerSecond) < 1 ? 0 : degreesPerSecond;
  });
  const accelerationValues = motionTelemetryFiltered.accelerometer.map((value) => {
    const gravity = value / 8192;
    return Math.abs(gravity) < 0.01 ? 0 : gravity;
  });
  $('gyro-value').textContent = gyroValues.map((value) => value.toFixed(1)).join(' / ');
  $('accelerometer-value').textContent = accelerationValues.map((value) => value.toFixed(2)).join(' / ');
}

function renderInput() {
  if (latestInput) {
    const { sticks, triggers, buttons, gyro, accelerometer, touch, battery } = latestInput;
    const motion = calibrateMotionSensors(gyro, accelerometer, motionFactoryCalibration);
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
    renderMotionTelemetry(motion.gyro, motion.accelerometer);
    $('touch-one-value').textContent = touch[0].active ? `${touch[0].x}, ${touch[0].y}` : '未触摸';
    $('touch-two-value').textContent = touch[1].active ? `${touch[1].x}, ${touch[1].y}` : '未触摸';
    $('battery-value').textContent = `${battery.level}%${battery.full ? ' · 已充满' : battery.charging ? ' · 充电中' : ''}`;
    renderMotionPose(motion.accelerometer, motion.gyro);
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
  $('calibrate-motion').addEventListener('click', () => beginMotionCalibration());
  $('setup-haptic-audio').addEventListener('click', setupHapticAudio);
  $('activate-haptic-audio').addEventListener('click', () => activateHapticAudio());
  $('haptic-output-select').addEventListener('change', () => { $('activate-haptic-audio').disabled = !$('haptic-output-select').value; });
  $('haptic-intensity').addEventListener('input', () => { $('haptic-intensity-value').textContent = `${$('haptic-intensity').value}%`; });
  document.querySelectorAll('[data-audio-haptic]').forEach((button) => button.addEventListener('click', () => playAudioHaptic(button.dataset.audioHaptic)));
  for (const side of ['left', 'right']) {
    const input = $(`rumble-${side}`);
    input.addEventListener('input', () => {
      clearPatternTimers();
      output[`rumble${side[0].toUpperCase()}${side.slice(1)}`] = Number(input.value);
      output.audioHaptics = Boolean(hapticAudio && output.rumbleLeft === 0 && output.rumbleRight === 0);
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
