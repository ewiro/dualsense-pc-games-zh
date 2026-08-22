import test from 'node:test';
import assert from 'node:assert/strict';
import { createHapticPattern, hapticPatternLabels } from '../haptics-audio.js';

function measurePattern(pattern) {
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  for (const channel of [pattern.left, pattern.right]) {
    for (const sample of channel) {
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
      sampleCount += 1;
    }
  }
  return { peak, rms: Math.sqrt(sumSquares / sampleCount) };
}

for (const name of Object.keys(hapticPatternLabels)) {
  test(`${name} produces safe stereo haptic samples`, () => {
    const pattern = createHapticPattern(name, { intensity: 0.4, seed: 42 });
    assert.equal(pattern.sampleRate, 48_000);
    assert.equal(pattern.left.length, pattern.right.length);
    assert.ok(pattern.left.length > 48_000);
    assert.equal(pattern.left[0], 0);
    assert.equal(pattern.right[0], 0);
    assert.equal(pattern.left.at(-1), 0);
    assert.equal(pattern.right.at(-1), 0);
    let peak = 0;
    let stereoDifference = 0;
    for (let index = 0; index < pattern.left.length; index += 1) {
      assert.ok(Number.isFinite(pattern.left[index]));
      assert.ok(Number.isFinite(pattern.right[index]));
      peak = Math.max(peak, Math.abs(pattern.left[index]), Math.abs(pattern.right[index]));
      stereoDifference += Math.abs(pattern.left[index] - pattern.right[index]);
    }
    assert.ok(peak > 0.001);
    assert.ok(peak <= pattern.peakLimit + 1e-6);
    assert.ok(stereoDifference > 0.1);
  });
}

test('patterns are deterministic for the same seed', () => {
  const first = createHapticPattern('rain', { intensity: 0.3, seed: 7 });
  const second = createHapticPattern('rain', { intensity: 0.3, seed: 7 });
  assert.deepEqual(first.left, second.left);
  assert.deepEqual(first.right, second.right);
});

test('enhanced calibration stays perceptible and below its peak ceiling', () => {
  const calibrationPoints = [
    { intensity: 0.4, minimumPeak: 0.08, minimumRms: 0.018 },
    { intensity: 0.65, minimumPeak: 0.13, minimumRms: 0.03 },
    { intensity: 1, minimumPeak: 0.2, minimumRms: 0.045 }
  ];
  for (const name of Object.keys(hapticPatternLabels)) {
    let previousRms = 0;
    for (const point of calibrationPoints) {
      const pattern = createHapticPattern(name, { intensity: point.intensity, seed: 42 });
      const { peak, rms } = measurePattern(pattern);
      assert.ok(peak >= point.minimumPeak, `${name} peak ${peak} is too low at ${point.intensity}`);
      assert.ok(rms >= point.minimumRms, `${name} RMS ${rms} is too low at ${point.intensity}`);
      assert.ok(peak <= pattern.peakLimit + 1e-6, `${name} exceeds its peak ceiling at ${point.intensity}`);
      assert.ok(rms > previousRms, `${name} RMS should rise with intensity`);
      previousRms = rms;
    }
  }
});

test('unknown patterns are rejected', () => {
  assert.throws(() => createHapticPattern('speaker-buzz'), /Unknown haptic pattern/);
});
