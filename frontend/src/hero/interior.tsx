// Surface textures for the cab interior: tiling alpha maps (light/dark speckle) laid over the flat fills.
const DASH_TOP = 'M0 558C230 526 415 528 610 550C790 570 810 570 990 550C1185 528 1370 526 1600 558'

export function InteriorDefs() {
  return (
    <>
      <pattern id="tex-vinyl" width="96" height="96" patternUnits="userSpaceOnUse">
        <image href="/hero/vinyl.png" width="96" height="96" />
      </pattern>
      <pattern id="tex-fabric" width="120" height="120" patternUnits="userSpaceOnUse">
        <image href="/hero/fabric.png" width="120" height="120" />
      </pattern>
      <pattern id="tex-leather" width="72" height="72" patternUnits="userSpaceOnUse">
        <image href="/hero/leather.png" width="72" height="72" />
      </pattern>
      <linearGradient id="dash-sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".07" />
        <stop offset=".12" stopColor="#fff" stopOpacity="0" />
        <stop offset=".7" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".35" />
      </linearGradient>
      <radialGradient id="cabin-shade" cx=".5" cy=".42" r=".75">
        <stop offset=".55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".4" />
      </radialGradient>
    </>
  )
}

// Headliner and A-pillars: woven fabric grain and a soft falloff toward the corners.
export function HeadlinerTexture() {
  const frame = 'M0 0H1600V900H0ZM330 170H1270L1360 560H240Z'
  return (
    <g aria-hidden="true">
      <path fillRule="evenodd" d={frame} fill="url(#tex-fabric)" opacity=".3" />
      <path fillRule="evenodd" d={frame} fill="url(#cabin-shade)" />
      <path d="M318 178 232 548M1282 178 1368 548" fill="none" stroke="#000" strokeOpacity=".35" strokeWidth="5" />
    </g>
  )
}

// Dashboard top: pebbled vinyl, a moulded sheen and a stitched seam following the curve.
export function DashTexture() {
  const body = `${DASH_TOP}V1000H0Z`
  return (
    <g aria-hidden="true">
      <path d={body} fill="url(#tex-vinyl)" opacity=".45" />
      <path d={body} fill="url(#dash-sheen)" />
      <path d={DASH_TOP} transform="translate(0 22)" fill="none" stroke="#000" strokeOpacity=".45" strokeWidth="2.5" />
      <path d={DASH_TOP} transform="translate(0 20)" fill="none" stroke="#a8ab98" strokeOpacity=".38" strokeWidth="1.3" strokeDasharray="7 5" strokeLinecap="round" />
    </g>
  )
}

// Fine grain on a moulded panel (instrument binnacle, glovebox, console).
export function PanelGrain({ x, y, width, height, rx }: { x: number; y: number; width: number; height: number; rx: number }) {
  return <rect x={x} y={y} width={width} height={height} rx={rx} fill="url(#tex-vinyl)" opacity=".35" aria-hidden="true" />
}

// Leather wrap and stitching on the steering wheel rim.
export function WheelLeather() {
  return (
    <g aria-hidden="true">
      <ellipse cx="470" cy="905" rx="150" ry="124" fill="none" stroke="url(#tex-leather)" strokeWidth="28" opacity=".7" />
      <ellipse cx="470" cy="905" rx="140" ry="114" fill="none" stroke="#000" strokeOpacity=".35" strokeWidth="2" />
      <ellipse cx="470" cy="905" rx="141.5" ry="115.5" fill="none" stroke="#b9bca9" strokeOpacity=".3" strokeWidth="1" strokeDasharray="4 4" />
    </g>
  )
}
