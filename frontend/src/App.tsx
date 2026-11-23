import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'
import { getZones } from './api'
import { gsap, reducedMotion, revealOnScroll, ScrollTrigger, scrollToTop, startSmoothScroll } from './motion'
import type { Page, Zone } from './types'
import EstimatorPage from './EstimatorPage'
import MethodologyPage from './MethodologyPage'
import { playTaxiStart } from './engineSound'
import { playWiperSwish, startRainSound, stopRainSound } from './rainSound'
import { createRadio, type Radio, type RadioState } from './radio'
import { animateStreet, createRain, createWipers, RadioButtons, RadioDisplay, RainGlass, SplitText, StreetLife, Wipers } from './hero'

const pageIds: Page[] = ['home', 'model', 'docs']

function routeFromHash(): Page {
  const hash = window.location.hash.slice(1)
  return pageIds.includes(hash as Page) ? (hash as Page) : 'home'
}

function Loader({ active }: { active: boolean }) {
  return (
    <div id="ld" className={active ? '' : 'off'} aria-live="polite" aria-label="Loading page">
      <svg viewBox="0 0 300 150" aria-hidden="true">
        <defs>
          <linearGradient id="ld-paint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd45c" />
            <stop offset=".55" stopColor="#f7b21b" />
            <stop offset="1" stopColor="#cf8d0c" />
          </linearGradient>
          <linearGradient id="ld-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c9ecff" />
            <stop offset="1" stopColor="#5d93b3" />
          </linearGradient>
          <linearGradient id="ld-sign" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffbe8" />
            <stop offset="1" stopColor="#f3e4b0" />
          </linearGradient>
          <radialGradient id="ld-rim">
            <stop offset="0" stopColor="#f4f6f7" />
            <stop offset=".7" stopColor="#a9b1b6" />
            <stop offset="1" stopColor="#6b7378" />
          </radialGradient>
          <radialGradient id="ld-beam" cx="0" cy=".5" r="1">
            <stop offset="0" stopColor="#fff6cf" stopOpacity=".9" />
            <stop offset="1" stopColor="#fff6cf" stopOpacity="0" />
          </radialGradient>
          <pattern id="ld-check" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#f6f1e2" />
            <rect width="3" height="3" fill="#0B1020" />
            <rect x="3" y="3" width="3" height="3" fill="#0B1020" />
          </pattern>
        </defs>
        <ellipse cx="152" cy="135" rx="128" ry="4" fill="#0B1020" opacity=".22" />
        <g className="bob">
          {/* roof sign with top face, stand and glow */}
          <path d="M122 58V50M168 58V50" stroke="#0B1020" strokeWidth="3" />
          <path d="M109 30L114 25H176L181 30Z" fill="#fff8de" stroke="#0B1020" strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="105" y="30" width="80" height="21" rx="3" fill="url(#ld-sign)" stroke="#0B1020" strokeWidth="3" />
          <text x="145" y="45" fontFamily="sans-serif" fontWeight="800" fontSize="12" textAnchor="middle" fill="#0B1020">NEW YORK</text>
          <path d="M97 60L90 40" stroke="#0B1020" strokeWidth="1.6" strokeLinecap="round" />
          {/* body */}
          <path d="M20 106Q18 90 40 85L70 82Q80 66 96 60L178 58Q192 58 202 66L226 82Q262 84 279 93Q286 99 285 108V112Q285 116 280 116H24Q19 116 20 110Z" fill="url(#ld-paint)" stroke="#0B1020" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M38 89Q150 84 266 89" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
          <path d="M24 108H281" stroke="#a86f06" strokeOpacity=".55" strokeWidth="5" />
          {/* windows, pillars and reflections */}
          <path d="M84 82L99 65Q102 62 108 62H139V82Z" fill="url(#ld-glass)" stroke="#0B1020" strokeWidth="3" strokeLinejoin="round" />
          <path d="M146 62H180Q187 62 193 67L211 82H146Z" fill="url(#ld-glass)" stroke="#0B1020" strokeWidth="3" strokeLinejoin="round" />
          <path d="M104 80L116 64H124L112 80ZM162 80L172 64H178L168 80Z" fill="#fff" opacity=".45" />
          {/* checker stripe */}
          <path d="M30 94H276V100H30Z" fill="url(#ld-check)" stroke="#0B1020" strokeWidth="1" />
          {/* doors, handles, mirror, lettering */}
          <path d="M92 84V112M142 84V112M196 84Q200 98 198 112" stroke="#0B1020" strokeOpacity=".55" strokeWidth="1.6" fill="none" />
          <rect x="116" y="87" width="12" height="3.5" rx="1.75" fill="#3d3a33" />
          <rect x="168" y="87" width="12" height="3.5" rx="1.75" fill="#3d3a33" />
          <path d="M210 77H221Q225 77 225 81Q225 85 221 85H213Z" fill="#2b2f36" stroke="#0B1020" strokeWidth="1.5" />
          <text x="170" y="109" fontFamily="sans-serif" fontWeight="800" fontSize="9" textAnchor="middle" fill="#0B1020">TAXI</text>
          <text x="118" y="109" fontFamily="monospace" fontWeight="700" fontSize="6" textAnchor="middle" fill="#0B1020" opacity=".7">7J42</text>
          {/* lights and bumpers */}
          <ellipse cx="300" cy="99" rx="22" ry="8" fill="url(#ld-beam)" />
          <path d="M276 95H283Q285 95 285 98V101H276Z" fill="#fff7d1" stroke="#0B1020" strokeWidth="1.5" />
          <rect x="16" y="90" width="7" height="12" rx="2" fill="#E5322D" stroke="#0B1020" strokeWidth="1.5" />
          <rect x="274" y="106" width="14" height="9" rx="3" fill="#4b4f57" stroke="#0B1020" strokeWidth="2" />
          <rect x="13" y="106" width="14" height="9" rx="3" fill="#4b4f57" stroke="#0B1020" strokeWidth="2" />
          {/* wheel arches */}
          <path d="M48 116A22 22 0 0 1 92 116ZM206 116A22 22 0 0 1 250 116Z" fill="#1b1d22" />
        </g>
        <g stroke="#0B1020" strokeWidth="3">
          {[70, 228].map((x) => (
            <g className="wh" key={x}>
              <circle cx={x} cy="118" r="17" fill="#1c1e22" />
              <circle cx={x} cy="118" r="14.5" fill="none" stroke="#33363c" strokeWidth="2" strokeDasharray="3 2.2" />
              <circle cx={x} cy="118" r="9.5" fill="url(#ld-rim)" strokeWidth="1.5" />
              <path d={`M${x} 109.5V126.5M${x - 8} 115L${x + 8} 121M${x - 8} 121L${x + 8} 115`} stroke="#5d656b" strokeWidth="1.5" />
              <circle cx={x} cy="118" r="2.6" fill="#0B1020" strokeWidth="0" />
            </g>
          ))}
        </g>
        <path d="M0 138H300" stroke="#0B1020" strokeWidth="4" />
        <path className="rd" d="M0 146H300" stroke="#0B1020" strokeWidth="4" strokeDasharray="26 14" />
      </svg>
      <p>Loading</p>
    </div>
  )
}

