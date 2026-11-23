import gsap from 'gsap'
import './hero.css'

// Windscreen opening in the dashboard SVG's 1600×900 viewBox.
const TOP = 170
const BOTTOM = 560
const edgesAt = (y: number) => {
  const t = (y - TOP) / (BOTTOM - TOP)
  return [330 - 90 * t, 1270 + 90 * t] as const
}

// Seeded so the drop layout is identical on every render.
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const DROPS = (() => {
  const random = rng(7)
  return Array.from({ length: 64 }, () => {
    const y = TOP + 14 + random() * (BOTTOM - TOP - 40)
    const [left, right] = edgesAt(y)
    const x = left + 12 + random() * (right - left - 24)
    return { x: Math.round(x), y: Math.round(y), r: +(2.4 + random() * 4.2).toFixed(1) }
  }).sort((a, b) => a.x - b.x)
})()

const ONCOMING = [0, 1, 2]
const AHEAD = [0, 1]

// Things seen through the glass: a hanging signal, its tint on the windscreen, and passing car lights.
export function StreetLife() {
  return (
    <g className="street-life" clipPath="url(#windscreen)">
      <defs>
        <filter id="trail-blur" x="-80%" y="-200%" width="260%" height="500%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id="lamp-glow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect className="signal-tint" x="200" y={TOP} width="1200" height={BOTTOM - TOP} fill="#e5533f" opacity="0" />
      <g className="trails" filter="url(#trail-blur)">
        {ONCOMING.map((index) => (
          <g key={`o${index}`} className="trail oncoming" opacity="0">
            <ellipse cx="-14" cy="0" rx="9" ry="4" fill="#fff4d2" />
            <ellipse cx="14" cy="0" rx="9" ry="4" fill="#fff4d2" />
            <ellipse cx="0" cy="2" rx="46" ry="7" fill="#ffd98a" opacity=".35" />
          </g>
        ))}
        {AHEAD.map((index) => (
          <g key={`a${index}`} className="trail ahead" opacity="0">
            <ellipse cx="-20" cy="0" rx="7" ry="3.5" fill="#ff4b37" />
            <ellipse cx="20" cy="0" rx="7" ry="3.5" fill="#ff4b37" />
          </g>
        ))}
      </g>
      <path d="M330 194Q600 206 900 199T1270 192" fill="none" stroke="#0b0f0d" strokeOpacity=".75" strokeWidth="1.5" />
      <g className="signal" transform="translate(376 196)">
        <path d="M38 6V-2" stroke="#0b0f0d" strokeWidth="3" />
        <rect width="78" height="28" rx="6" fill="#141a17" stroke="#2c332e" strokeWidth="2" />
        {[0, 1, 2].map((index) => (
          <g key={index}>
            <circle cx={15 + index * 24} cy="14" r="8" fill={['#3a1712', '#3a2c10', '#11301f'][index]} />
            <circle className={`lamp lamp-${['red', 'amber', 'green'][index]}`} cx={15 + index * 24} cy="14" r="7.5" fill={['#ff5a3c', '#ffb238', '#4be08c'][index]} filter="url(#lamp-glow)" opacity="0" />
          </g>
        ))}
      </g>
    </g>
  )
}

export function RainGlass() {
  return (
    <g className="rain-glass" clipPath="url(#windscreen)" aria-hidden="true">
      <defs>
        <radialGradient id="drop" cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#fff" stopOpacity=".85" />
          <stop offset=".45" stopColor="#dfe9e6" stopOpacity=".25" />
          <stop offset="1" stopColor="#0b100e" stopOpacity=".4" />
        </radialGradient>
      </defs>
      {DROPS.map(({ x, y, r }) => (
        <circle key={`${x}-${y}`} className="drop" cx={x} cy={y} r={r} fill="url(#drop)" stroke="#e9f2ef" strokeOpacity=".45" strokeWidth=".8" opacity="0" />
      ))}
    </g>
  )
}

