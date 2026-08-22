export const SONY_VENDOR_ID = 0x054c;
export const DUALSENSE_PRODUCT_IDS = [0x0ce6, 0x0df2];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const crcTable = (() => {
  const table = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(prefix, view) {
  let crc = 0xffffffff;
  for (const byte of prefix) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  for (let index = 0; index < view.byteLength; index += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ view.getUint8(index)) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function fillBluetoothChecksum(reportId, data) {
  const crc = crc32([0xa2, reportId], new DataView(data.buffer, data.byteOffset, data.byteLength - 4));
  const offset = data.byteLength - 4;
  data[offset] = crc & 0xff;
  data[offset + 1] = (crc >>> 8) & 0xff;
  data[offset + 2] = (crc >>> 16) & 0xff;
  data[offset + 3] = (crc >>> 24) & 0xff;
}

export const triggerEffects = {
  off() {
    return Array(11).fill(0);
  },
  resistance(position, strength) {
    const start = clamp(Math.round(position), 0, 9);
    const force = clamp(Math.round(strength), 1, 8) - 1;
    let activeZones = 0;
    let forceZones = 0;
    for (let zone = start; zone < 10; zone += 1) {
      activeZones |= 1 << zone;
      forceZones |= force << (3 * zone);
    }
    return [0x21, activeZones & 0xff, (activeZones >> 8) & 0xff, forceZones & 0xff, (forceZones >> 8) & 0xff, (forceZones >> 16) & 0xff, (forceZones >> 24) & 0xff, 0, 0, 0, 0];
  },
  weapon(position, strength) {
    const start = clamp(Math.round(position), 2, 7);
    const end = clamp(start + 2, start + 1, 8);
    const zones = (1 << start) | (1 << end);
    return [0x25, zones & 0xff, (zones >> 8) & 0xff, clamp(Math.round(strength), 1, 8) - 1, 0, 0, 0, 0, 0, 0, 0];
  },
  vibration(position, strength) {
    const start = clamp(Math.round(position), 0, 9);
    const amplitude = clamp(Math.round(strength), 1, 8) - 1;
    let activeZones = 0;
    let amplitudeZones = 0;
    for (let zone = start; zone < 10; zone += 1) {
      activeZones |= 1 << zone;
      amplitudeZones |= amplitude << (3 * zone);
    }
    return [0x26, activeZones & 0xff, (activeZones >> 8) & 0xff, amplitudeZones & 0xff, (amplitudeZones >> 8) & 0xff, (amplitudeZones >> 16) & 0xff, (amplitudeZones >> 24) & 0xff, 0, 0, 20, 0];
  },
  bow(position, strength) {
    const start = clamp(Math.round(position), 0, 7);
    const end = clamp(start + 4, start + 1, 8);
    const zones = (1 << start) | (1 << end);
    const force = (clamp(Math.round(strength), 1, 8) - 1) | (7 << 3);
    return [0x22, zones & 0xff, (zones >> 8) & 0xff, force, 0, 0, 0, 0, 0, 0, 0];
  }
};

export function detectConnectionType(collections = []) {
  for (const collection of collections) {
    if (collection.usagePage !== 0x01 || collection.usage !== 0x05) continue;
    const bits = (collection.inputReports || []).reduce((maximum, report) => {
      const reportBits = (report.items || []).reduce((sum, item) => sum + item.reportSize * item.reportCount, 0);
      return Math.max(maximum, reportBits);
    }, 0);
    if (bits === 504) return 'usb';
    if (bits === 616) return 'bluetooth';
  }
  return 'unknown';
}

export function buildOutputReport({ link, sequence = 1, rumbleLeft = 0, rumbleRight = 0, audioHaptics = false, leftTrigger = triggerEffects.off(), rightTrigger = triggerEffects.off() }) {
  if (!['usb', 'bluetooth'].includes(link)) throw new Error('未知的 DualSense 连接方式');
  const bluetooth = link === 'bluetooth';
  const reportId = bluetooth ? 0x31 : 0x02;
  const data = new Uint8Array(bluetooth ? 77 : 47);
  const commonOffset = bluetooth ? 2 : 0;
  if (bluetooth) {
    data[0] = (sequence & 0x0f) << 4;
    data[1] = 0x10;
  }
  // Bit 1 selects classic motor haptics. Sending bit 0 without bit 1 lets the
  // classic motors terminate and hands the voice coils back to PCM haptics.
  // Bits 2 and 3 keep the right and left adaptive-trigger effects writable.
  data[commonOffset] = audioHaptics ? 0x0d : 0x0f;
  data[commonOffset + 2] = clamp(Math.round(rumbleRight), 0, 255);
  data[commonOffset + 3] = clamp(Math.round(rumbleLeft), 0, 255);
  data.set(rightTrigger.slice(0, 11), commonOffset + 10);
  data.set(leftTrigger.slice(0, 11), commonOffset + 21);
  if (bluetooth) fillBluetoothChecksum(reportId, data);
  return { reportId, data };
}

function signed16(low, high) {
  const value = (high << 8) | low;
  return value > 0x7fff ? value - 0x10000 : value;
}

function decodeButtons(byte0, byte1, byte2) {
  const direction = byte0 & 0x0f;
  return {
    up: [0, 1, 7].includes(direction),
    right: [1, 2, 3].includes(direction),
    down: [3, 4, 5].includes(direction),
    left: [5, 6, 7].includes(direction),
    square: Boolean(byte0 & 0x10), cross: Boolean(byte0 & 0x20), circle: Boolean(byte0 & 0x40), triangle: Boolean(byte0 & 0x80),
    l1: Boolean(byte1 & 0x01), r1: Boolean(byte1 & 0x02), l2: Boolean(byte1 & 0x04), r2: Boolean(byte1 & 0x08),
    create: Boolean(byte1 & 0x10), options: Boolean(byte1 & 0x20), l3: Boolean(byte1 & 0x40), r3: Boolean(byte1 & 0x80),
    ps: Boolean(byte2 & 0x01), touchpad: Boolean(byte2 & 0x02), mute: Boolean(byte2 & 0x04),
    fnLeft: Boolean(byte2 & 0x10), fnRight: Boolean(byte2 & 0x20), paddleLeft: Boolean(byte2 & 0x40), paddleRight: Boolean(byte2 & 0x80)
  };
}

function parseTouchPoint(view, offset) {
  const contact = view.getUint8(offset);
  const xLow = view.getUint8(offset + 1);
  const packed = view.getUint8(offset + 2);
  const yHigh = view.getUint8(offset + 3);
  return {
    active: !(contact & 0x80),
    id: contact & 0x7f,
    x: ((packed & 0x0f) << 8) | xLow,
    y: (yHigh << 4) | ((packed & 0xf0) >> 4)
  };
}

export function parseInputReport(reportId, source) {
  const view = source instanceof DataView ? source : new DataView(source.buffer, source.byteOffset, source.byteLength);
  let offset;
  let link;
  if (reportId === 0x31 && view.byteLength >= 77) {
    offset = 1;
    link = 'bluetooth';
  } else if (reportId === 0x01 && view.byteLength >= 63) {
    offset = 0;
    link = 'usb';
  } else {
    return null;
  }
  const status0 = view.getUint8(offset + 52);
  const status1 = view.getUint8(offset + 53);
  return {
    link,
    sticks: {
      left: { x: (view.getUint8(offset) - 127.5) / 127.5, y: (view.getUint8(offset + 1) - 127.5) / 127.5 },
      right: { x: (view.getUint8(offset + 2) - 127.5) / 127.5, y: (view.getUint8(offset + 3) - 127.5) / 127.5 }
    },
    triggers: { left: view.getUint8(offset + 4) / 255, right: view.getUint8(offset + 5) / 255 },
    buttons: decodeButtons(view.getUint8(offset + 7), view.getUint8(offset + 8), view.getUint8(offset + 9)),
    gyro: [15, 17, 19].map((index) => signed16(view.getUint8(offset + index), view.getUint8(offset + index + 1))),
    accelerometer: [21, 23, 25].map((index) => signed16(view.getUint8(offset + index), view.getUint8(offset + index + 1))),
    touch: [parseTouchPoint(view, offset + 32), parseTouchPoint(view, offset + 36)],
    battery: { level: Math.min(100, Math.round((status0 & 0x0f) * 100 / 8)), charging: Boolean(status1 & 0x08), full: Boolean(status0 & 0x20) }
  };
}
