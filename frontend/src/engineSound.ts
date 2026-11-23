// A synthesised NYC cab start: starter whine, V8 catch with a rev, an idle burble and a quick double honk.
// Built with the Web Audio API, so there is no audio file to ship or license.

let context: AudioContext | null = null
let lastStart = -10

export function audioContext() {
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtor) return null
  context ??= new AudioCtor()
  return context
}

function noise(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  source.buffer = buffer
  return source
}

function softClip(amount: number) {
  const curve = new Float32Array(2048)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / curve.length) * 2 - 1
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount)
  }
  return curve
}

// V8 firing pulses: strong low harmonics with an uneven "burble" pattern
function engineWave(ctx: AudioContext) {
  const harmonics = [0, 1, 0.85, 0.35, 0.6, 0.22, 0.38, 0.12, 0.2, 0.08, 0.1]
  const real = new Float32Array(harmonics.length)
  return ctx.createPeriodicWave(real, Float32Array.from(harmonics))
}

function schedule(ctx: AudioContext, volume: number) {
  const t = ctx.currentTime + 0.05
  const crank = 0.85
  const caught = t + crank
  const end = caught + 3.4

  const master = ctx.createGain()
  master.gain.value = volume
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)

  // 1. starter motor: chopped mid noise plus a rising electric whine
  const starter = noise(ctx, crank + 0.2)
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 420
  band.Q.value = 1.6
  const chopped = ctx.createGain()
  chopped.gain.value = 0
  const chop = ctx.createOscillator()
  chop.type = 'square'
  chop.frequency.setValueAtTime(7, t)
  chop.frequency.linearRampToValueAtTime(12, caught)
  const chopDepth = ctx.createGain()
  chopDepth.gain.value = 0.3
  chop.connect(chopDepth).connect(chopped.gain)
  const whine = ctx.createOscillator()
  whine.type = 'triangle'
  whine.frequency.setValueAtTime(140, t)
  whine.frequency.linearRampToValueAtTime(230, caught)
  const whineGain = ctx.createGain()
  whineGain.gain.value = 0.06
  const starterEnv = ctx.createGain()
  starterEnv.gain.setValueAtTime(0, t)
  starterEnv.gain.linearRampToValueAtTime(0.85, t + 0.05)
  starterEnv.gain.setValueAtTime(0.85, caught - 0.06)
  starterEnv.gain.linearRampToValueAtTime(0, caught + 0.06)
  starter.connect(band).connect(chopped).connect(starterEnv)
  whine.connect(whineGain).connect(starterEnv)
  starterEnv.connect(master)

  // 2. V8: firing-pulse oscillator + sub, through soft clipping and a low-pass, rev then idle burble
  const engine = ctx.createOscillator()
  engine.setPeriodicWave(engineWave(ctx))
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  const rpm = (at: number, hz: number, how: 'set' | 'exp') => {
    for (const [osc, ratio] of [[engine, 1], [sub, 0.5]] as const) {
      if (how === 'set') osc.frequency.setValueAtTime(hz * ratio, at)
      else osc.frequency.exponentialRampToValueAtTime(hz * ratio, at)
    }
  }
  rpm(caught - 0.04, 30, 'set')
  rpm(caught + 0.3, 112, 'exp')
  rpm(caught + 0.75, 70, 'exp')
  rpm(caught + 1.5, 46, 'exp')
  const lope = ctx.createOscillator()
  lope.frequency.value = 2.6
  const lopeDepth = ctx.createGain()
  lopeDepth.gain.value = 1.8
  lope.connect(lopeDepth)
  lopeDepth.connect(engine.frequency)

  const clip = ctx.createWaveShaper()
  clip.curve = softClip(3.2)
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.Q.value = 1.1
  lowpass.frequency.setValueAtTime(320, caught)
  lowpass.frequency.linearRampToValueAtTime(1400, caught + 0.3)
  lowpass.frequency.exponentialRampToValueAtTime(420, caught + 1.5)
  const engineGain = ctx.createGain()
  engineGain.gain.setValueAtTime(0, caught - 0.04)
  engineGain.gain.linearRampToValueAtTime(0.9, caught + 0.08)
  engineGain.gain.setValueAtTime(0.9, caught + 0.6)
  engineGain.gain.linearRampToValueAtTime(0.5, caught + 1.5)
  engineGain.gain.exponentialRampToValueAtTime(0.001, end)
  const subGain = ctx.createGain()
  subGain.gain.value = 0.55
  engine.connect(clip)
  sub.connect(subGain).connect(clip)
  clip.connect(lowpass).connect(engineGain).connect(master)

  // exhaust rumble
  const exhaust = noise(ctx, end - caught + 0.2)
  const exhaustLow = ctx.createBiquadFilter()
  exhaustLow.type = 'lowpass'
  exhaustLow.frequency.value = 160
  const exhaustGain = ctx.createGain()
  exhaustGain.gain.setValueAtTime(0, caught)
  exhaustGain.gain.linearRampToValueAtTime(0.35, caught + 0.15)
  exhaustGain.gain.exponentialRampToValueAtTime(0.001, end)
  exhaust.connect(exhaustLow).connect(exhaustGain).connect(master)

  // 3. the classic double honk once the cab is running
  const hornAt = caught + 1.7
  const hornEnv = ctx.createGain()
  hornEnv.gain.setValueAtTime(0, hornAt)
  for (const [start, length] of [[0, 0.13], [0.22, 0.3]]) {
    hornEnv.gain.setValueAtTime(0, hornAt + start)
    hornEnv.gain.linearRampToValueAtTime(0.32, hornAt + start + 0.015)
    hornEnv.gain.setValueAtTime(0.32, hornAt + start + length - 0.03)
    hornEnv.gain.linearRampToValueAtTime(0, hornAt + start + length)
  }
  const hornBand = ctx.createBiquadFilter()
  hornBand.type = 'bandpass'
  hornBand.frequency.value = 950
  hornBand.Q.value = 0.9
  const hornClip = ctx.createWaveShaper()
  hornClip.curve = softClip(2)
  const horns = [415, 523].map((hz) => {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = hz
    osc.connect(hornClip)
    return osc
  })
  hornClip.connect(hornBand).connect(hornEnv).connect(master)

  starter.start(t)
  chop.start(t)
  whine.start(t)
  for (const node of [engine, sub]) node.start(caught - 0.04)
  lope.start(caught)
  exhaust.start(caught)
  horns.forEach((osc) => osc.start(hornAt))
  ;[starter, chop, whine, engine, sub, lope, exhaust, ...horns].forEach((node) => node.stop(end + 0.1))
  window.setTimeout(() => master.disconnect(), (end - ctx.currentTime + 0.4) * 1000)
}

// Plays now if the browser allows audio, otherwise on the first click / key press / touch.
// onStart receives the delay (s) until the engine catches, to sync the rev needle.
export function playTaxiStart(onStart?: (catchDelay: number) => void, volume = 0.5) {
  const ctx = audioContext()
  if (!ctx) return () => {}
  let done = false
  const go = () => {
    if (done) return
    done = true
    remove()
    // never stack two starts on top of each other (e.g. React StrictMode running effects twice)
    if (ctx.currentTime - lastStart < 4) return
    lastStart = ctx.currentTime
    schedule(ctx, volume)
    onStart?.(0.9)
  }
  const unlock = () => { void ctx.resume().then(go) }
  const remove = () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }
  if (ctx.state === 'running') {
    go()
  } else {
    void ctx.resume().then(() => { if (ctx.state === 'running') go() })
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
  }
  return remove
}
