import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { getZones } from './api'
import type { Page, Zone } from './types'
import EstimatorPage from './EstimatorPage'

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

function Navigation({ page }: { page: Page }) {
  return (
    <nav className={page === 'model' ? 'model-nav' : ''} aria-label="Main navigation">
      <a className="brand" href="#home" aria-label="NYC Taxi home">
        <span className="brand-mark">N</span>
        <span>NYC <b>FARE INTELLIGENCE</b></span>
      </a>
      <div className="nav-links">
        <a href="#home" className={page === 'home' ? 'on' : ''} onClick={(event) => {
          if (page === 'home') { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
        }}>Overview</a>
        <a href="#model" className={page === 'model' ? 'on' : ''} onClick={(event) => {
          if (page === 'model') { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
        }}>Estimator</a>
        <a href="#docs" className={page === 'docs' ? 'on' : ''} onClick={(event) => {
          if (page === 'docs') { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
        }}>Methodology</a>
      </div>
    </nav>
  )
}

function CityScene() {
  const glassRef = useRef<SVGSVGElement>(null)
  const photoRef = useRef<HTMLImageElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const finishRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const skylineRef = useRef<SVGGElement>(null)
  const roadRef = useRef<SVGGElement>(null)
  const buildingsRef = useRef<SVGGElement>(null)

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
    return () => {
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
            <radialGradient id="gauge-face">
              <stop offset="0" stopColor="#202824" />
              <stop offset="1" stopColor="#080c0b" />
            </radialGradient>
          </defs>
          <path fillRule="evenodd" fill="#121816" d="M0 0H1600V900H0ZM330 170H1270L1360 560H240Z" />
          <path d="M330 170 240 560M1270 170 1360 560" fill="none" stroke="#303632" strokeWidth="18" />
          <path d="M334 174 250 548M1266 174 1350 548" fill="none" stroke="#777d72" strokeOpacity=".6" strokeWidth="2" />
          <path d="M0 558C230 526 415 528 610 550C790 570 810 570 990 550C1185 528 1370 526 1600 558V900H0Z" fill="url(#dash)" />
          <path d="M0 558C230 526 415 528 610 550C790 570 810 570 990 550C1185 528 1370 526 1600 558" fill="none" stroke="#929589" strokeOpacity=".48" strokeWidth="4" />
          <path d="M0 574C240 547 410 550 610 568M990 568C1190 550 1360 547 1600 574" fill="none" stroke="#090d0b" strokeWidth="8" />
          <path d="M800 158V190" stroke="#111613" strokeWidth="12" strokeLinecap="round" />
          <path d="M738 190Q800 172 862 190L852 226Q800 240 748 226Z" fill="#090d0c" stroke="#555c55" strokeWidth="3" />
          <path d="M753 198Q800 186 847 198L842 218Q800 229 758 218Z" fill="#252e2a" />
          <path d="M770 207H830" stroke="#9ba48e" strokeOpacity=".55" strokeWidth="2" />
          <text x="800" y="217" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="8" letterSpacing="2" fill="#c6c8b6">NYC · TAXI</text>

          <g>
            <rect x="278" y="612" width="390" height="194" rx="30" fill="#111614" stroke="#596159" strokeWidth="5" />
            <rect x="292" y="626" width="362" height="166" rx="22" fill="#080c0b" stroke="#242b26" strokeWidth="3" />
            <circle cx="405" cy="700" r="63" fill="url(#gauge-face)" stroke="url(#metal)" strokeWidth="5" />
            <circle cx="405" cy="700" r="49" fill="none" stroke="#697267" strokeOpacity=".55" strokeWidth="2" />
            <path d="M369 660V671M388 649V662M422 649V662M441 660V671M357 686H369M441 686H453M363 724L374 718M436 718L447 724" stroke="#d1c58c" strokeWidth="3" strokeLinecap="round" />
            <path d="M405 700 433 671" stroke="#d9b45a" strokeWidth="4" strokeLinecap="round" />
            <circle cx="405" cy="700" r="6" fill="#d9b45a" />
            <text x="405" y="745" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="9" letterSpacing="1" fill="#c7c9bd">MPH</text>
            <circle cx="554" cy="700" r="63" fill="url(#gauge-face)" stroke="url(#metal)" strokeWidth="5" />
            <circle cx="554" cy="700" r="49" fill="none" stroke="#697267" strokeOpacity=".55" strokeWidth="2" />
            <path d="M518 660V671M537 649V662M571 649V662M590 660V671M506 686H518M590 686H602M512 724L523 718M585 718L596 724" stroke="#d1c58c" strokeWidth="3" strokeLinecap="round" />
            <path d="M554 700 526 675" stroke="#d9b45a" strokeWidth="4" strokeLinecap="round" />
            <circle cx="554" cy="700" r="6" fill="#d9b45a" />
            <text x="554" y="745" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="9" letterSpacing="1" fill="#c7c9bd">RPM</text>
            <rect x="449" y="758" width="110" height="22" rx="4" fill="#1b2b25" stroke="#48584a" strokeWidth="1.5" />
            <text x="504" y="773" textAnchor="middle" fontFamily="monospace" fontWeight="600" fontSize="10" letterSpacing="1" fill="#ccd6ad">000000 MI</text>
          </g>

          <g>
            <rect x="690" y="580" width="260" height="72" rx="13" fill="#111614" stroke="#73796d" strokeWidth="3" />
            <rect x="702" y="591" width="236" height="48" rx="7" fill="#101c17" stroke="#303c32" strokeWidth="2" />
            <text x="718" y="610" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="9" letterSpacing="2" fill="#a5ad94">TAXI METER</text>
            <text x="718" y="631" fontFamily="monospace" fontWeight="700" fontSize="20" fill="#dfc879">$18.60</text>
            <text x="917" y="624" textAnchor="end" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="8" letterSpacing="1" fill="#8da17c">HIRED</text>
            <circle cx="724" cy="650" r="4" fill="#d9b45a" />
            <circle cx="916" cy="650" r="4" fill="#73796d" />
          </g>

          <g>
            <rect x="1008" y="588" width="134" height="46" rx="8" fill="#111614" stroke="#687066" strokeWidth="3" />
            <rect x="1018" y="597" width="114" height="28" rx="4" fill="#080c0b" />
            <path d="M1026 604H1124M1026 611H1124M1026 618H1124" stroke="#777f73" strokeWidth="2" strokeLinecap="round" />
            <circle cx="1080" cy="611" r="4" fill="#a5ad94" />
            <rect x="1240" y="620" width="112" height="48" rx="7" fill="#111614" stroke="#687066" strokeWidth="3" />
            <rect x="1249" y="629" width="94" height="29" rx="3" fill="#080c0b" />
            <path d="M1257 636H1335M1257 643H1335M1257 650H1335" stroke="#777f73" strokeWidth="2" strokeLinecap="round" />
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
            <path d="M1021 764V740L1036 748V764ZM1047 764V727L1062 735V764ZM1073 764V744L1088 751V764ZM1099 764V720L1114 728V764ZM1125 764V735L1140 742V764ZM1151 764V747L1166 754V764ZM1177 764V730L1192 738V764Z" fill="#8ea28a" opacity=".8" />
            <circle cx="790" cy="807" r="5" fill="#d9b45a" />
            <text x="807" y="811" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="8" letterSpacing="1" fill="#aeb4a8">AUDIO</text>
            <circle cx="1164" cy="807" r="10" fill="#262d29" stroke="#879083" strokeWidth="2" />
            <circle cx="1200" cy="807" r="10" fill="#262d29" stroke="#879083" strokeWidth="2" />
          </g>

          <g>
            <rect x="790" y="838" width="432" height="52" rx="14" fill="#151a17" stroke="#414941" strokeWidth="3" />
            {[850, 1006, 1162].map((x) => (
              <g key={x}>
                <circle cx={x} cy="864" r="19" fill="#0a0e0d" stroke="url(#metal)" strokeWidth="4" />
                <circle cx={x} cy="864" r="11" fill="#29312c" stroke="#59635a" strokeWidth="2" />
                <path d={`M${x} 864V853`} stroke="#d9b45a" strokeWidth="3" strokeLinecap="round" />
              </g>
            ))}
            <text x="850" y="887" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="7" letterSpacing="1" fill="#a5ad9e">FAN</text>
            <text x="1006" y="887" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="7" letterSpacing="1" fill="#a5ad9e">TEMP</text>
            <text x="1162" y="887" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="7" letterSpacing="1" fill="#a5ad9e">AIR</text>
          </g>

          <path d="M1265 730Q1380 714 1510 740V830Q1370 812 1265 840Z" fill="#171c19" stroke="#39413a" strokeWidth="3" />
          <path d="M1300 752Q1380 740 1470 755" fill="none" stroke="#62695f" strokeOpacity=".55" strokeWidth="2" />
          <g>
            <ellipse cx="470" cy="905" rx="150" ry="124" fill="none" stroke="#090d0c" strokeWidth="28" />
            <ellipse cx="470" cy="905" rx="150" ry="124" fill="none" stroke="#59615a" strokeWidth="7" />
            <path d="M470 786V880M350 856 447 900M590 856 493 900" fill="none" stroke="#252c28" strokeWidth="20" strokeLinecap="round" />
            <path d="M470 794V879M359 858 449 899M581 858 491 899" fill="none" stroke="#71786d" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round" />
            <circle cx="470" cy="900" r="31" fill="#141916" stroke="url(#metal)" strokeWidth="5" />
            <circle cx="470" cy="900" r="17" fill="#2d342e" />
            <text x="470" y="904" textAnchor="middle" fontFamily="DM Serif Display, serif" fontWeight="700" fontSize="13" fill="#d9b45a">T</text>
          </g>
          <path d="M420 180H560L330 560H240Z" fill="#fff" opacity=".045" />
        </svg>
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
      </div>
    </div>
  )
}

function FeatureCards() {
  return (
    <section className="stk">
      <div className="section-intro">
        <span className="eyebrow">A useful estimate, not a promise</span>
        <h2>Two models.<br />One honest view.</h2>
      </div>
      <div className="cd">
        <i>01</i>
        <div><h3>Choose any route</h3><p>Explore the city zone by zone, from JFK to the neighborhood around the corner.</p></div>
      </div>
      <div className="cd">
        <i>02</i>
        <div><h3>Set your departure</h3><p>Time, weekday and seasonal conditions shape the duration estimate.</p></div>
      </div>
      <div className="cd">
        <i>03</i>
        <div><h3>Compare both fleets</h3><p>See separate Yellow and Green estimates for the same trip and time.</p></div>
      </div>
      <a className="text-link" href="#model">Open the trip estimator <span aria-hidden="true">→</span></a>
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
      <div className="docs-heading">
        <span className="eyebrow">MODEL NOTES · NYC TLC 2025</span>
        <h1>Built for a better<br />informed ride.</h1>
        <p>A transparent look at the data, the two-stage pipeline and what the numbers do—and do not—say.</p>
      </div>
      <div className="dw">
        <aside className="fc">
          <small>ON THIS PAGE</small>
          <ol>{sections.map((section) => <li key={section.id}><button type="button" className={active === section.id ? 'on' : ''} onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' })}>{section.label}</button></li>)}</ol>
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

function HomePage() {
  return <main id="home"><CityScene /><FeatureCards /></main>
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [loading, setLoading] = useState(true)
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneError, setZoneError] = useState('')

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
        window.scrollTo({ top: 0, behavior: 'instant' })
        setLoading(false)
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
      {page === 'home' && <HomePage />}
      {page === 'model' && <EstimatorPage zones={zones} zoneError={zoneError} />}
      {page === 'docs' && <DocsPage />}
      {page !== 'model' && <footer>NYC TLC 2025 data <span>·</span> two-stage LightGBM <span>·</span> Estimates are not fare quotes</footer>}
    </>
  )
}

export default App
