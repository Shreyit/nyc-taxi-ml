import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { getZones } from './api'
import { gsap, reducedMotion, revealOnScroll, ScrollTrigger, scrollToElement, scrollToTop, startSmoothScroll } from './motion'
import type { Page, Zone } from './types'
import EstimatorPage from './EstimatorPage'
import { playTaxiStart } from './engineSound'

const pageIds: Page[] = ['home', 'model', 'docs']

function routeFromHash(): Page {
  const hash = window.location.hash.slice(1)
  return pageIds.includes(hash as Page) ? (hash as Page) : 'home'
}

function Loader({ active }: { active: boolean }) {
  return (
    <div id="ld" className={active ? '' : 'off'} aria-live="polite" aria-label="Loading page">
      <svg viewBox="0 0 300 150" aria-hidden="true">
        <g className="bob">
          <rect x="105" y="30" width="80" height="22" rx="3" fill="#FFF3C4" stroke="#0B1020" strokeWidth="3" />
          <text x="145" y="46" fontFamily="sans-serif" fontWeight="800" fontSize="12" textAnchor="middle" fill="#0B1020">NEW YORK</text>
          <path d="M18 104Q16 86 44 82L72 58H190L220 82Q272 84 284 104V114H18Z" fill="#F7A800" stroke="#0B1020" strokeWidth="4" strokeLinejoin="round" />
          <path d="M82 64H134V82H62ZM142 64H186L208 82H142Z" fill="#BDE8FF" stroke="#0B1020" strokeWidth="3" strokeLinejoin="round" />
          <path d="M22 94H280" stroke="#0B1020" strokeWidth="6" strokeDasharray="6 6" />
          <text x="168" y="108" fontFamily="sans-serif" fontWeight="800" fontSize="12" fill="#0B1020">TAXI</text>
          <rect x="14" y="88" width="8" height="12" rx="2" fill="#E5322D" />
        </g>
        <g stroke="#0B1020" strokeWidth="4">
          <g className="wh">
            <circle cx="70" cy="118" r="17" fill="#222" />
            <circle cx="70" cy="118" r="6" fill="#BDE8FF" />
            <path d="M70 104V132M56 118H84" stroke="#555" strokeWidth="2" />
          </g>
          <g className="wh">
            <circle cx="228" cy="118" r="17" fill="#222" />
            <circle cx="228" cy="118" r="6" fill="#BDE8FF" />
            <path d="M228 104V132M214 118H242" stroke="#555" strokeWidth="2" />
          </g>
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

function CityScene({ ready }: { ready: boolean }) {
  const glassRef = useRef<SVGSVGElement>(null)
  const photoRef = useRef<HTMLImageElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const finishRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const skylineRef = useRef<SVGGElement>(null)
  const roadRef = useRef<SVGGElement>(null)
  const buildingsRef = useRef<SVGGElement>(null)
  const mphRef = useRef<SVGPathElement>(null)
  const odoRef = useRef<SVGTextElement>(null)
  const meterRef = useRef<SVGTextElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('taxi-sound') !== 'off' } catch { return true }
  })
  const startedRef = useRef(false)

  const revNeedle = (delay: number) => {
    if (reducedMotion()) return
    // the rev needle kicks when the engine catches, then settles back to idle
    gsap.timeline({ delay })
      .to('.rpm-needle', { rotation: 95, svgOrigin: '554 700', duration: 0.32, ease: 'power2.out', overwrite: 'auto' })
      .to('.rpm-needle', { rotation: 0, svgOrigin: '554 700', duration: 1.3, ease: 'power3.inOut' })
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

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    try { localStorage.setItem('taxi-sound', next ? 'on' : 'off') } catch { /* storage unavailable */ }
    if (next) startEngine()
  }

  useEffect(() => {
    let frame = 0
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    const smooth = (start: number, end: number, value: number) => {
      const t = clamp((value - start) / (end - start), 0, 1)
      return t * t * (3 - 2 * t)
    }
    const transform = (scale: number) => `translate(800 450) scale(${scale}) translate(-800 -450)`

    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const track = document.querySelector<HTMLElement>('#hw')
        if (!track) return
        const progress = clamp(window.scrollY / (track.offsetHeight - window.innerHeight), 0, 1)
        const zoom = smooth(0, 0.72, progress)
        if (glassRef.current) {
          glassRef.current.style.transform = `scale(${1 + 4.2 * zoom})`
          glassRef.current.style.opacity = String(1 - smooth(0.5, 0.78, progress))
        }
        skylineRef.current?.setAttribute('transform', transform(1 + 0.12 * progress))
        roadRef.current?.setAttribute('transform', transform(1 + 0.3 * progress))
        buildingsRef.current?.setAttribute('transform', transform(1 + 0.7 * progress))
        const blur = smooth(0.3, 0.7, progress) * 8
        if (photoRef.current) {
          photoRef.current.style.filter = `blur(${blur}px) saturate(${0.82 + blur / 40})`
          photoRef.current.style.transform = `scale(${1 + 0.12 * progress})`
        }
        mphRef.current?.setAttribute('transform', `rotate(${-88 + 150 * smooth(0, 0.7, progress)} 405 700)`)
        if (odoRef.current) odoRef.current.textContent = `${String(24817 + Math.round(progress * 12)).padStart(6, '0')} MI`
        if (titleRef.current) titleRef.current.style.opacity = String(1 - smooth(0.02, 0.2, progress))
        if (scrollRef.current) scrollRef.current.style.opacity = String(1 - smooth(0, 0.06, progress))
        const reveal = smooth(0.68, 0.85, progress)
        if (finishRef.current) {
          finishRef.current.style.opacity = String(reveal)
          finishRef.current.classList.toggle('on', reveal > 0.5)
        }
      })
    }

    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    update()
    const intro = reducedMotion() || !titleRef.current
      ? null
      : gsap.from(titleRef.current.children, { y: 46, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12, delay: 1.05 })

    // live dashboard: engine idle, meter, radio, wipers, glare, mouse depth
    let fare = 18.6
    let meterTimer = 0
    let onMove: ((event: PointerEvent) => void) | null = null
    const live = reducedMotion() ? null : gsap.context(() => {
      gsap.to('.rpm-needle', { rotation: '+=12', svgOrigin: '554 700', duration: 2.8, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 })
      gsap.to('.wheel', { rotation: 3.5, svgOrigin: '470 900', duration: 3.4, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.utils.toArray<SVGRectElement>('.eq rect').forEach((bar, index) => {
        gsap.set(bar, { scaleY: 0.5, svgOrigin: `${1021 + index * 26 + 7.5} 764` })
        gsap.to(bar, { scaleY: () => gsap.utils.random(0.18, 1), duration: () => gsap.utils.random(0.18, 0.4), repeat: -1, repeatRefresh: true, ease: 'power1.inOut', delay: index * 0.04 })
      })
      gsap.to('.audio-dot', { opacity: 0.25, duration: 0.6, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      const wipers = gsap.utils.toArray<SVGGElement>('.wiper')
      const sweep = gsap.timeline({ repeat: -1, repeatDelay: 5.5, delay: 2.4 })
      wipers.forEach((wiper, index) => {
        const origin = index === 0 ? '520 556' : '930 556'
        sweep.to(wiper, { rotation: 112, svgOrigin: origin, duration: 0.55, ease: 'sine.inOut' }, index * 0.06)
          .to(wiper, { rotation: 0, svgOrigin: origin, duration: 0.6, ease: 'sine.inOut' }, 0.6 + index * 0.06)
      })
      gsap.fromTo('.glare', { x: -700 }, { x: 1700, duration: 2.8, ease: 'power2.inOut', repeat: -1, repeatDelay: 4.5, delay: 1.6 })

      const photo = photoRef.current
      const glass = stageRef.current
      if (photo && glass && window.matchMedia('(pointer: fine)').matches) {
        const depth = { px: 0, py: 0, gx: 0, gy: 0 }
        const apply = () => {
          photo.style.translate = `${depth.px}px ${depth.py}px`
          glass.style.translate = `${depth.gx}px ${depth.gy}px`
        }
        onMove = (event: PointerEvent) => {
          const nx = event.clientX / window.innerWidth - 0.5
          const ny = event.clientY / window.innerHeight - 0.5
          gsap.to(depth, { px: nx * -26, py: ny * -14, gx: nx * 10, gy: ny * 6, duration: 1.2, ease: 'power3.out', onUpdate: apply, overwrite: 'auto' })
        }
        window.addEventListener('pointermove', onMove)
      }
    })
    if (live) {
      meterTimer = window.setInterval(() => {
        fare += 0.7
        if (meterRef.current) {
          meterRef.current.textContent = `$${fare.toFixed(2)}`
          gsap.fromTo(meterRef.current, { opacity: 0.45 }, { opacity: 1, duration: 0.35, ease: 'power2.out' })
        }
      }, 1800)
    }
    return () => {
      intro?.revert()
      live?.revert()
      window.clearInterval(meterTimer)
      if (onMove) window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div id="hw">
      <div id="st">
        <img ref={photoRef} id="scene" className="hero-photo" src="/nyc-street.png" alt="" />
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
          <g ref={skylineRef}>
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
          <g ref={roadRef}>
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
          <g ref={buildingsRef}>
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
            <radialGradient id="gauge-face">
              <stop offset="0" stopColor="#202824" />
              <stop offset="1" stopColor="#080c0b" />
            </radialGradient>
          </defs>
          <path fillRule="evenodd" fill="#121816" d="M0 0H1600V900H0ZM330 170H1270L1360 560H240Z" />
          <path d="M330 170 240 560M1270 170 1360 560" fill="none" stroke="#303632" strokeWidth="18" />
          <path d="M334 174 250 548M1266 174 1350 548" fill="none" stroke="#777d72" strokeOpacity=".6" strokeWidth="2" />
          <g className="dash">
          <path d="M0 558C230 526 415 528 610 550C790 570 810 570 990 550C1185 528 1370 526 1600 558V900H0Z" fill="url(#dash)" />
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
            <circle cx="405" cy="700" r="63" fill="url(#gauge-face)" stroke="url(#metal)" strokeWidth="5" />
            <circle cx="405" cy="700" r="49" fill="none" stroke="#697267" strokeOpacity=".55" strokeWidth="2" />
            <path d="M369 660V671M388 649V662M422 649V662M441 660V671M357 686H369M441 686H453M363 724L374 718M436 718L447 724" stroke="#d1c58c" strokeWidth="3" strokeLinecap="round" />
            <path ref={mphRef} d="M405 700 405 660" transform="rotate(-88 405 700)" stroke="#e6c165" strokeWidth="4" strokeLinecap="round" />
            <circle cx="405" cy="700" r="6" fill="#d9b45a" />
            <text x="405" y="745" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="9" letterSpacing="1" fill="#c7c9bd">MPH</text>
            <circle cx="554" cy="700" r="63" fill="url(#gauge-face)" stroke="url(#metal)" strokeWidth="5" />
            <circle cx="554" cy="700" r="49" fill="none" stroke="#697267" strokeOpacity=".55" strokeWidth="2" />
            <path d="M518 660V671M537 649V662M571 649V662M590 660V671M506 686H518M590 686H602M512 724L523 718M585 718L596 724" stroke="#d1c58c" strokeWidth="3" strokeLinecap="round" />
            <path className="rpm-needle" d="M554 700 526 675" stroke="#e6c165" strokeWidth="4" strokeLinecap="round" />
            <circle cx="554" cy="700" r="6" fill="#d9b45a" />
            <text x="554" y="745" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="9" letterSpacing="1" fill="#c7c9bd">RPM</text>
            <rect x="449" y="758" width="110" height="22" rx="4" fill="#1b2b25" stroke="#48584a" strokeWidth="1.5" />
            <text x="504" y="773" textAnchor="middle" fontFamily="monospace" fontWeight="600" fontSize="10" letterSpacing="1" fill="#ccd6ad" ref={odoRef}>024817 MI</text>
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
            <text x="787" y="757" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="28" fill="#e1d18f">FM 101.1</text>
            <text x="787" y="778" fontFamily="Manrope, sans-serif" fontWeight="500" fontSize="10" letterSpacing="1" fill="#a7b3a5">NEW YORK · LIVE TRAFFIC</text>
            <g className="eq" fill="#a9bd9f" opacity=".85" filter="url(#led)">
              {[1021, 1047, 1073, 1099, 1125, 1151, 1177].map((x, index) => (
                <rect key={x} x={x} y={724} width="15" height="40" rx="1.5" opacity={0.55 + index * 0.05} />
              ))}
            </g>
            <circle className="audio-dot" cx="790" cy="807" r="5" fill="#d9b45a" />
            <text x="807" y="811" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="8" letterSpacing="1" fill="#aeb4a8">AUDIO</text>
            <circle cx="1164" cy="807" r="10" fill="#262d29" stroke="#879083" strokeWidth="2" />
            <circle cx="1200" cy="807" r="10" fill="#262d29" stroke="#879083" strokeWidth="2" />
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
            <ellipse cx="470" cy="905" rx="150" ry="124" fill="none" stroke="#090d0c" strokeWidth="28" />
            <ellipse cx="470" cy="905" rx="150" ry="124" fill="none" stroke="#59615a" strokeWidth="7" />
            <path d="M470 786V880M350 856 447 900M590 856 493 900" fill="none" stroke="#252c28" strokeWidth="20" strokeLinecap="round" />
            <path d="M470 794V879M359 858 449 899M581 858 491 899" fill="none" stroke="#71786d" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round" />
            <circle cx="470" cy="900" r="31" fill="#141916" stroke="url(#metal)" strokeWidth="5" />
            <circle cx="470" cy="900" r="17" fill="#2d342e" />
            <text x="470" y="904" textAnchor="middle" fontFamily="DM Serif Display, serif" fontWeight="700" fontSize="13" fill="#d9b45a">T</text>
          </g>
          </g>
          <path d="M420 180H560L330 560H240Z" fill="#fff" opacity=".045" />
          <g clipPath="url(#windscreen)">
            <rect className="glare" x="0" y="160" width="260" height="420" fill="url(#glare-grad)" transform="skewX(-18)" />
            <g className="wiper">
              <path d="M520 556H150" stroke="#0b0f0d" strokeWidth="7" strokeLinecap="round" />
              <path d="M490 552H170" stroke="#2a312c" strokeWidth="3" strokeLinecap="round" />
            </g>
            <g className="wiper">
              <path d="M930 556H560" stroke="#0b0f0d" strokeWidth="7" strokeLinecap="round" />
              <path d="M900 552H580" stroke="#2a312c" strokeWidth="3" strokeLinecap="round" />
            </g>
          </g>
          <circle cx="520" cy="556" r="9" fill="#1a1f1c" stroke="#4d554e" strokeWidth="2" />
          <circle cx="930" cy="556" r="9" fill="#1a1f1c" stroke="#4d554e" strokeWidth="2" />
        </svg>
        </div>
        <div id="ht" ref={titleRef}>
          <span className="eyebrow">New York City · trip intelligence</span>
          <h1>Know the Fares<br />before you ride.</h1>
          <p>Real trip records. Two carefully calibrated estimates.</p>
        </div>
        <div id="fin" ref={finishRef}>
          <h2>Every ride has<br />a clearer picture.</h2>
          <div>
            <a className="btn p" href="#model">Estimate a trip <span aria-hidden="true">→</span></a>
            <a className="btn s" href="#docs">Explore the method</a>
          </div>
        </div>
        <div className="sc" id="scr" ref={scrollRef}>Scroll to explore <span>↓</span></div>
        <button type="button" className={`sound-btn${soundOn ? ' on' : ''}`} onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? 'Turn engine sound off' : 'Turn engine sound on'}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
            {soundOn
              ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              : <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
          </svg>
          <span>{soundOn ? 'Engine sound on' : 'Sound off'}</span>
        </button>
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

function DocsPage() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('overview')
  const sections = useMemo(() => [
    { id: 'overview', label: 'Overview', title: 'What the estimate means', body: 'The service returns a trip-duration estimate and a metered-fare estimate. Duration is predicted first; its output is then passed into the fare model.' },
    { id: 'data', label: 'Data', title: 'Built from NYC TLC records', body: 'The models were trained on 2025 Yellow and Green taxi records. Location is represented by TLC taxi zones rather than precise addresses.' },
    { id: 'pipeline', label: 'Pipeline', title: 'Two stages, in sequence', body: 'Stage one uses pre-trip time, route, zone geometry, calendar and historical route features. Stage two combines those features with the predicted duration.' },
    { id: 'inputs', label: 'Inputs', title: 'Only what is known before pickup', body: 'The model does not use actual trip distance, drop-off timestamp, tolls or other post-trip information. Weather features use the project’s seasonal baseline.' },
    { id: 'limits', label: 'Limits', title: 'An estimate, not a quote', body: 'Zone-centroid routes cannot capture the route actually driven. Fare predictions exclude tips, tolls and surcharges; treat the displayed ranges as guidance.' },
  ], [])

  const headingRef = useRef<HTMLDivElement>(null)
  useEffect(() => (headingRef.current ? revealOnScroll(headingRef.current) : undefined), [])

  useEffect(() => {
    const root = sectionRef.current
    if (!root) return
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in')
          setActive((entry.target as HTMLElement).id)
        }
      })
    }, { threshold: 0.3 })
    root.querySelectorAll('.doc-section').forEach((section) => reveal.observe(section))
    return () => reveal.disconnect()
  }, [])

  return (
    <main id="docs" className="docs-page">
      <div className="docs-heading" ref={headingRef}>
        <span className="eyebrow" data-reveal>MODEL NOTES · NYC TLC 2025</span>
        <h1 data-reveal>Built for a better<br />informed ride.</h1>
        <p data-reveal>A transparent look at the data, the two-stage pipeline and what the numbers do—and do not—say.</p>
      </div>
      <div className="dw">
        <aside className="fc">
          <small>ON THIS PAGE</small>
          <ol>{sections.map((section) => <li key={section.id}><button type="button" className={active === section.id ? 'on' : ''} onClick={() => { const target = document.getElementById(section.id); if (target) scrollToElement(target) }}>{section.label}</button></li>)}</ol>
        </aside>
        <div className="dc" ref={sectionRef}>
          {sections.map((section, index) => (
            <section id={section.id} className="doc-section" key={section.id}>
              <span className="eyebrow">{String(index + 1).padStart(2, '0')} / {section.label.toUpperCase()}</span>
              <h2><span className="hm"><span>{section.title}</span></span></h2>
              <p>{section.body}</p>
              {section.id === 'pipeline' && <PipelineGraphic />}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}

function PipelineGraphic() {
  return (
    <div className="fg">
      <div className="pipeline-node"><small>PRE-TRIP FEATURES</small><strong>Route · Time · Zone</strong></div>
      <span className="pipeline-arrow" aria-hidden="true">→</span>
      <div className="pipeline-node duration"><small>STAGE 01</small><strong>Trip duration</strong></div>
      <span className="pipeline-arrow" aria-hidden="true">→</span>
      <div className="pipeline-node fare"><small>STAGE 02</small><strong>Metered fare</strong></div>
    </div>
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
      {page === 'docs' && <DocsPage />}
      {page !== 'model' && <footer>NYC TLC 2025 data <span>·</span> two-stage LightGBM <span>·</span> Estimates are not fare quotes</footer>}
    </>
  )
}

export default App
