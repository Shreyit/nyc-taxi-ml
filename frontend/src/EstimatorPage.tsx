import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { AttributionControl, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { getPrediction } from './api'
import type { PredictionPair, PredictionRequest, Zone } from './types'

type Step = 0 | 1 | 2 | 3

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function MapCamera({ pickup, dropoff }: { pickup?: Zone; dropoff?: Zone }) {
  const map = useMap()

  useEffect(() => {
    if (pickup && dropoff) {
      map.fitBounds(
        [[pickup.lat, pickup.lon], [dropoff.lat, dropoff.lon]],
        { padding: [72, 72], maxZoom: 13, animate: true },
      )
    } else if (pickup || dropoff) {
      const zone = pickup ?? dropoff
      if (zone) map.flyTo([zone.lat, zone.lon], 12, { duration: 0.7 })
    } else {
      map.flyTo([40.741, -73.985], 11, { duration: 0.7 })
    }
  }, [map, pickup, dropoff])

  return null
}

function RouteMap({ pickup, dropoff }: { pickup?: Zone; dropoff?: Zone }) {
  const positions = pickup && dropoff
    ? [[pickup.lat, pickup.lon] as [number, number], [dropoff.lat, dropoff.lon] as [number, number]]
    : []

  return (
    <MapContainer
      className="leaflet-map"
      center={[40.741, -73.985]}
      zoom={11}
      minZoom={9}
      maxZoom={18}
      scrollWheelZoom
      zoomControl
      attributionControl={false}
      aria-label="Interactive street map of New York City"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <AttributionControl position="topright" />
      <MapCamera pickup={pickup} dropoff={dropoff} />
      {pickup && (
        <CircleMarker center={[pickup.lat, pickup.lon]} radius={8} pathOptions={{ color: '#fffefa', weight: 3, fillColor: '#537a64', fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -8]}>{`Pickup · ${pickup.zone}`}</Tooltip>
        </CircleMarker>
      )}
      {dropoff && (
        <CircleMarker center={[dropoff.lat, dropoff.lon]} radius={8} pathOptions={{ color: '#fffefa', weight: 3, fillColor: '#a8644d', fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -8]}>{`Drop-off · ${dropoff.zone}`}</Tooltip>
        </CircleMarker>
      )}
      {positions.length === 2 && <Polyline positions={positions} pathOptions={{ color: '#a8644d', weight: 4, opacity: 0.86, dashArray: '9 8' }} />}
    </MapContainer>
  )
}

function StepActions({
  step,
  onBack,
  onNext,
  nextLabel,
  disabled = false,
}: {
  step: Step
  onBack: () => void
  onNext: () => void
  nextLabel: string
  disabled?: boolean
}) {
  return (
    <div className="step-actions">
      {step > 0
        ? <button className="back-step" type="button" onClick={onBack}>← Back</button>
        : <span className="step-spacer" />}
      <button className="next-step" type="button" onClick={onNext} disabled={disabled}>{nextLabel}<span aria-hidden="true">→</span></button>
    </div>
  )
}

function ModelResults({
  prediction,
  fleet,
  loading,
  error,
  onRetry,
  onBack,
  onReset,
}: {
  prediction: PredictionPair | null
  fleet: 'Yellow' | 'Green'
  loading: boolean
  error: string
  onRetry: () => void
  onBack: () => void
  onReset: () => void
}) {
  const selected = prediction?.selected
  const comparison = prediction?.comparison
  const maximumFare = Math.max(selected?.fare_amount ?? 1, comparison?.fare_amount ?? 1)

  return (
    <section className="step-card results-card" aria-label="Trip estimate results">
      <div className="step-content">
        <span className="step-kicker">STEP 04 <i /> YOUR ESTIMATE</span>
        <h1>Your ride,<br />in perspective.</h1>
        {loading && (
          <div className="result-loading" role="status">
            <span className="loading-ring" />
            <div><strong>Calculating both fleets</strong><small>Running the two-stage trip and fare models.</small></div>
          </div>
        )}
        {error && !loading && (
          <div className="error-box" role="alert">
            <strong>We couldn’t complete that estimate.</strong>
            <span>{error}</span>
            <button type="button" onClick={onRetry}>Try again</button>
          </div>
        )}
        {!loading && !error && selected && comparison && (
          <>
            <div className="results-intro">
              <span>{selected.pu_name} <i>to</i> {selected.do_name}</span>
              <small>{selected.is_rush_hour ? 'Peak rush hour' : 'Outside peak rush'}{selected.is_airport ? ' · Airport route' : ''}</small>
            </div>
            <div className="comparison">
              {[selected, comparison].map((item) => (
                <article className={`comparison-row ${item.taxi_type === fleet.toLowerCase() ? 'selected' : ''}`} key={item.taxi_type}>
                  <div className="comparison-heading">
                    <span>{item.taxi_type} cab {item.taxi_type === fleet.toLowerCase() && <small>SELECTED</small>}</span>
                    <strong>{item.duration_min} min</strong>
                  </div>
                  <div className="comparison-meta">
                    <b>${item.fare_amount.toFixed(2)} <span>metered fare</span></b>
                    <span>{item.duration_range[0]}–{item.duration_range[1]} min expected range</span>
                  </div>
                  <div className="comparison-track"><span style={{ width: `${(item.fare_amount / maximumFare) * 100}%` }} /></div>
                </article>
              ))}
            </div>
            <p className="small-note">Metered fare estimate only. Tips, tolls, airport charges and other fees are excluded; actual trips can differ.</p>
          </>
        )}
      </div>
      <div className="step-actions results-actions">
        {selected ? (
          <button className="redo-step" type="button" onClick={onReset}>↺ Start a new estimate</button>
        ) : (
          <>
            <button className="back-step" type="button" onClick={onBack}>← Back</button>
            {!loading && !error && <span className="small-note">Finish the earlier steps to see your result.</span>}
          </>
        )}
      </div>
    </section>
  )
}

export default function EstimatorPage({ zones, zoneError }: { zones: Zone[]; zoneError: string }) {
  const [pickupId, setPickupId] = useState('')
  const [dropoffId, setDropoffId] = useState('')
  const [date, setDate] = useState(localDate)
  const [time, setTime] = useState('18:00')
  const [fleet, setFleet] = useState<'Yellow' | 'Green'>('Yellow')
  const [step, setStep] = useState<Step>(0)
  const [prediction, setPrediction] = useState<PredictionPair | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const pickup = zones.find((zone) => String(zone.location_id) === pickupId)
  const dropoff = zones.find((zone) => String(zone.location_id) === dropoffId)

  useEffect(() => {
    if (step !== 3 || !pickupId || !dropoffId || !date || !time) return
    const controller = new AbortController()
    const request: PredictionRequest = {
      pickup_zone: Number(pickupId),
      dropoff_zone: Number(dropoffId),
      pickup_at: `${date}T${time}:00`,
      taxi_type: fleet,
    }
    const timeout = window.setTimeout(() => {
      getPrediction(request, controller.signal)
        .then(setPrediction)
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setPrediction(null)
            setError(cause instanceof Error ? cause.message : 'Prediction request failed.')
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 140)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [step, pickupId, dropoffId, date, time, fleet, attempt])

  const serviceStatus = zoneError
    ? 'API unavailable'
    : error
      ? 'Prediction error'
      : loading
        ? 'Calculating'
        : prediction
          ? 'Model connected'
          : 'Ready when you are'

  const selectPreset = (pickupZone: string, dropoffZone: string) => {
    const start = zones.find((zone) => zone.zone.toLowerCase() === pickupZone.toLowerCase())
      ?? zones.find((zone) => zone.zone.toLowerCase().includes(pickupZone.toLowerCase()))
    const end = zones.find((zone) => zone.zone.toLowerCase().includes(dropoffZone.toLowerCase()))
    if (start) setPickupId(String(start.location_id))
    if (end) setDropoffId(String(end.location_id))
  }

  const startEstimate = () => {
    if (!pickupId || !dropoffId || !date || !time) return
    setPrediction(null)
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
    setStep(3)
  }

  const reset = () => {
    setPickupId('')
    setDropoffId('')
    setDate(localDate())
    setTime('18:00')
    setFleet('Yellow')
    setPrediction(null)
    setLoading(false)
    setError('')
    setAttempt(0)
    setStep(0)
  }

  return (
    <main className="model-page">
      <div className="model-topline">
        <span>LIVE MODEL · TWO-STAGE LIGHTGBM</span>
        <span className={`status${zoneError || error ? ' has-error' : ''}`}><i />{serviceStatus}</span>
      </div>
      <div className="mw">
        <aside className="mp" aria-label="Trip map">
          <RouteMap pickup={pickup} dropoff={dropoff} />
          {step === 3 && !loading && !error && prediction && (
            <div className="route-summary">
              <span className="summary-label">SELECTED TRIP · {fleet.toUpperCase()}</span>
              <strong>{pickup?.zone} <span>to</span> {dropoff?.zone}</strong>
              <div className="rs">
                <div className="pill y"><small>Duration</small><b>{prediction.selected.duration_min} min</b></div>
                <div className="pill"><small>Metered fare</small><b>${prediction.selected.fare_amount.toFixed(2)}</b></div>
              </div>
            </div>
          )}
          {step < 3 && <div className="map-hint">{pickup && dropoff ? 'Route preview · estimate appears after the final step' : 'Choose two taxi zones to preview your route'}</div>}
          {step === 3 && loading && <div className="map-loading" role="status">Calculating your estimate…</div>}
        </aside>
        <div className="pn">
          <div className="steps-viewport">
            <div className="steps-track" style={{ transform: `translateX(-${step * 25}%)` }}>
            <section className="step-card" aria-hidden={step !== 0} inert={step !== 0}>
              <div className="step-content">
                <span className="step-kicker">STEP 01 <i /> ROUTE</span>
                <h1>Where are we<br />headed?</h1>
                {zoneError && <p className="error-box" role="alert">{zoneError}</p>}
                <div className="two">
                  <label>Pickup location<select value={pickupId} onChange={(event) => setPickupId(event.target.value)} disabled={!zones.length} required>
                    <option value="">Select a pickup zone</option>
                    {zones.map((zone) => <option key={zone.location_id} value={zone.location_id}>{zone.display_name}</option>)}
                  </select></label>
                  <label>Drop-off location<select value={dropoffId} onChange={(event) => setDropoffId(event.target.value)} disabled={!zones.length} required>
                    <option value="">Select a drop-off zone</option>
                    {zones.map((zone) => <option key={zone.location_id} value={zone.location_id}>{zone.display_name}</option>)}
                  </select></label>
                </div>
                <div className="route-actions">
                  <button type="button" className="quiet-button" onClick={() => { setPickupId(dropoffId); setDropoffId(pickupId) }} disabled={!pickupId || !dropoffId}>Swap locations</button>
                  <div className="sg" aria-label="Suggested routes">
                    <button type="button" onClick={() => selectPreset('JFK Airport', 'Times Sq')}>JFK to Times Square</button>
                    <button type="button" onClick={() => selectPreset('Penn Station', 'SoHo')}>Penn to SoHo</button>
                    <button type="button" onClick={() => selectPreset('Central Park', 'SoHo')}>Central Park to SoHo</button>
                    <button type="button" onClick={() => selectPreset('Brooklyn Heights', 'Times Sq')}>Brooklyn Heights to Times Square</button>
                    <button type="button" onClick={() => selectPreset('Downtown Brooklyn', 'JFK Airport')}>Downtown Brooklyn to JFK</button>
                    <button type="button" onClick={() => selectPreset('Penn Station', 'Central Park')}>Penn to Central Park</button>
                    </div>
                  </div>
                </div>
              <StepActions step={step} onBack={() => setStep(0)} onNext={() => setStep(1)} nextLabel="Choose departure" disabled={!pickupId || !dropoffId || Boolean(zoneError)} />
            </section>
            <section className="step-card" aria-hidden={step !== 1} inert={step !== 1}>
              <div className="step-content">
                <span className="step-kicker">STEP 02 <i /> DEPARTURE</span>
                <h1>When do you<br />leave?</h1>
                <div className="two">
                  <label>New York date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
                  <label>Local time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
                </div>
                <div className="sg time-presets" aria-label="Departure time shortcuts">
                  {[
                    ['Morning rush', '08:00'],
                    ['Midday', '13:00'],
                    ['Evening rush', '18:00'],
                    ['Late night', '02:00'],
                  ].map(([label, value]) => <button key={value} type="button" className={time === value ? 'on' : ''} onClick={() => setTime(value)}>{label}</button>)}
                </div>
                <p className="small-note">Time is interpreted as local New York time.</p>
              </div>
              <StepActions step={step} onBack={() => setStep(0)} onNext={() => setStep(2)} nextLabel="Choose a fleet" disabled={!date || !time} />
            </section>
            <section className="step-card" aria-hidden={step !== 2} inert={step !== 2}>
              <div className="step-content">
                <span className="step-kicker">STEP 03 <i /> FLEET</span>
                <h1>Choose your<br />cab.</h1>
                <div className="fleet-options" role="group" aria-label="Taxi fleet">
                  {(['Yellow', 'Green'] as const).map((value) => (
                    <button key={value} type="button" className={`fleet-choice ${fleet === value ? 'on' : ''}`} aria-pressed={fleet === value} onClick={() => setFleet(value)}>
                      <span className={`fleet-swatch ${value.toLowerCase()}`} />
                      <span><strong>{value} cab</strong><small>{value === 'Yellow' ? 'Citywide service' : 'Outer boroughs & upper Manhattan'}</small></span>
                      <i>{fleet === value ? '●' : '○'}</i>
                    </button>
                  ))}
                </div>
                <p className="small-note">Weather uses the model’s seasonal baseline for the selected month; live weather is not currently an input.</p>
              </div>
              <StepActions step={step} onBack={() => setStep(1)} onNext={startEstimate} nextLabel="Show my estimate" disabled={!pickupId || !dropoffId || !date || !time || Boolean(zoneError)} />
            </section>
            <ModelResults
              prediction={prediction}
              fleet={fleet}
              loading={loading}
              error={error}
              onRetry={startEstimate}
              onBack={() => { setLoading(false); setStep(2) }}
              onReset={reset}
            />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
