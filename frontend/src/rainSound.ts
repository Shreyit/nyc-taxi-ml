// Rain on a taxi roof and windscreen, heard from inside the cab: a steady hiss, a low roof rumble and
// random droplet taps, all synthesised with the Web Audio API (no audio files). Plus a wiper swish.
import { audioContext } from './engineSound'

let rain: { stop: () => void } | null = null
let pendingUnlock: (() => void) | null = null

// a few seconds of rain, rendered once and looped; two loops of different lengths hide the repeat
function renderRain(ctx: AudioContext, seconds: number, drops: number) {
  const length = Math.ceil(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    // pink-ish hiss (Paul Kellet's filter)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.05
    }
    // droplets: short decaying taps of random size
    for (let d = 0; d < drops; d++) {
      const start = Math.floor(Math.random() * (length - 2000))
      const size = Math.random() ** 2.4
      const decay = 120 + Math.random() * 500
      const tone = 0.2 + Math.random() * 0.6
      let last = 0
      for (let i = 0; i < decay * 4 && start + i < length; i++) {
        last = last * tone + (Math.random() * 2 - 1) * (1 - tone)
        data[start + i] += last * size * 0.9 * Math.exp(-i / decay)
      }
    }
  }
  return buffer
}

function loop(ctx: AudioContext, buffer: AudioBuffer) {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

function begin(ctx: AudioContext, volume: number) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(volume, now + 1.4)
  // heard through glass and metal: soften the top end a little
  const cabin = ctx.createBiquadFilter()
  cabin.type = 'lowpass'
  cabin.frequency.value = 5200
  master.connect(cabin).connect(ctx.destination)

  const hiss = loop(ctx, renderRain(ctx, 5.3, 900))
  const hissHigh = ctx.createBiquadFilter()
  hissHigh.type = 'highpass'
  hissHigh.frequency.value = 350
  hiss.connect(hissHigh).connect(master)

  const taps = loop(ctx, renderRain(ctx, 3.7, 420))
  const tapBand = ctx.createBiquadFilter()
  tapBand.type = 'bandpass'
  tapBand.frequency.value = 2600
  tapBand.Q.value = 0.6
  const tapGain = ctx.createGain()
  tapGain.gain.value = 0.8
  taps.connect(tapBand).connect(tapGain).connect(master)

  const roof = loop(ctx, renderRain(ctx, 4.1, 60))
  const roofLow = ctx.createBiquadFilter()
  roofLow.type = 'lowpass'
  roofLow.frequency.value = 260
  const roofGain = ctx.createGain()
  roofGain.gain.value = 1.6
  roof.connect(roofLow).connect(roofGain).connect(master)

  // slow swells so the rain breathes instead of sounding like static
  const swell = ctx.createOscillator()
  swell.frequency.value = 0.13
  const swellDepth = ctx.createGain()
  swellDepth.gain.value = volume * 0.18
  swell.connect(swellDepth).connect(master.gain)

  const sources = [hiss, taps, roof, swell]
  sources.forEach((source) => source.start(now))
  return {
    stop() {
      const t = ctx.currentTime
      master.gain.cancelScheduledValues(t)
      master.gain.setValueAtTime(master.gain.value, t)
      master.gain.linearRampToValueAtTime(0, t + 0.9)
      sources.forEach((source) => source.stop(t + 1))
      window.setTimeout(() => cabin.disconnect(), 1200)
    },
  }
}

/** Start the rain loop (fades in). If the browser has not allowed audio yet, starts on the next click/key/touch. */
export function startRainSound(volume = 0.32) {
  const ctx = audioContext()
  if (!ctx || rain) return
  const go = () => {
    pendingUnlock = null
    if (!rain) rain = begin(ctx, volume)
  }
  if (ctx.state === 'running') { go(); return }
  void ctx.resume().then(() => { if (ctx.state === 'running' && pendingUnlock) { removeUnlock(); go() } })
  const unlock = () => { removeUnlock(); void ctx.resume().then(go) }
  pendingUnlock = unlock
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  window.addEventListener('touchstart', unlock, { once: true })
}

function removeUnlock() {
  if (!pendingUnlock) return
  window.removeEventListener('pointerdown', pendingUnlock)
  window.removeEventListener('keydown', pendingUnlock)
  window.removeEventListener('touchstart', pendingUnlock)
  pendingUnlock = null
}

/** Stop the rain loop (fades out). */
export function stopRainSound() {
  removeUnlock()
  rain?.stop()
  rain = null
}

/** One wiper pass across wet glass: a short rubbery swish. Call on each stroke while it rains. */
export function playWiperSwish(duration = 0.5, volume = 0.18) {
  const ctx = audioContext()
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  const source = ctx.createBufferSource()
  const length = Math.ceil(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  source.buffer = buffer
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 1.2
  band.frequency.setValueAtTime(700, t)
  band.frequency.linearRampToValueAtTime(1600, t + duration * 0.5)
  band.frequency.linearRampToValueAtTime(800, t + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + duration * 0.25)
  gain.gain.linearRampToValueAtTime(volume * 0.7, t + duration * 0.75)
  gain.gain.linearRampToValueAtTime(0, t + duration)
  source.connect(band).connect(gain).connect(ctx.destination)
  source.start(t)
  source.stop(t + duration + 0.05)
}
