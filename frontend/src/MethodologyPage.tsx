import { useEffect, useRef, useState } from 'react'
import './Methodology.css'
import { gsap, reducedMotion, revealOnScroll, scrollToElement } from './motion'

// All numbers come from the project notebook (notebooks/nyc_taxi_trip_duration.ipynb) and docs/report.md.

type Fleet = 'yellow' | 'green'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'data', label: 'Data' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'split', label: 'Split' },
  { id: 'models', label: 'Models' },
  { id: 'question', label: 'Taxi type' },
  { id: 'drivers', label: 'What matters' },
  { id: 'limits', label: 'Limits' },
] as const

const CLEANING: { step: string; yellow: number; green: number; why: string }[] = [
  { step: 'Raw trips', yellow: 48_722_602, green: 591_375, why: 'Every 2025 trip in the 24 monthly TLC files.' },
  { step: 'Pickup in file month', yellow: 48_722_388, green: 591_127, why: 'Some rows had dates from other months, even 2007.' },
  { step: 'Duration 1–180 min', yellow: 47_612_696, green: 566_679, why: 'Removes meters left running and negative times.' },
  { step: 'Known zones', yellow: 47_271_764, green: 562_059, why: 'Zones 264 and 265 mean “unknown”.' },
  { step: 'Fare $0–500', yellow: 44_511_604, green: 559_036, why: 'Zero or negative fares are cancelled or refunded trips.' },
  { step: 'No duplicates', yellow: 44_511_603, green: 559_036, why: 'Exact copies of the same trip.' },
]

const PIPELINE = [
  { id: 'features', kicker: 'INPUT', title: 'Pre-trip features', body: '42 inputs known when the taxi is hailed: pickup and drop-off zone, distance between zone centres, hour, weekday, month, holidays, hourly weather, taxi type and route history from earlier months.' },
  { id: 'duration', kicker: 'STAGE 01', title: 'Trip duration', body: 'A LightGBM model predicts minutes. On November–December, trips it never saw, it is off by 4.63 minutes on average, 0.6 minutes better than the route’s past average.' },
  { id: 'fare', kicker: 'STAGE 02', title: 'Metered fare', body: 'A second LightGBM uses the same inputs plus the predicted duration. Trained on out-of-fold durations so it learns realistic inputs. Off by $5.04 on average; $3.66 if the real duration were known.' },
] as const

const INPUTS: { name: string; group: string; ok: boolean; why: string }[] = [
  { name: 'Pickup & drop-off zone', group: 'Location', ok: true, why: 'Chosen by the rider before the trip.' },
  { name: 'Distance between zones', group: 'Location', ok: true, why: 'Computed from the zone map, not the meter.' },
  { name: 'Hour, weekday, month', group: 'Time', ok: true, why: 'Known from the pickup time.' },
  { name: 'Holiday, rush hour', group: 'Time', ok: true, why: 'Known from the calendar.' },
  { name: 'Hourly weather', group: 'Weather', ok: true, why: 'Weather at the pickup hour.' },
  { name: 'Route history', group: 'History', ok: true, why: 'Averages from earlier months only, never the future.' },
  { name: 'Taxi type', group: 'Fleet', ok: true, why: 'Yellow or Green is known when you hail.' },
  { name: 'Metered distance', group: 'After trip', ok: false, why: 'Only known once the meter stops.' },
  { name: 'Drop-off time', group: 'After trip', ok: false, why: 'It is the answer we are predicting.' },
  { name: 'Tips, tolls, surcharges', group: 'After trip', ok: false, why: 'Added during or after the ride.' },
  { name: 'Whole-year averages', group: 'After trip', ok: false, why: 'Would let January “see” December’s traffic.' },
  { name: 'Passenger count', group: 'Dropped', ok: false, why: 'Missing in 24% of Yellow trips and typed by hand.' },
]

const MODELS = {
  duration: {
    unit: 'min',
    rows: [
      { name: 'Overall median', value: 9.48, base: true },
      { name: 'Route median', value: 5.39, base: true },
      { name: 'Route history', value: 5.08, base: true },
      { name: 'KNN (FAISS)', value: 5.08 },
      { name: 'Linear Regression', value: 5.04 },
      { name: 'Decision Tree', value: 4.5 },
      { name: 'Random Forest', value: 4.42 },
      { name: 'XGBoost', value: 4.38 },
      { name: 'LightGBM', value: 4.37, best: true },
      { name: 'HistGradientBoosting', value: 4.36 },
    ],
  },
  fare: {
    unit: '$',
    rows: [
      { name: 'Overall median', value: 10.0, base: true },
      { name: 'Linear Regression', value: 4.59 },
      { name: 'Route fare history', value: 4.35, base: true },
      { name: 'Random Forest', value: 4.03 },
      { name: 'XGBoost', value: 3.98 },
      { name: 'LightGBM', value: 3.93, best: true },
    ],
  },
} as const

