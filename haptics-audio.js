const DEFAULT_SAMPLE_RATE = 48_000;
const CALIBRATION_GAIN = 27;
const SOFT_LIMIT_KNEE = 0.8;
const SOFT_LIMIT_WIDTH = 0.3;
const SAFE_PEAK = 0.95;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function randomGenerator(seed) {
  let state = seed >>> 0 || 0x5f3759df;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function addBurst(target, sampleRate, start, duration, frequency, amplitude, phase = 0) {
  const startIndex = Math.max(0, Math.floor(start * sampleRate));
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const endIndex = Math.min(target.length, startIndex + length);
  for (let index = startIndex; index < endIndex; index += 1) {
    const progress = (index - startIndex) / Math.max(1, length - 1);
    const envelope = Math.sin(Math.PI * progress) ** 2;
    const time = (index - startIndex) / sampleRate;
    target[index] += Math.sin(2 * Math.PI * frequency * time + phase) * envelope * amplitude;
  }
}

function applyGlobalEnvelope(channels, sampleRate) {
  const fadeSamples = Math.max(1, Math.floor(sampleRate * 0.025));
  let peak = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const fadeIn = smoothstep(index / fadeSamples);
      const fadeOut = smoothstep((channel.length - 1 - index) / fadeSamples);
      channel[index] *= Math.min(fadeIn, fadeOut) * CALIBRATION_GAIN;
      peak = Math.max(peak, Math.abs(channel[index]));
    }
  }
  const limitedPeak = peak > SOFT_LIMIT_KNEE
    ? SOFT_LIMIT_KNEE + (SAFE_PEAK - SOFT_LIMIT_KNEE) * (1 - Math.exp(-(peak - SOFT_LIMIT_KNEE) / SOFT_LIMIT_WIDTH))
    : peak;
  const scale = peak > 0 ? limitedPeak / peak : 1;
  if (scale < 1) {
    for (const channel of channels) {
      for (let index = 0; index < channel.length; index += 1) channel[index] *= scale;
    }
  }
  for (const channel of channels) {
    channel[0] = 0;
    channel[channel.length - 1] = 0;
  }
}

export const hapticPatternLabels = Object.freeze({
  rain: '细雨',
  gravel: '砂石路面',
  footsteps: '交替脚步',
  engine: '引擎渐升'
});

export function createHapticPattern(name, options = {}) {
  const sampleRate = clamp(Math.round(options.sampleRate || DEFAULT_SAMPLE_RATE), 8_000, 96_000);
  const intensity = clamp(Number(options.intensity ?? 0.32), 0, 1);
  const random = randomGenerator(Number(options.seed ?? 0x4453));
  const durations = { rain: 2.2, gravel: 1.9, footsteps: 2.25, engine: 2.4 };
  const duration = durations[name];
  if (!duration) throw new RangeError(`Unknown haptic pattern: ${name}`);

  const length = Math.ceil(duration * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  if (name === 'rain') {
    for (let drop = 0; drop < 38; drop += 1) {
      const start = 0.05 + random() * (duration - 0.14);
      const burstDuration = 0.022 + random() * 0.042;
      const frequency = 105 + random() * 95;
      const amplitude = intensity * (0.014 + random() * 0.022);
      const primary = random() < 0.5 ? left : right;
      const secondary = primary === left ? right : left;
      addBurst(primary, sampleRate, start, burstDuration, frequency, amplitude);
      addBurst(secondary, sampleRate, start + 0.004, burstDuration * 0.78, frequency * 1.04, amplitude * 0.32, Math.PI / 5);
    }
  } else if (name === 'gravel') {
    let noiseLeft = 0;
    let noiseRight = 0;
    for (let index = 0; index < length; index += 1) {
      const time = index / sampleRate;
      const movement = 0.7 + 0.3 * Math.sin(2 * Math.PI * 2.7 * time);
      noiseLeft = noiseLeft * 0.975 + (random() * 2 - 1) * 0.025;
      noiseRight = noiseRight * 0.975 + (random() * 2 - 1) * 0.025;
      left[index] = intensity * movement * (0.021 * Math.sin(2 * Math.PI * 128 * time) + noiseLeft * 0.075);
      right[index] = intensity * movement * (0.02 * Math.sin(2 * Math.PI * 151 * time + 0.65) + noiseRight * 0.075);
    }
  } else if (name === 'footsteps') {
    [0.18, 0.66, 1.15, 1.64].forEach((start, step) => {
      const primary = step % 2 === 0 ? left : right;
      const secondary = step % 2 === 0 ? right : left;
      addBurst(primary, sampleRate, start, 0.145, 82, intensity * 0.052);
      addBurst(primary, sampleRate, start + 0.012, 0.085, 142, intensity * 0.027, Math.PI / 4);
      addBurst(secondary, sampleRate, start + 0.018, 0.11, 103, intensity * 0.012);
    });
  } else if (name === 'engine') {
    let phaseLeft = 0;
    let phaseRight = 0.45;
    for (let index = 0; index < length; index += 1) {
      const progress = index / Math.max(1, length - 1);
      const frequency = 78 + smoothstep(progress) * 76 + Math.sin(progress * Math.PI * 6) * 2.5;
      phaseLeft += 2 * Math.PI * frequency / sampleRate;
      phaseRight += 2 * Math.PI * (frequency * 1.018) / sampleRate;
      const flutter = 0.82 + 0.18 * Math.sin(2 * Math.PI * 7.5 * index / sampleRate);
      left[index] = intensity * flutter * (0.031 * Math.sin(phaseLeft) + 0.009 * Math.sin(phaseLeft * 2));
      right[index] = intensity * flutter * (0.029 * Math.sin(phaseRight) + 0.008 * Math.sin(phaseRight * 2));
    }
  }

  applyGlobalEnvelope([left, right], sampleRate);
  return { left, right, sampleRate, duration, peakLimit: SAFE_PEAK };
}
