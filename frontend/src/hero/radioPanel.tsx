import type { KeyboardEvent, ReactNode } from 'react'
import type { RadioState } from '../radio'

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

// Frequency, station name and on-air status on the dashboard radio screen.
export function RadioDisplay({ state }: { state: RadioState | null }) {
  const on = !!state?.on
  const status = !state || !on ? 'OFF' : state.loading ? 'TUNING…' : 'ON AIR'
  const frequency = state?.station?.frequency ?? 'FM 101.1'
  const name = state?.error || state?.station?.name || 'NEW YORK · LIVE RADIO'
  return (
    <g className={`radio-display${on ? ' on' : ''}`}>
      <text x="787" y="757" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="28" fill="#e1d18f" opacity={on ? 1 : 0.55}>{frequency}</text>
      <text x="787" y="778" fontFamily="Manrope, sans-serif" fontWeight="500" fontSize="10" letterSpacing="1" fill="#a7b3a5">{clip(name.toUpperCase(), 30)}</text>
      <g transform="translate(1207 716)">
        <circle className={state?.loading ? 'radio-tuning' : undefined} cx={-status.length * 6.6 - 8} cy="-3" r="3" fill={status === 'ON AIR' ? '#e5533f' : status === 'OFF' ? '#59625a' : '#d9b45a'} filter={on ? 'url(#led)' : undefined} />
        <text textAnchor="end" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="8.5" letterSpacing="1.5" fill={status === 'OFF' ? '#7d867b' : '#e9dca8'}>{status}</text>
      </g>
    </g>
  )
}

function DashButton({ cx, label, pressed, live, onPress, children }: {
  cx: number; label: string; pressed?: boolean; live: boolean; onPress: () => void; children: ReactNode
}) {
  const onKey = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onPress()
  }
  return (
    <g
      className={`dash-btn${pressed ? ' pressed' : ''}${live ? ' live' : ''}`}
      role="button"
      tabIndex={live ? 0 : -1}
      aria-label={label}
      aria-pressed={pressed}
      aria-hidden={live ? undefined : true}
      onClick={onPress}
      onKeyDown={onKey}
    >
      <title>{label}</title>
      <circle cx={cx} cy="807" r="17" fill="transparent" />
      <circle className="dash-btn-cap" cx={cx} cy="807" r="12.5" fill="#262d29" stroke="#879083" strokeWidth="2" />
      <g className="dash-btn-icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</g>
    </g>
  )
}

// POWER and NEXT STATION, drawn on the radio fascia so they zoom with the dashboard.
export function RadioButtons({ state, live, onPower, onNext }: {
  state: RadioState | null; live: boolean; onPower: () => void; onNext: () => void
}) {
  const on = !!state?.on
  return (
    <g className="radio-buttons">
      <DashButton cx={1164} label={on ? 'Turn radio off' : 'Turn radio on'} pressed={on} live={live} onPress={onPower}>
        <path d="M1160.2 801.6a6 6 0 1 0 7.6 0" />
        <path d="M1164 799v6.5" />
      </DashButton>
      <DashButton cx={1200} label="Next station" live={live} onPress={onNext}>
        <path d="M1194.5 802v10l6-5z" fill="currentColor" />
        <path d="M1200.5 802v10l5-5z" fill="currentColor" />
        <path d="M1206.2 802v10" />
      </DashButton>
    </g>
  )
}