const RESEARCH = [
  { code: 'C1', label: 'Together, knows taxi type', yellow: 4.72, green: 4.39, best: true },
  { code: 'C2', label: 'Together, no taxi type', yellow: 4.74, green: 4.47 },
  { code: 'A/B', label: 'Own taxi type only', yellow: 4.77, green: 4.44 },
  { code: 'D/E', label: 'Other taxi type only', yellow: 5.64, green: 4.94 },
]

const DRIVERS = [
  { name: 'Route history', value: 4.5, note: 'How long this route took in earlier months' },
  { name: 'Distance between zones', value: 1.8, note: 'Straight line between zone centres' },
  { name: 'Hour (cyclical)', value: 0.7, note: 'Time-of-day traffic waves' },
  { name: 'Weekday', value: 0.4, note: 'Weekday vs weekend patterns' },
  { name: 'Hour', value: 0.2, note: '' },
  { name: 'Taxi type', value: 0.12, note: 'Yellow or Green' },
]

const fmt = (n: number) => n.toLocaleString('en-US')

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" className={value === key ? 'on' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>
      ))}
    </div>
  )
}

function CountUp({ to, decimals = 0, prefix = '', suffix = '' }: { to: number; decimals?: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const render = (v: number) => { el.textContent = `${prefix}${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}` }
    if (reducedMotion()) { render(to); return }
    render(0)
    const state = { v: 0 }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      gsap.to(state, { v: to, duration: 1.6, ease: 'power3.out', onUpdate: () => render(state.v) })
    }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [to, decimals, prefix, suffix])
  return <span ref={ref} />
}

