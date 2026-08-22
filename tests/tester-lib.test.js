import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutputReport, detectConnectionType, parseInputReport, triggerEffects } from '../tester-lib.js';

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