// Signal cycle and car lights. Lights move faster on green and crawl on red.
export function animateStreet(scope: Element) {
  const q = gsap.utils.selector(scope)
  const traffic = gsap.timeline()
  const lane = (element: Element, from: [number, number], to: [number, number], scale: [number, number], duration: number, ease: string, delay: number) => {
    const run = gsap.timeline({ repeat: -1, repeatDelay: 1.6 + delay, delay })
    run.fromTo(element, { x: from[0], y: from[1], scale: scale[0] }, { x: to[0], y: to[1], scale: scale[1], duration, ease }, 0)
      .fromTo(element, { opacity: 0 }, { opacity: 0.8, duration: duration * 0.35, ease: 'power1.out' }, 0)
      .to(element, { opacity: 0, duration: duration * 0.25, ease: 'power1.in' }, duration * 0.75)
    traffic.add(run, 0)
  }
  q('.trail.oncoming').forEach((light, index) => lane(light, [748, 392], [250 - index * 40, 600], [0.12, 1.9], 3.4, 'power3.in', index * 2.3))
  q('.trail.ahead').forEach((light, index) => lane(light, [1180 + index * 60, 590], [858, 400], [1.6, 0.14], 4.6, 'power3.out', 1.2 + index * 3.1))

  const lamp = (color: string) => q(`.lamp-${color}`)
  const tint = q('.signal-tint')
  const phase = (color: string, tintColor: string, speed: number) => (signal: gsap.core.Timeline, at: number) => signal
    .to(q('.lamp'), { opacity: 0, duration: 0.18 }, at)
    .to(lamp(color), { opacity: 1, duration: 0.25 }, at + 0.1)
    .to(tint, { attr: { fill: tintColor }, opacity: 0.05, duration: 0.6 }, at)
    .to(traffic, { timeScale: speed, duration: 1.2, ease: 'power1.inOut' }, at)
  const signal = gsap.timeline({ repeat: -1 })
  phase('red', '#e5533f', 0.35)(signal, 0)
  phase('green', '#4be08c', 1.25)(signal, 4.2)
  phase('amber', '#ffb238', 0.8)(signal, 9.6)
  signal.to({}, { duration: 1.3 }, 9.6)

  return () => {
    signal.kill()
    traffic.kill()
  }
}

// Drops bead up on the glass, a few run down, and each wiper pass clears them.
export function createRain(scope: Element) {
  const drops = gsap.utils.toArray<SVGCircleElement>('.drop', scope)
  const runs = drops.map((drop) => {
    const run = gsap.timeline({ paused: true, repeat: -1, repeatRefresh: true, delay: gsap.utils.random(0, 2.4) })
    run.fromTo(drop, { scale: 0, opacity: 0, y: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 0.95, duration: 0.3, ease: 'back.out(2)' })
      .to(drop, { y: () => (Math.random() < 0.35 ? gsap.utils.random(30, 120) : 0), duration: () => gsap.utils.random(1.4, 3), ease: 'power1.in' }, '+=0.6')
      .to(drop, { opacity: 0, duration: 0.4 }, '-=0.4')
    return run
  })
  let on = false
  return {
    set(next: boolean, still: boolean) {
      on = next
      scope.classList.toggle('raining', next)
      if (still) {
        gsap.set(drops, { opacity: next ? 0.85 : 0, scale: 1 })
        return
      }
      runs.forEach((run) => (next ? run.restart(true) : run.pause()))
      if (!next) gsap.to(drops, { opacity: 0, duration: 0.5, overwrite: true })
    },
    wipe(sweepDuration: number) {
      if (!on) return
      drops.forEach((drop, index) => {
        runs[index].pause()
        gsap.to(drop, {
          opacity: 0, y: 0, duration: 0.12, overwrite: true,
          delay: (index / drops.length) * sweepDuration,
          onComplete: () => { if (on) runs[index].delay(gsap.utils.random(0.3, 2.2)).restart(true) },
        })
      })
    },
    kill() {
      runs.forEach((run) => run.kill())
      gsap.killTweensOf(drops)
    },
  }
}