function Bars({ rows, max, format, highlight }: { rows: { label: string; value: number; tone?: 'best' | 'base' | 'warn'; hint?: string }[]; max: number; format: (v: number) => string; highlight?: string }) {
  return (
    <div className="bars">
      {rows.map((row, index) => (
        <div className={`bar-row ${row.tone ?? ''}${highlight === row.label ? ' hl' : ''}`} key={row.label} style={{ '--i': index } as React.CSSProperties} title={row.hint}>
          <span className="bar-label">{row.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} /></span>
          <span className="bar-value">{format(row.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function MethodologyPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string>('overview')
  const [cleanFleet, setCleanFleet] = useState<Fleet>('yellow')
  const [cleanPick, setCleanPick] = useState(0)
  const [stage, setStage] = useState<(typeof PIPELINE)[number]['id']>('duration')
  const [input, setInput] = useState(INPUTS[0].name)
  const [target, setTarget] = useState<'duration' | 'fare'>('duration')
  const [rqFleet, setRqFleet] = useState<Fleet>('green')

  useEffect(() => (headingRef.current ? revealOnScroll(headingRef.current) : undefined), [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in')
          setActive((entry.target as HTMLElement).id)
        }
      })
    }, { threshold: 0.25 })
    root.querySelectorAll('.doc-section').forEach((section) => io.observe(section))
    return () => io.disconnect()
  }, [])

  const raw = CLEANING[0][cleanFleet]
  const picked = CLEANING[cleanPick]
  const kept = picked[cleanFleet]
  const prev = cleanPick > 0 ? CLEANING[cleanPick - 1][cleanFleet] : kept
  const stageInfo = PIPELINE.find((p) => p.id === stage) ?? PIPELINE[0]
  const inputInfo = INPUTS.find((i) => i.name === input) ?? INPUTS[0]
  const model = MODELS[target]
  const money = target === 'fare'

  return (
    <main id="docs" className="docs-page methodology">
      <div className="docs-heading" ref={headingRef}>
        <span className="eyebrow" data-reveal>MODEL NOTES · NYC TLC 2025</span>
        <h1 data-reveal>Built for a better<br />informed ride.</h1>
        <p data-reveal>How the estimate is made, tested and limited. Click, toggle and hover: every chart uses the project’s real results.</p>
      </div>
      <div className="dw">
        <aside className="fc">
          <small>ON THIS PAGE</small>
          <ol>
            {SECTIONS.map((section, index) => (
              <li key={section.id}>
                <button type="button" className={active === section.id ? 'on' : ''} onClick={() => { const el = document.getElementById(section.id); if (el) scrollToElement(el) }}>
                  <i>{String(index + 1).padStart(2, '0')}</i>{section.label}
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="dc" ref={rootRef}>
          <section id="overview" className="doc-section">
            <span className="eyebrow">01 / OVERVIEW</span>
            <h2><span className="hm"><span>What the estimate means</span></span></h2>
            <p>The service returns a trip duration and a metered fare. Duration is predicted first; that prediction is then passed into the fare model. Both use only what is known when the taxi is hailed.</p>
            <div className="stats">
              <div className="stat"><b><CountUp to={45.07} decimals={2} suffix="M" /></b><span>clean 2025 trips</span></div>
              <div className="stat"><b><CountUp to={263} /></b><span>taxi zones</span></div>
              <div className="stat y"><b><CountUp to={4.63} decimals={2} suffix=" min" /></b><span>average duration error</span></div>
              <div className="stat d"><b><CountUp to={5.04} decimals={2} prefix="$" /></b><span>average fare error</span></div>
            </div>
          </section>

          <section id="data" className="doc-section">
            <span className="eyebrow">02 / DATA</span>
            <h2><span className="hm"><span>From 49.3M records to 45.07M trips</span></span></h2>
            <p>Every Yellow and Green trip of 2025 from the NYC Taxi &amp; Limousine Commission, plus taxi zones, Central Park hourly weather and public holidays. Broken records were removed one rule at a time.</p>
            <div className="panel">
              <div className="panel-head">
                <strong>Cleaning waterfall</strong>
                <Segmented label="Taxi type" value={cleanFleet} onChange={setCleanFleet} options={[['yellow', 'Yellow'], ['green', 'Green']]} />
              </div>
              <div className="waterfall">
                {CLEANING.map((row, index) => (
                  <button type="button" key={row.step} className={`wf-col ${cleanFleet}${cleanPick === index ? ' on' : ''}`} onClick={() => setCleanPick(index)} onMouseEnter={() => setCleanPick(index)} style={{ '--i': index } as React.CSSProperties}>
                    <span className="wf-bar" style={{ height: `${Math.max(6, ((row[cleanFleet] - raw * 0.88) / (raw * 0.12)) * 100)}%` }} />
                    <small>{row.step}</small>
                  </button>
                ))}
              </div>
              <p className="panel-note"><b>{picked.step}:</b> {fmt(kept)} trips left{cleanPick > 0 && <> (−{fmt(prev - kept)})</>}. {picked.why}</p>
              <p className="panel-foot">The axis starts at 88% of raw trips so small steps are visible. Kept overall: {cleanFleet === 'yellow' ? '91.4%' : '94.5%'}.</p>
            </div>
          </section>

          <section id="pipeline" className="doc-section">
            <span className="eyebrow">03 / PIPELINE</span>
            <h2><span className="hm"><span>Two stages, in sequence</span></span></h2>
            <p>Fare depends heavily on how long the ride takes, so the fare model is given the predicted duration. Click a stage to see what it does.</p>
            <div className="pipe">
              {PIPELINE.map((node, index) => (
                <div className="pipe-step" key={node.id}>
                  <button type="button" className={`pipe-node ${node.id}${stage === node.id ? ' on' : ''}`} onClick={() => setStage(node.id)} aria-pressed={stage === node.id}>
                    <small>{node.kicker}</small><strong>{node.title}</strong>
                  </button>
                  {index < PIPELINE.length - 1 && <span className="pipe-link" aria-hidden="true"><i /><i /><i /></span>}
                </div>
              ))}
            </div>
            <div className="panel detail" key={stageInfo.id}>
              <small>{stageInfo.kicker}</small>
              <strong>{stageInfo.title}</strong>
              <p>{stageInfo.body}</p>
            </div>
          </section>

          <section id="inputs" className="doc-section">
            <span className="eyebrow">04 / INPUTS</span>
            <h2><span className="hm"><span>No peeking at the future</span></span></h2>
            <p>An input is only allowed if it is known before the ride starts. Click any item to see why it is in or out.</p>
            <div className="leak">
              <div>
                <span className="leak-title ok">Allowed · before the trip</span>
                <div className="chips">{INPUTS.filter((i) => i.ok).map((i) => <button type="button" key={i.name} className={`chip ok${input === i.name ? ' on' : ''}`} onClick={() => setInput(i.name)}>{i.name}</button>)}</div>
              </div>
              <div>
                <span className="leak-title no">Blocked · after the trip or unreliable</span>
                <div className="chips">{INPUTS.filter((i) => !i.ok).map((i) => <button type="button" key={i.name} className={`chip no${input === i.name ? ' on' : ''}`} onClick={() => setInput(i.name)}>{i.name}</button>)}</div>
              </div>
            </div>
            <div className={`panel verdict ${inputInfo.ok ? 'ok' : 'no'}`} key={inputInfo.name}>
              <span className="verdict-mark" aria-hidden="true">{inputInfo.ok ? '✓' : '✕'}</span>
              <div><strong>{inputInfo.name}</strong><small>{inputInfo.group}</small><p>{inputInfo.why}</p></div>
            </div>
          </section>

          <section id="split" className="doc-section">
            <span className="eyebrow">05 / SPLIT</span>
            <h2><span className="hm"><span>Learn from the past, test on the future</span></span></h2>
            <p>The data is split by month, not at random, because in real use we always predict trips that haven’t happened yet. The test months were used only once, at the very end.</p>
            <div className="timeline">
              {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m, i) => (
                <span key={i} className={`tl-month ${i < 8 ? 'train' : i < 10 ? 'val' : 'test'}`} style={{ '--i': i } as React.CSSProperties}>{m}</span>
              ))}
            </div>
            <div className="tl-legend">
              <span className="train"><i />Train · Jan–Aug</span>
              <span className="val"><i />Validate · Sep–Oct</span>
              <span className="test"><i />Test · Nov–Dec</span>
            </div>
            <p className="panel-foot">Training used 1M Yellow trips and every Green trip (1.38M in total, 27% Green), so the model learns Green taxis too.</p>
          </section>

          <section id="models" className="doc-section">
            <span className="eyebrow">06 / MODELS</span>
            <h2><span className="hm"><span>Ten approaches, one winner</span></span></h2>
            <p>Simple guesses set the bar to beat; then seven machine-learning models were compared on September–October. Lower is better.</p>
            <div className="panel">
              <div className="panel-head">
                <strong>Average error on validation</strong>
                <Segmented label="Target" value={target} onChange={setTarget} options={[['duration', 'Duration'], ['fare', 'Fare']]} />
              </div>
              <Bars
                key={target}
                max={model.rows[0].value}
                format={(v) => (money ? `$${v.toFixed(2)}` : `${v.toFixed(2)} min`)}
                rows={model.rows.map((r) => ({ label: r.name, value: r.value, tone: 'best' in r && r.best ? 'best' : 'base' in r && r.base ? 'base' : undefined }))}
              />
              <p className="panel-foot">Grey bars are baselines. LightGBM was chosen: as accurate as the best model and about 3.7× faster to train than HistGradientBoosting.</p>
            </div>
          </section>

          <section id="question" className="doc-section">
            <span className="eyebrow">07 / RESEARCH QUESTION</span>
            <h2><span className="hm"><span>Does knowing the taxi type help?</span></span></h2>
            <p>The duration model was trained four ways and tested on November–December. One shared model that knows the taxi type is best for both fleets; a model trained on the other fleet does badly.</p>
            <div className="panel">
              <div className="panel-head">
                <strong>Test error by setup</strong>
                <Segmented label="Fleet" value={rqFleet} onChange={setRqFleet} options={[['yellow', 'Yellow'], ['green', 'Green']]} />
              </div>
              <Bars
                key={rqFleet}
                max={5.8}
                format={(v) => `${v.toFixed(2)} min`}
                rows={RESEARCH.map((r) => ({ label: `${r.code} · ${r.label}`, value: r[rqFleet], tone: r.best ? 'best' : r.code === 'D/E' ? 'warn' : undefined }))}
              />
              <p className="panel-foot">{rqFleet === 'green' ? 'Green gains the most from knowing its type: 4.47 → 4.39 min.' : 'Yellow gains a little: 4.74 → 4.72 min.'}</p>
            </div>
          </section>

          <section id="drivers" className="doc-section">
            <span className="eyebrow">08 / WHAT MATTERS</span>
            <h2><span className="hm"><span>Where you go beats when you go</span></span></h2>
            <p>Shuffle one input and see how much worse the error gets: the bigger the jump, the more the model relies on it. This shows what the model uses, not what causes delays.</p>
            <div className="panel">
              <div className="panel-head"><strong>Error increase when shuffled (≈ minutes)</strong></div>
              <Bars max={4.5} format={(v) => `+${v.toFixed(1)}`} rows={DRIVERS.map((d, i) => ({ label: d.name, value: d.value, tone: i === 0 ? 'best' : undefined, hint: d.note }))} />
              <p className="panel-foot">Weather barely registers: one Central Park station can’t describe traffic across the whole city.</p>
            </div>
          </section>

          <section id="limits" className="doc-section">
            <span className="eyebrow">09 / LIMITS</span>
            <h2><span className="hm"><span>An estimate, not a quote</span></span></h2>
            <p>Use it to get a rough idea before a ride, not as a fixed price or a navigation time.</p>
            <div className="limits">
              <div><b>Straight lines</b><span>Routes are drawn between zone centres, not along real roads.</span></div>
              <div><b>Long trips are hard</b><span>Under 20 min: ~3.3 min error. Over an hour: ~18 min.</span></div>
              <div><b>Fare excludes extras</b><span>No tips, tolls, airport fees or surcharges.</span></div>
              <div><b>No live traffic</b><span>Accidents, closures and events are unknown to the model.</span></div>
              <div><b>Thin zones</b><span>Areas with few trips have less history and bigger errors.</span></div>
              <div><b>2025 only</b><span>A new year or new taxi rules would need retraining.</span></div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
