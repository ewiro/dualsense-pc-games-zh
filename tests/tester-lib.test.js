import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMotionDeadzone, buildOutputReport, calculateMotionPose, calibrateMotionSensors, detectConnectionType, isMotionStable, parseInputReport, parseMotionCalibration, smoothMotionPose, triggerEffects } from '../tester-lib.js';

test('calculates a bounded controller pose from motion sensors', () => {
  assert.deepEqual(calculateMotionPose([0, 8192, 0], [0, 0, 0]), { roll: 0, pitch: 0, yawRate: 0 });
  assert.deepEqual(calculateMotionPose([8192, 8192, 0], [0, 0, 0]), { roll: 45, pitch: 0, yawRate: 0 });
  assert.deepEqual(calculateMotionPose([0, 8192, -8192], [0, 0, 0]), { roll: 0, pitch: 45, yawRate: 0 });
  assert.deepEqual(calculateMotionPose([0, 8192, 8192], [0, 16384, 0]), { roll: 0, pitch: -45, yawRate: 16 });
  assert.deepEqual(calculateMotionPose([999999, 1, 0], [0, 999999, 0]), { roll: 60, pitch: 0, yawRate: 32 });
});

test('parses and applies the DualSense factory motion calibration', () => {
  const bytes = new Uint8Array(35);
  bytes[0] = 0x05;
  const write = (offset, value) => new DataView(bytes.buffer).setInt16(offset + 1, value, true);
  [10, -5, 3].forEach((value, index) => write(index * 2, value));
  [16000, 16000, 16000].forEach((value, index) => write(6 + index * 2, value));
  [-16000, -16000, -16000].forEach((value, index) => write(12 + index * 2, value));
  write(18, 1000);
  write(20, 1000);
  [8192, 8192, 8192].forEach((value, index) => write(22 + index * 2, value));
  [-8192, -8192, -8192].forEach((value, index) => write(28 + index * 2, value));

  const calibration = parseMotionCalibration(bytes);
  assert.deepEqual(calibration.gyro.map(({ sensitivity }) => sensitivity), [64, 64, 64]);
  assert.deepEqual(calibration.accelerometer.map(({ sensitivity }) => sensitivity), [1, 1, 1]);
  assert.deepEqual(calibrateMotionSensors([26, 11, 19], [8192, 0, -8192], calibration), {
    gyro: [1024, 1024, 1024],
    accelerometer: [8192, 0, -8192]
  });
  assert.equal(parseMotionCalibration(new Uint8Array(12)), null);
});

test('smooths motion, suppresses desk noise and requires a stable calibration pose', () => {
  assert.deepEqual(smoothMotionPose({ roll: 0, pitch: 0, yawRate: 0 }, { roll: 10, pitch: -20, yawRate: 5 }, 0.1), { roll: 1, pitch: -2, yawRate: 0.5 });
  assert.deepEqual(applyMotionDeadzone({ roll: 1, pitch: -1.2, yawRate: 1.4 }), { roll: 0, pitch: 0, yawRate: 0 });
  assert.deepEqual(applyMotionDeadzone({ roll: 3.25, pitch: -2.25, yawRate: 3.5 }), { roll: 2, pitch: -1, yawRate: 2 });
  assert.equal(isMotionStable([100, -120, 80], [0, 8192, 0]), true);
  assert.equal(isMotionStable([0, 5120, 0], [0, 8192, 0]), false);
  assert.equal(isMotionStable([0, 0, 0], [0, 1000, 0]), false);
});

test('detects DualSense USB and Bluetooth report layouts', () => {
  const collection = (reportSize, reportCount) => [{ usagePage: 1, usage: 5, inputReports: [{ items: [{ reportSize, reportCount }] }] }];
  assert.equal(detectConnectionType(collection(8, 63)), 'usb');
  assert.equal(detectConnectionType(collection(8, 77)), 'bluetooth');
  assert.equal(detectConnectionType([]), 'unknown');
});

test('builds USB and checksummed Bluetooth output reports', () => {
  const effect = triggerEffects.weapon(3, 7);
  const usb = buildOutputReport({ link: 'usb', rumbleLeft: 80, rumbleRight: 120, leftTrigger: effect });
  assert.equal(usb.reportId, 0x02);
  assert.equal(usb.data.length, 47);
  assert.equal(usb.data[0], 0x0f);
  assert.equal(usb.data[2], 120);
  assert.equal(usb.data[3], 80);
  assert.deepEqual([...usb.data.slice(21, 32)], effect);

  const bluetooth = buildOutputReport({ link: 'bluetooth', sequence: 5, rightTrigger: effect });
  assert.equal(bluetooth.reportId, 0x31);
  assert.equal(bluetooth.data.length, 77);
  assert.equal(bluetooth.data[0], 0x50);
  assert.equal(bluetooth.data[1], 0x10);
  assert.notDeepEqual([...bluetooth.data.slice(-4)], [0, 0, 0, 0]);
  assert.deepEqual([...bluetooth.data.slice(12, 23)], effect);

  const usbAudioHaptics = buildOutputReport({ link: 'usb', audioHaptics: true });
  assert.equal(usbAudioHaptics.data[0], 0x0d);
  assert.equal(usbAudioHaptics.data[2], 0);
  assert.equal(usbAudioHaptics.data[3], 0);

  const bluetoothAudioHaptics = buildOutputReport({ link: 'bluetooth', audioHaptics: true });
  assert.equal(bluetoothAudioHaptics.data[2], 0x0d);
  assert.notDeepEqual([...bluetoothAudioHaptics.data.slice(-4)], [0, 0, 0, 0]);
});

test('parses a complete USB input report', () => {
  const bytes = new Uint8Array(63);
  bytes.set([0, 128, 255, 64, 128, 255], 0);
  bytes[7] = 0x21;
  bytes[8] = 0x41;
  bytes[9] = 0x05;
  bytes[32] = 0x01;
  bytes[33] = 0x34;
  bytes[34] = 0x21;
  bytes[35] = 0x12;
  bytes[36] = 0x80;
  bytes[52] = 0x08;
  bytes[53] = 0x08;
  const parsed = parseInputReport(0x01, bytes);
  assert.equal(parsed.link, 'usb');
  assert.equal(parsed.triggers.right, 1);
  assert.equal(parsed.buttons.up, true);
  assert.equal(parsed.buttons.cross, true);
  assert.equal(parsed.buttons.l1, true);
  assert.equal(parsed.buttons.l3, true);
  assert.equal(parsed.buttons.ps, true);
  assert.equal(parsed.buttons.mute, true);
  assert.deepEqual(parsed.touch[0], { active: true, id: 1, x: 0x134, y: 0x122 });
  assert.equal(parsed.touch[1].active, false);
  assert.equal(parsed.battery.level, 100);
  assert.equal(parsed.battery.charging, true);
});

test('rejects short and unrelated input reports', () => {
  assert.equal(parseInputReport(0x01, new Uint8Array(9)), null);
  assert.equal(parseInputReport(0x02, new Uint8Array(63)), null);
});