const NAV_ITEMS: [Page, string][] = [['home', 'Overview'], ['model', 'Estimator'], ['docs', 'Methodology']]

function TaxiMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9.5" y="2.6" width="5" height="2.3" rx=".7" fill="currentColor" />
      <path d="M5.2 11.2 6.9 7.1A2.2 2.2 0 0 1 9 5.7h6a2.2 2.2 0 0 1 2.1 1.4l1.7 4.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="3" y="11" width="18" height="6.4" rx="2" fill="currentColor" />
      <path d="M6 14.2h1.8M16.2 14.2H18" stroke="#d9b45a" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="7.4" cy="18.4" r="1.7" fill="currentColor" />
      <circle cx="16.6" cy="18.4" r="1.7" fill="currentColor" />
    </svg>
  )
}

function Navigation({ page }: { page: Page }) {
  const navRef = useRef<HTMLElement>(null)
  const linksRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const hoverRef = useRef<HTMLSpanElement>(null)
  const progressRef = useRef<HTMLSpanElement>(null)
  const [scrolled, setScrolled] = useState(false)

  // entrance: the bar drops in, then brand and links follow
  useLayoutEffect(() => {
    if (reducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.from(navRef.current, { y: -32, autoAlpha: 0, duration: 1, ease: 'expo.out', delay: 0.2 })
      gsap.from('.brand, .nav-links a, .nav-cta', { y: -12, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07, delay: 0.35 })
    }, navRef)
    return () => ctx.revert()
  }, [])

  // the gold pill slides to the active page
  useLayoutEffect(() => {
    const links = linksRef.current
    const pill = pillRef.current
    if (!links || !pill) return
    const move = (instant: boolean) => {
      const active = links.querySelector<HTMLElement>('a.on')
      if (!active) return
      gsap.to(pill, { x: active.offsetLeft, width: active.offsetWidth, autoAlpha: 1, duration: instant || reducedMotion() ? 0 : 0.65, ease: 'expo.out' })
    }
    move(!pill.dataset.ready)
    pill.dataset.ready = '1'
    document.fonts?.ready.then(() => move(true))
    const onResize = () => move(true)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [page])

  // hide on scroll down, show on scroll up, and fill the progress line
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    let last = window.scrollY
    let hidden = false
    const onScroll = () => {
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`
      setScrolled(y > 24)
      if (page !== 'model' && y > 240 && y > last + 3 && !hidden) {
        hidden = true
        gsap.to(nav, { yPercent: -170, duration: 0.45, ease: 'power3.in', overwrite: 'auto' })
      } else if ((y < last - 3 || y <= 240) && hidden) {
        hidden = false
        gsap.to(nav, { yPercent: 0, duration: 0.7, ease: 'expo.out', overwrite: 'auto' })
      }
      last = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      gsap.set(nav, { yPercent: 0 })
    }
  }, [page])

  const hoverTo = (link: HTMLElement) => {
    if (!hoverRef.current) return
    gsap.to(hoverRef.current, { x: link.offsetLeft, width: link.offsetWidth, autoAlpha: 1, duration: 0.45, ease: 'power3.out' })
  }
  const hoverOut = () => {
    if (hoverRef.current) gsap.to(hoverRef.current, { autoAlpha: 0, duration: 0.3, ease: 'power2.out' })
  }

  return (
    <nav ref={navRef} className={`${page === 'model' ? 'model-nav' : ''}${scrolled ? ' scrolled' : ''}`} aria-label="Main navigation">
      <a className="brand" href="#home" aria-label="NYC Taxi home">
        <span className="brand-mark"><TaxiMark /></span>
        <span>NYC <b>FARE INTELLIGENCE</b></span>
      </a>
      <div className="nav-links" ref={linksRef} onMouseLeave={hoverOut}>
        <span className="nav-hover" ref={hoverRef} aria-hidden="true" />
        <span className="nav-pill" ref={pillRef} aria-hidden="true" />
        {NAV_ITEMS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className={page === id ? 'on' : ''}
            aria-current={page === id ? 'page' : undefined}
            onMouseEnter={(event) => hoverTo(event.currentTarget)}
            onFocus={(event) => hoverTo(event.currentTarget)}
            onClick={(event) => {
              if (page === id) { event.preventDefault(); scrollToTop() }
            }}
          >{label}</a>
        ))}
      </div>
      {page !== 'model' && <a className="nav-cta" href="#model">Estimate a trip <span aria-hidden="true">→</span></a>}
      <span className="nav-progress" ref={progressRef} aria-hidden="true" />
    </nav>
  )
}

// Analogue dial: 270° sweep, minor/major ticks, numbers, optional red zone, tapered needle and glass glint.
const SWEEP = 135
const polar = (cx: number, cy: number, radius: number, degrees: number) => {
  const a = (degrees * Math.PI) / 180
  return [cx + radius * Math.sin(a), cy - radius * Math.cos(a)] as const
}
const angleFor = (value: number, max: number) => -SWEEP + (value / max) * SWEEP * 2

function Gauge({ cx, cy, max, major, minor, label, unit, redFrom, needleAngle, needleRef, needleClass }: {
  cx: number; cy: number; max: number; major: number; minor: number; label: string; unit: string
  redFrom?: number; needleAngle: number; needleRef?: React.Ref<SVGGElement>; needleClass?: string
}) {
  const ticks: React.ReactNode[] = []
  for (let value = 0; value <= max + 1e-6; value += minor) {
    const isMajor = Math.abs(value / major - Math.round(value / major)) < 1e-6
    const angle = angleFor(value, max)
    const [x1, y1] = polar(cx, cy, 52, angle)
    const [x2, y2] = polar(cx, cy, isMajor ? 43 : 47.5, angle)
    const hot = redFrom !== undefined && value >= redFrom
    ticks.push(<line key={value} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? '#e5533f' : isMajor ? '#efe3b4' : '#8d927f'} strokeWidth={isMajor ? 2.6 : 1.2} strokeLinecap="round" />)
    if (isMajor) {
      const [tx, ty] = polar(cx, cy, 34, angle)
      ticks.push(<text key={`n${value}`} x={tx} y={ty + 3} textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="8" fill={hot ? '#ef7a63' : '#d8d6c4'}>{value}</text>)
    }
  }
  let redArc = null
  if (redFrom !== undefined) {
    const [ax, ay] = polar(cx, cy, 50, angleFor(redFrom, max))
    const [bx, by] = polar(cx, cy, 50, angleFor(max, max))
    redArc = <path d={`M${ax} ${ay}A50 50 0 0 1 ${bx} ${by}`} fill="none" stroke="#e5533f" strokeOpacity=".7" strokeWidth="4" />
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r="66" fill="#050807" />
      <circle cx={cx} cy={cy} r="63" fill="url(#gauge-face)" stroke="url(#bezel)" strokeWidth="6" />
      <circle cx={cx} cy={cy} r="57" fill="none" stroke="#000" strokeOpacity=".55" strokeWidth="3" />
      {redArc}
      {ticks}
      <text x={cx} y={cy + 24} textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="8.5" letterSpacing="1.5" fill="#c7c9bd">{label}</text>
      <text x={cx} y={cy + 34} textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="6" letterSpacing="1" fill="#80867a">{unit}</text>
      <g ref={needleRef} className={needleClass} transform={`rotate(${needleAngle} ${cx} ${cy})`} filter="url(#needle-glow)">
        <path d={`M${cx - 2.4} ${cy + 12}L${cx - 0.7} ${cy - 50}H${cx + 0.7}L${cx + 2.4} ${cy + 12}Z`} fill="#ffb238" />
        <path d={`M${cx - 0.5} ${cy}V${cy - 48}`} stroke="#fff2c2" strokeWidth=".8" />
      </g>
      <circle cx={cx} cy={cy} r="7" fill="url(#bezel)" />
      <circle cx={cx} cy={cy} r="3" fill="#0b0f0d" />
      <path d={`M${cx - 44} ${cy - 30}A54 54 0 0 1 ${cx + 22} ${cy - 50}`} fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth="9" strokeLinecap="round" />
    </g>
  )
}

function CityScene({ ready }: { ready: boolean }) {
  const glassRef = useRef<SVGSVGElement>(null)
  const photoRef = useRef<HTMLImageElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const finishRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const mphRef = useRef<SVGGElement>(null)
  const odoRef = useRef<SVGTextElement>(null)
  const meterRef = useRef<SVGTextElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const introRef = useRef<gsap.core.Timeline | null>(null)
  const rainRef = useRef<ReturnType<typeof createRain> | null>(null)
  const wipersRef = useRef<ReturnType<typeof createWipers> | null>(null)
  const radioRef = useRef<Radio | null>(null)
  const eqRef = useRef<gsap.core.Tween[]>([])
  const [radio, setRadio] = useState<RadioState | null>(null)
  const [dashLive, setDashLive] = useState(true)
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('taxi-sound') !== 'off' } catch { return true }
  })
  const [rain, setRain] = useState(() => {
    try { return localStorage.getItem('taxi-rain') === 'on' } catch { return false }
  })
  const startedRef = useRef(false)

  const revNeedle = (delay: number) => {
    if (reducedMotion()) return
    // the rev needle kicks when the engine catches, then settles back to idle
    gsap.timeline({ delay })
      .to('.rpm-needle', { rotation: angleFor(5.2, 8), svgOrigin: '554 700', duration: 0.32, ease: 'power2.out', overwrite: 'auto' })
      .to('.rpm-needle', { rotation: angleFor(0.8, 8), svgOrigin: '554 700', duration: 1.3, ease: 'power3.inOut' })
  }
  const startEngine = () => playTaxiStart((delay) => {
    startedRef.current = true
    revNeedle(delay)
  })

  // start the cab as soon as the loading animation ends (or on the first click, if the browser blocks autoplay)
  useEffect(() => {
    if (!ready || !soundOn || startedRef.current) return
    return startEngine()
  }, [ready, soundOn])

  useEffect(() => {
    if (ready) introRef.current?.play()
  }, [ready])

  // One dashboard radio per visit to the home page; it only plays after a click on POWER or NEXT.
  useEffect(() => {
    const set = createRadio()
    radioRef.current = set
    set.preload()
    const unsubscribe = set.subscribe(setRadio)
    return () => {
      unsubscribe()
      set.dispose()
      radioRef.current = null
    }
  }, [])

  // The equalizer only dances while a station is actually playing.
  const playing = !!radio?.on && !radio.loading
  useEffect(() => {
    const bars = eqRef.current
    const rects = sceneRef.current?.querySelectorAll('.eq rect')
    if (!rects?.length) return
    // reduced motion: no bouncing, just a steady level while a station plays
    if (!bars.length) { gsap.set(rects, { scaleY: playing ? 0.6 : 0.12 }); return }
    bars.forEach((bar) => (playing ? bar.play() : bar.pause()))
    if (!playing) gsap.to(rects, { scaleY: 0.12, duration: 0.5, ease: 'power2.out', overwrite: false })
  }, [playing])

  useEffect(() => {
    rainRef.current?.set(rain, reducedMotion())
    wipersRef.current?.setRain(rain)
    if (rain) startRainSound()
    else stopRainSound()
  }, [rain])

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    try { localStorage.setItem('taxi-sound', next ? 'on' : 'off') } catch { /* storage unavailable */ }
    if (next) startEngine()
  }

  const toggleRain = () => {
    const next = !rain
    setRain(next)
    try { localStorage.setItem('taxi-rain', next ? 'on' : 'off') } catch { /* storage unavailable */ }
  }

  useLayoutEffect(() => {
    const scene = sceneRef.current
    const title = titleRef.current
    const finish = finishRef.current
    const glass = glassRef.current
    if (!scene || !title || !finish || !glass) return
    const still = reducedMotion()
    let meterTimer = 0
    let onMove: ((event: PointerEvent) => void) | null = null
    let stopStreet = () => {}

    const ctx = gsap.context(() => {
      const heading = title.querySelector('h1')!
      const accent = heading.querySelector('em')
      const rest = gsap.utils.toArray<HTMLElement>('.eyebrow, p', title)
      const finishSplit = SplitText.create(finish.querySelector('h2')!, { type: 'words', mask: 'words' })
      const finishButtons = finish.querySelectorAll('.btn')

      // Intro: words rise out of their own masks once the loader lifts.
      if (!still) {
        const split = SplitText.create(heading, { type: 'words', mask: 'words' })
        gsap.set(split.words, { yPercent: 115 })
        gsap.set(rest, { y: 18, autoAlpha: 0 })
        introRef.current = gsap.timeline({ paused: true, delay: 0.15 })
          .to(rest[0], { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out' })
          .to(split.words, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.07 }, 0.1)
          .to(accent, { '--ul': '100%', duration: 0.9, ease: 'power3.inOut' }, 0.75)
          .to(rest.slice(1), { y: 0, autoAlpha: 1, duration: 0.9, ease: 'power3.out', stagger: 0.1 }, 0.6)
        if (ready) introRef.current.play()
      } else {
        gsap.set(accent, { '--ul': '100%' })
      }

      // Scroll story: the cab pulls away, the title flies past the glass, then we pass through the windscreen.
      gsap.set(finish, { autoAlpha: 0 })
      gsap.set(finishSplit.words, { yPercent: 110 })
      gsap.set(finishButtons, { y: 24, autoAlpha: 0 })
      const story = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: scene.parentElement,
          start: 'top top',
          end: 'bottom bottom',
          scrub: still ? true : 0.6,
          onUpdate: (self) => {
            if (odoRef.current) odoRef.current.textContent = String(24817 + Math.round(self.progress * 12)).padStart(6, '0')
            finish.classList.toggle('on', self.progress > 0.74)
            setDashLive(self.progress < 0.4)
          },
        },
      })
      story.to(scrollRef.current!.querySelector('i b'), { scaleX: 1, duration: 0.72 }, 0)
        .to(scrollRef.current!.querySelector('span'), { autoAlpha: 0, duration: 0.05 }, 0)
        .to(scrollRef.current, { autoAlpha: 0, duration: 0.06 }, 0.68)
        .to(mphRef.current, { rotation: angleFor(48, 120), svgOrigin: '405 700', duration: 0.7, ease: 'power1.inOut' }, 0)
        .fromTo(photoRef.current, { scale: 1 }, { scale: 1.12, duration: 1 }, 0)
        .fromTo(photoRef.current, { filter: 'blur(0px) saturate(0.82)' }, { filter: 'blur(8px) saturate(1.02)', duration: 0.4, ease: 'power1.inOut' }, 0.3)
        .to(title, { autoAlpha: 0, duration: 0.16, ease: 'power1.in' }, 0.04)
      if (still) {
        story.to(glass, { opacity: 0, duration: 0.25 }, 0.4)
      } else {
        story.to(heading, { scale: 1.35, y: -30, filter: 'blur(10px)', duration: 0.2, ease: 'power2.in' }, 0.02)
          .to(rest, { y: -24, duration: 0.16, stagger: 0.02, ease: 'power1.in' }, 0.02)
          .fromTo(glass, { scale: 1 }, { scale: 5.2, duration: 0.72, ease: 'power2.inOut' }, 0)
          .to(glass, { opacity: 0, duration: 0.28, ease: 'power1.in' }, 0.5)
      }
      story.to(finish, { autoAlpha: 1, duration: 0.08 }, 0.66)
        .to(finishSplit.words, { yPercent: 0, duration: 0.14, stagger: 0.015, ease: 'power3.out' }, 0.68)
        .to(finishButtons, { y: 0, autoAlpha: 1, duration: 0.1, stagger: 0.03, ease: 'power2.out' }, 0.78)

      const eqBars = gsap.utils.toArray<SVGRectElement>('.eq rect')
      eqBars.forEach((bar, index) => gsap.set(bar, { scaleY: 0.12, svgOrigin: `${1021 + index * 26 + 7.5} 764` }))
      rainRef.current = createRain(scene)
      rainRef.current.set(rain, still)
      if (still) return

      // Live dashboard: engine idle, meter, radio, wipers, glare, street, mouse depth.
      gsap.set('.rpm-needle', { rotation: angleFor(0.8, 8), svgOrigin: '554 700' })
      gsap.to('.rpm-needle', { rotation: '+=6', svgOrigin: '554 700', duration: 2.8, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 })
      gsap.to('.wheel', { rotation: 3.5, svgOrigin: '470 900', duration: 3.4, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      eqRef.current = eqBars.map((bar, index) => {
        return gsap.to(bar, { scaleY: () => gsap.utils.random(0.18, 1), duration: () => gsap.utils.random(0.18, 0.4), repeat: -1, repeatRefresh: true, ease: 'power1.inOut', delay: index * 0.04, paused: true })
      })
      gsap.to('.audio-dot', { opacity: 0.25, duration: 0.6, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.fromTo('.glare', { x: -700 }, { x: 1700, duration: 2.8, ease: 'power2.inOut', repeat: -1, repeatDelay: 4.5, delay: 1.6 })
      wipersRef.current = createWipers(glass, (upstroke) => rainRef.current?.wipe(upstroke), (stroke) => playWiperSwish(stroke))
      wipersRef.current.play(2.4)
      wipersRef.current.setRain(rain)
      stopStreet = animateStreet(glass)

      const photo = photoRef.current
      const stage = stageRef.current
      if (photo && stage && window.matchMedia('(pointer: fine)').matches) {
        const depth = { px: 0, py: 0, gx: 0, gy: 0 }
        const apply = () => {
          photo.style.translate = `${depth.px}px ${depth.py}px`
          stage.style.translate = `${depth.gx}px ${depth.gy}px`
        }
        onMove = (event: PointerEvent) => {
          const nx = event.clientX / window.innerWidth - 0.5
          const ny = event.clientY / window.innerHeight - 0.5
          gsap.to(depth, { px: nx * -26, py: ny * -14, gx: nx * 10, gy: ny * 6, duration: 1.2, ease: 'power3.out', onUpdate: apply, overwrite: 'auto' })
        }
        window.addEventListener('pointermove', onMove)
      }

      let fare = 18.6
      meterTimer = window.setInterval(() => {
        fare += 0.7
        if (meterRef.current) {
          meterRef.current.textContent = `$${fare.toFixed(2)}`
          gsap.fromTo(meterRef.current, { opacity: 0.45 }, { opacity: 1, duration: 0.35, ease: 'power2.out' })
        }
      }, 1800)
    }, scene)

    return () => {
      window.clearInterval(meterTimer)
      if (onMove) window.removeEventListener('pointermove', onMove)
      stopStreet()
      wipersRef.current?.kill()
      rainRef.current?.kill()
      wipersRef.current = null
      rainRef.current = null
      introRef.current = null
      eqRef.current = []
      stopRainSound()
      ctx.revert()
    }
  }, [])

  return (
    <div id="hw">
      <div id="st" ref={sceneRef}>
        <img ref={photoRef} id="scene" className="hero-photo" src="/nyc-street.png" alt="" />
        <div id="rain-street" aria-hidden="true" />
        <svg id="scene-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="sky" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#b17c4f" />
              <stop offset=".48" stopColor="#68645a" />
              <stop offset="1" stopColor="#283a3c" />
            </linearGradient>
            <linearGradient id="street" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#343b39" />
              <stop offset="1" stopColor="#111614" />
            </linearGradient>
            <pattern id="windows" width="22" height="30" patternUnits="userSpaceOnUse">
              <rect x="5" y="6" width="8" height="12" fill="#ead39a" opacity=".6" />
            </pattern>
          </defs>
          <g>
            <rect width="1600" height="900" fill="url(#sky)" />
            <circle cx="800" cy="330" r="190" fill="#d0a469" opacity=".18" />
            <rect x="530" y="24" width="105" height="408" fill="#514b43" />
            <rect x="530" y="24" width="105" height="408" fill="url(#windows)" opacity=".55" />
            <rect x="650" y="-55" width="100" height="488" fill="#77766b" />
            <rect x="650" y="-55" width="100" height="488" fill="url(#windows)" opacity=".43" />
            <rect x="770" y="98" width="78" height="334" fill="#8d8879" />
            <rect x="770" y="98" width="78" height="334" fill="url(#windows)" opacity=".4" />
            <rect x="868" y="-95" width="102" height="528" fill="#4a514c" />
            <rect x="868" y="-95" width="102" height="528" fill="url(#windows)" opacity=".55" />
            <rect x="990" y="54" width="92" height="380" fill="#777367" />
            <rect x="990" y="54" width="92" height="380" fill="url(#windows)" opacity=".5" />
          </g>
          <g>
            <polygon points="560,420 1040,420 1600,900 0,900" fill="url(#street)" />
            <polygon points="560,420 590,420 0,900 0,880" fill="#676a61" />
            <polygon points="1040,420 1010,420 1600,900 1600,880" fill="#676a61" />
            <path className="road-dashes" d="M800 425V900" stroke="#d7b65e" strokeWidth="8" strokeDasharray="34 36" />
            <path d="M800 430L560 900M800 430L1040 900" stroke="#c3c2b8" strokeOpacity=".2" strokeWidth="3" />
            <g transform="translate(740 440)">
              <rect width="46" height="22" rx="5" fill="#d9b45a" />
              <rect x="8" y="-6" width="30" height="10" rx="3" fill="#d9b45a" />
              <rect x="12" y="-4" width="22" height="6" fill="#b9c9c4" />
            </g>
            <g transform="translate(822 450)">
              <rect width="34" height="16" rx="4" fill="#b7c1b6" />
              <rect x="6" y="-4" width="22" height="7" rx="2" fill="#b7c1b6" />
            </g>
          </g>
          <g>
            <path d="M0 0H280L370 170V570L0 780Z" fill="#4a4b43" />
            <path d="M0 0H280L370 170V570L0 780Z" fill="url(#windows)" opacity=".42" />
            <path d="M1600 0H1320L1230 170V570L1600 780Z" fill="#484c43" />
            <path d="M1600 0H1320L1230 170V570L1600 780Z" fill="url(#windows)" opacity=".42" />
            <path d="M280 176L480 252V472L370 570V170Z" fill="#646156" />
            <path d="M1320 176L1120 252V472L1230 570V170Z" fill="#636052" />
            <path d="M480 252L590 300V430L480 472Z" fill="#74705e" />
            <path d="M1120 252L1010 300V430L1120 472Z" fill="#73705d" />
          </g>
        </svg>
        <div id="in-wrap" ref={stageRef}>
        <svg ref={glassRef} id="in" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="dash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#353b37" />
              <stop offset=".2" stopColor="#1c211e" />
              <stop offset="1" stopColor="#090c0b" />
            </linearGradient>
            <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a4a99a" />
              <stop offset=".45" stopColor="#555d56" />
              <stop offset="1" stopColor="#222825" />
            </linearGradient>
            <linearGradient id="radio-screen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1d302d" />
              <stop offset="1" stopColor="#0b1716" />
            </linearGradient>
            <clipPath id="windscreen"><path d="M330 170H1270L1360 560H240Z" /></clipPath>
            <linearGradient id="glare-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".09" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <filter id="led" x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d9ddd2" />
              <stop offset=".35" stopColor="#7d8478" />
              <stop offset=".7" stopColor="#2c322e" />
              <stop offset="1" stopColor="#8a9186" />
            </linearGradient>
            <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3b433d" />
              <stop offset=".2" stopColor="#222824" />
              <stop offset="1" stopColor="#0d100f" />
            </linearGradient>
            <linearGradient id="rim-hi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c9cfc2" stopOpacity=".5" />
              <stop offset=".18" stopColor="#c9cfc2" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="spoke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5a6259" />
              <stop offset=".5" stopColor="#262c28" />
              <stop offset="1" stopColor="#141816" />
            </linearGradient>
            <radialGradient id="hub" cx=".5" cy=".3" r=".8">
              <stop offset="0" stopColor="#2c332e" />
              <stop offset="1" stopColor="#0f1311" />
            </radialGradient>
            <filter id="needle-glow" x="-50%" y="-20%" width="200%" height="140%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="gauge-face">
              <stop offset="0" stopColor="#202824" />
              <stop offset="1" stopColor="#080c0b" />
            </radialGradient>
          </defs>
          <path fillRule="evenodd" fill="#121816" d="M0 0H1600V900H0ZM330 170H1270L1360 560H240Z" />
          <path d="M330 170 240 560M1270 170 1360 560" fill="none" stroke="#303632" strokeWidth="18" />
          <path d="M334 174 250 548M1266 174 1350 548" fill="none" stroke="#777d72" strokeOpacity=".6" strokeWidth="2" />
          <StreetLife />
          <g className="dash">
          <path d="M0 558C230 526 415 528 610 550C790 570 810 570 990 550C1185 528 1370 526 1600 558V1000H0Z" fill="url(#dash)" />
          <path d="M0 558C230 526 415 528 610 550C790 570 810 570 990 550C1185 528 1370 526 1600 558" fill="none" stroke="#929589" strokeOpacity=".48" strokeWidth="4" />
          <path d="M0 574C240 547 410 550 610 568M990 568C1190 550 1360 547 1600 574" fill="none" stroke="#090d0b" strokeWidth="8" />
          <path d="M800 158V186" stroke="#111613" strokeWidth="12" strokeLinecap="round" />
          <path d="M762 183H838Q868 183 865 205L862 217Q858 236 832 236H768Q742 236 738 217L735 205Q732 183 762 183Z" fill="#090d0c" stroke="#555c55" strokeWidth="3" />
          <path d="M768 192H832Q854 192 852 207L850 216Q848 227 828 227H772Q752 227 750 216L748 207Q746 192 768 192Z" fill="#252e2a" />
          <path d="M772 203H828" stroke="#9ba48e" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" />
          <text x="800" y="217" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="8" letterSpacing="2" fill="#c6c8b6">NYC · TAXI</text>

          <g>
            <rect x="278" y="612" width="390" height="194" rx="30" fill="#111614" stroke="#596159" strokeWidth="5" />
            <rect x="292" y="626" width="362" height="166" rx="22" fill="#080c0b" stroke="#242b26" strokeWidth="3" />
            <Gauge cx={405} cy={700} max={120} major={20} minor={5} label="MPH" unit="" needleAngle={angleFor(0, 120)} needleRef={mphRef} />
            <rect x="384" y="728" width="42" height="11" rx="2.5" fill="#0f1a16" stroke="#48584a" strokeWidth="1" />
            <text x="405" y="736.5" textAnchor="middle" fontFamily="monospace" fontWeight="600" fontSize="7.5" letterSpacing=".5" fill="#ccd6ad" ref={odoRef}>024817</text>
            <Gauge cx={554} cy={700} max={8} major={1} minor={0.5} label="RPM" unit="× 1000" redFrom={6} needleAngle={angleFor(0.8, 8)} needleClass="rpm-needle" />
          </g>

          <g>
            <rect x="864" y="580" width="260" height="72" rx="14" fill="#111614" stroke="#73796d" strokeWidth="3" />
            <rect x="876" y="591" width="236" height="48" rx="8" fill="#101c17" stroke="#303c32" strokeWidth="2" />
            <text x="892" y="610" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="9" letterSpacing="2" fill="#a5ad94">TAXI METER</text>
            <text ref={meterRef} x="892" y="631" fontFamily="monospace" fontWeight="700" fontSize="20" fill="#f2d77e" filter="url(#led)">$18.60</text>
            <text x="1096" y="624" textAnchor="end" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="8" letterSpacing="1" fill="#e5533f" filter="url(#led)">HIRED</text>
            <circle className="audio-dot" cx="898" cy="650" r="4" fill="#d9b45a" />
            <circle cx="1090" cy="650" r="4" fill="#73796d" />
          </g>

          <g>
            <rect x="712" y="593" width="134" height="46" rx="10" fill="#111614" stroke="#687066" strokeWidth="3" />
            <rect x="722" y="602" width="114" height="28" rx="5" fill="#080c0b" />
            <path d="M730 609H828M730 616H828M730 623H828" stroke="#777f73" strokeWidth="2" strokeLinecap="round" />
            <circle cx="784" cy="616" r="4" fill="#a5ad94" />
            <rect x="1142" y="593" width="134" height="46" rx="10" fill="#111614" stroke="#687066" strokeWidth="3" />
            <rect x="1152" y="602" width="114" height="28" rx="5" fill="#080c0b" />
            <path d="M1160 609H1258M1160 616H1258M1160 623H1258" stroke="#777f73" strokeWidth="2" strokeLinecap="round" />
            <rect x="205" y="626" width="54" height="58" rx="7" fill="#111614" stroke="#687066" strokeWidth="3" />
            <path d="M214 638H250M214 647H250M214 656H250M214 665H250" stroke="#777f73" strokeWidth="2" strokeLinecap="round" />
          </g>

          <g>
            <rect x="748" y="674" width="492" height="148" rx="18" fill="#111614" stroke="url(#metal)" strokeWidth="5" />
            <rect x="765" y="689" width="458" height="103" rx="9" fill="url(#radio-screen)" stroke="#080b0a" strokeWidth="4" />
            <path d="M780 704H1207" stroke="#829080" strokeOpacity=".25" strokeWidth="1" />
            <text x="787" y="716" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="9" letterSpacing="2" fill="#c4c7b5">CITY RADIO</text>
            <RadioDisplay state={radio} />
            <g className="eq" fill="#a9bd9f" opacity=".85" filter="url(#led)">
              {[1021, 1047, 1073, 1099, 1125, 1151, 1177].map((x, index) => (
                <rect key={x} x={x} y={724} width="15" height="40" rx="1.5" opacity={0.55 + index * 0.05} />
              ))}
            </g>
            <circle className="audio-dot" cx="790" cy="807" r="5" fill="#d9b45a" />
            <text x="807" y="811" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="8" letterSpacing="1" fill="#aeb4a8">AUDIO</text>
            <RadioButtons state={radio} live={dashLive} onPower={() => radioRef.current?.power()} onNext={() => radioRef.current?.next()} />
          </g>

          <g>
            <rect x="778" y="838" width="432" height="52" rx="16" fill="#151a17" stroke="#414941" strokeWidth="3" />
            {[838, 994, 1150].map((x) => (
              <g key={x}>
                <circle cx={x} cy="864" r="19" fill="#0a0e0d" stroke="url(#metal)" strokeWidth="4" />
                <circle cx={x} cy="864" r="11" fill="#29312c" stroke="#59635a" strokeWidth="2" />
                <path d={`M${x} 864V853`} stroke="#d9b45a" strokeWidth="3" strokeLinecap="round" />
              </g>
            ))}
            <text x="838" y="887" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="7" letterSpacing="1" fill="#a5ad9e">FAN</text>
            <text x="994" y="887" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="7" letterSpacing="1" fill="#a5ad9e">TEMP</text>
            <text x="1150" y="887" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="7" letterSpacing="1" fill="#a5ad9e">AIR</text>
          </g>

          <path d="M1265 730Q1380 714 1510 740V830Q1370 812 1265 840Z" fill="#171c19" stroke="#39413a" strokeWidth="3" />
          <path d="M1300 752Q1380 740 1470 755" fill="none" stroke="#62695f" strokeOpacity=".55" strokeWidth="2" />
          <g className="wheel">
            <ellipse cx="470" cy="905" rx="150" ry="124" fill="none" stroke="#050706" strokeWidth="38" />
            <ellipse cx="470" cy="905" rx="150" ry="124" fill="none" stroke="url(#rim)" strokeWidth="28" />
            <ellipse cx="470" cy="905" rx="150" ry="124" fill="none" stroke="#7d857a" strokeOpacity=".4" strokeWidth="1.2" strokeDasharray="3 5" />
            <ellipse cx="470" cy="905" rx="163" ry="137" fill="none" stroke="url(#rim-hi)" strokeWidth="2.5" />
            <path d="M326 868Q330 846 344 832L362 846Q350 858 348 874Z M614 868Q610 846 596 832L578 846Q590 858 592 874Z" fill="#0e1210" opacity=".9" />
            <path d="M334 876 426 884 428 914 334 906Z" fill="url(#spoke)" stroke="#0a0d0c" strokeWidth="2" strokeLinejoin="round" />
            <path d="M606 876 514 884 512 914 606 906Z" fill="url(#spoke)" stroke="#0a0d0c" strokeWidth="2" strokeLinejoin="round" />
            <path d="M340 880 424 887M600 880 516 887" stroke="#9aa294" strokeOpacity=".35" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="404" y="858" width="132" height="86" rx="30" fill="#0c100e" stroke="url(#bezel)" strokeWidth="3" />
            <rect x="414" y="866" width="112" height="70" rx="24" fill="url(#hub)" />
            <path d="M428 874Q470 866 512 874" fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth="5" strokeLinecap="round" />
            <rect x="451" y="878" width="38" height="14" rx="4" fill="#d9b45a" />
            <text x="470" y="888.5" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="8" letterSpacing="1" fill="#1c1e18">TAXI</text>
          </g>
          </g>
          <path d="M420 180H560L330 560H240Z" fill="#fff" opacity=".045" />
          <g clipPath="url(#windscreen)">
            <rect className="glare" x="0" y="160" width="260" height="420" fill="url(#glare-grad)" transform="skewX(-18)" />
          </g>
          <RainGlass />
          <Wipers />
        </svg>
        </div>
        <div id="ht" ref={titleRef}>
          <span className="eyebrow">New York City · trip intelligence</span>
          <h1>Know the <em>Fares</em><br />before you ride.</h1>
          <p>Real trip records. Two carefully calibrated estimates.</p>
        </div>
        <div id="fin" ref={finishRef}>
          <h2>Every ride has<br />a clearer picture.</h2>
          <div>
            <a className="btn p" href="#model">Estimate a trip <span aria-hidden="true">→</span></a>
            <a className="btn s" href="#docs">Explore the method</a>
          </div>
        </div>
        <div className="sc" id="scr" ref={scrollRef} aria-hidden="true"><small>Scroll to ride</small> <i><b /></i> <span>↓</span></div>
        <div className="hero-ctl">
          <button type="button" className={`sound-btn${soundOn ? ' on' : ''}`} onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? 'Turn engine sound off' : 'Turn engine sound on'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
              {soundOn
                ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                : <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            </svg>
            <span>{soundOn ? 'Engine sound on' : 'Sound off'}</span>
          </button>
          <button type="button" className={`sound-btn${rain ? ' on' : ''}`} onClick={toggleRain} aria-pressed={rain} aria-label={rain ? 'Stop the rain' : 'Make it rain'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 15.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.3A3.4 3.4 0 0 1 17 15.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              {rain && <path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
            </svg>
            <span>{rain ? 'Rain on' : 'Rain'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function FeatureCards() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => (ref.current ? revealOnScroll(ref.current) : undefined), [])
  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.cd').forEach((card) => {
        gsap.fromTo(card.querySelector('.cd-art'), { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } })
      })
    }, root)
    return () => ctx.revert()
  }, [])
  return (
    <section className="stk" ref={ref}>
      <div className="section-intro" data-reveal>
        <span className="eyebrow">A useful estimate, not a promise</span>
        <h2>Two models.<br />One honest view.</h2>
      </div>
      <div className="cd">
        <span className="cd-art" style={{ backgroundImage: 'url(/cards/route.svg)' }} aria-hidden="true" />
        <i>01</i>
        <div><h3>Choose any route</h3><p>Explore the city zone by zone, from JFK to the neighborhood around the corner.</p></div>
      </div>
      <div className="cd">
        <span className="cd-art" style={{ backgroundImage: 'url(/cards/time.svg)' }} aria-hidden="true" />
        <i>02</i>
        <div><h3>Set your departure</h3><p>Time, weekday and seasonal conditions shape the duration estimate.</p></div>
      </div>
      <div className="cd">
        <span className="cd-art" style={{ backgroundImage: 'url(/cards/fleet.svg)' }} aria-hidden="true" />
        <i>03</i>
        <div><h3>Compare both fleets</h3><p>See separate Yellow and Green estimates for the same trip and time.</p></div>
      </div>
      <a className="text-link" data-reveal href="#model">Open the trip estimator <span aria-hidden="true">→</span></a>
    </section>
  )
}

function HomePage({ ready }: { ready: boolean }) {
  return <main id="home"><CityScene ready={ready} /><FeatureCards /></main>
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [loading, setLoading] = useState(true)
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneError, setZoneError] = useState('')

  useEffect(() => {
    startSmoothScroll()
  }, [])

  useEffect(() => {
    let activePage: Page | null = null
    let timeout = 0
    const navigate = () => {
      const next = routeFromHash()
      if (next === activePage) return
      const initial = activePage === null
      activePage = next
      setLoading(true)
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => {
        setPage(next)
        scrollToTop(true)
        setLoading(false)
        requestAnimationFrame(() => ScrollTrigger.refresh())
      }, initial ? 1100 : 360)
    }
    navigate()
    window.addEventListener('hashchange', navigate)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('hashchange', navigate)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getZones(controller.signal)
      .then(setZones)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setZoneError(cause instanceof Error ? cause.message : 'Could not load taxi zones.')
        }
      })
    return () => controller.abort()
  }, [])

  return (
    <>
      <Loader active={loading} />
      <Navigation page={page} />
      {page === 'home' && <HomePage ready={!loading} />}
      {page === 'model' && <EstimatorPage zones={zones} zoneError={zoneError} />}
      {page === 'docs' && <MethodologyPage />}
      {page !== 'model' && <footer>NYC TLC 2025 data <span>·</span> two-stage LightGBM <span>·</span> Estimates are not fare quotes</footer>}
    </>
  )
}

export default App
