import test from 'node:test';
import assert from 'node:assert/strict';
import { createHapticPattern, hapticPatternLabels } from '../haptics-audio.js';

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

test('unknown patterns are rejected', () => {
  assert.throws(() => createHapticPattern('speaker-buzz'), /Unknown haptic pattern/);
});
