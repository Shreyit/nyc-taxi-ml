import gsap from 'gsap'

// Tandem wipers: both pivots on the cowl, parked flat pointing left, sweeping up together.
const PIVOTS = [520, 930]
const PIVOT_Y = 556
const ARM = 262
const BLADE = [138, 384] // blade span, measured from the pivot along the arm
const SWEEP = 112
const WIPE_R = (BLADE[0] + BLADE[1]) / 2
const WIPE_W = BLADE[1] - BLADE[0]

const wipeArc = (px: number) => {
  const a = (SWEEP * Math.PI) / 180
  const ex = px - WIPE_R * Math.cos(a)
  const ey = PIVOT_Y - WIPE_R * Math.sin(a)
  return `M${px - WIPE_R} ${PIVOT_Y}A${WIPE_R} ${WIPE_R} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`
}

export function Wipers() {
  return (
    <>
      <defs>
        <linearGradient id="wiper-arm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a524b" />
          <stop offset=".4" stopColor="#1d2320" />
          <stop offset="1" stopColor="#0a0d0c" />
        </linearGradient>
        <linearGradient id="wipe-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".1" />
          <stop offset="1" stopColor="#cfe0dc" stopOpacity=".04" />
        </linearGradient>
      </defs>
      <g clipPath="url(#windscreen)">
        {PIVOTS.map((px) => (
          <path key={`w${px}`} className="wipe-trail" d={wipeArc(px)} pathLength={1} fill="none" stroke="url(#wipe-sheen)" strokeWidth={WIPE_W} strokeDasharray="1 1" strokeDashoffset="1" opacity="0" />
        ))}
        {PIVOTS.map((px) => (
          <g key={px} className="wiper" data-pivot={`${px} ${PIVOT_Y}`}>
            <path d={`M${px} ${PIVOT_Y - 5}L${px - ARM} ${PIVOT_Y - 2.4}V${PIVOT_Y + 1.6}L${px} ${PIVOT_Y + 5}Z`} fill="url(#wiper-arm)" stroke="#050706" strokeWidth="1" />
            <path d={`M${px - 14} ${PIVOT_Y - 3.6}L${px - ARM + 6} ${PIVOT_Y - 1.8}`} stroke="#9aa294" strokeOpacity=".35" strokeWidth="1" />
            <rect x={px - 74} y={PIVOT_Y - 6} width="44" height="12" rx="3" fill="#151a17" stroke="#050706" />
            <g className="wiper-blade" data-hinge={`${px - ARM} ${PIVOT_Y}`}>
              <path d={`M${px - BLADE[1]} ${PIVOT_Y + 2}H${px - BLADE[0]}`} stroke="#050706" strokeWidth="3.2" strokeLinecap="round" />
              <path d={`M${px - BLADE[1] + 4} ${PIVOT_Y - 1.2}H${px - BLADE[0] - 4}`} stroke="#1f2622" strokeWidth="4.2" strokeLinecap="round" />
              <path d={`M${px - BLADE[1] + 8} ${PIVOT_Y - 2.4}H${px - BLADE[0] - 8}`} stroke="#8d968a" strokeOpacity=".4" strokeWidth=".9" />
              <rect x={px - ARM - 9} y={PIVOT_Y - 5} width="18" height="8" rx="2" fill="#262d29" stroke="#050706" />
            </g>
          </g>
        ))}
      </g>
      {PIVOTS.map((px) => (
        <g key={`p${px}`}>
          <circle cx={px} cy={PIVOT_Y} r="11" fill="#141916" stroke="#4d554e" strokeWidth="2" />
          <circle cx={px} cy={PIVOT_Y} r="4.5" fill="#2b322d" stroke="#0a0d0c" />
        </g>
      ))}
    </>
  )
}

// One wipe cycle: up, a short dwell at the reversal, back down. The blade trails the arm a few degrees.
// onWipe fires at the start of each cycle while it rains; onStroke fires on every up and down stroke while it rains.
export function createWipers(scope: Element, onWipe: (upstroke: number) => void, onStroke?: (duration: number) => void) {
  let raining = false
  const up = 0.62
  const dwell = 0.09
  const down = 0.66
  const cycle = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 5.5 })
  gsap.utils.toArray<SVGGElement>('.wiper', scope).forEach((wiper, index) => {
    const origin = wiper.dataset.pivot!
    const blade = wiper.querySelector<SVGGElement>('.wiper-blade')!
    const hinge = blade.dataset.hinge!
    const trail = scope.querySelectorAll<SVGPathElement>('.wipe-trail')[index]
    const lag = index * 0.035 // linkage slack: the passenger arm follows a hair later
    cycle.to(wiper, { rotation: SWEEP, svgOrigin: origin, duration: up, ease: 'sine.inOut' }, lag)
      .to(wiper, { rotation: 0, svgOrigin: origin, duration: down, ease: 'sine.inOut' }, lag + up + dwell)
      .to(blade, { rotation: -4, svgOrigin: hinge, duration: up * 0.45, ease: 'power1.out' }, lag)
      .to(blade, { rotation: 3.5, svgOrigin: hinge, duration: 0.3, ease: 'sine.inOut' }, lag + up - 0.12)
      .to(blade, { rotation: 0, svgOrigin: hinge, duration: 0.35, ease: 'back.out(2.4)' }, lag + up + dwell + down - 0.12)
      .fromTo(trail, { strokeDashoffset: 1, opacity: 0.9 }, { strokeDashoffset: 0, duration: up, ease: 'sine.inOut', immediateRender: false }, lag + 0.06)
      .to(trail, { opacity: 0, duration: 1.4, ease: 'power2.in' }, lag + up + dwell)
  })
  cycle.call(() => { onWipe(up); if (raining) onStroke?.(up) }, [], 0)
    .call(() => { if (raining) onStroke?.(down) }, [], up + dwell)
  return {
    play(delay: number) { cycle.delay(delay).play() },
    setRain(rain: boolean) {
      raining = rain
      cycle.repeatDelay(rain ? 1.1 : 5.5)
      if (rain && cycle.isActive() === false) cycle.restart(true)
    },
    kill() { cycle.kill() },
  }
}
