// The glass itself: ceramic frit border, shade band, mirror-mount patch, dust that the wipers have cleared,
// a faint reflection of the dashboard, and a TLC sticker seen from the back.
const GLASS = 'M330 170H1270L1360 560H240Z'
const PIVOT_Y = 556

const wipedSector = (px: number, inner = 138, outer = 384, sweep = 112) => {
  const at = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180
    return `${(px - r * Math.cos(a)).toFixed(1)} ${(PIVOT_Y - r * Math.sin(a)).toFixed(1)}`
  }
  return `M${at(outer, 0)}A${outer} ${outer} 0 0 1 ${at(outer, sweep)}L${at(inner, sweep)}A${inner} ${inner} 0 0 0 ${at(inner, 0)}Z`
}

export function WindscreenGlass() {
  return (
    <g aria-hidden="true">
      <defs>
        <pattern id="frit-dots-l" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.5" fill="#070908" />
        </pattern>
        <pattern id="frit-dots-s" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r=".75" fill="#070908" opacity=".8" />
        </pattern>
        <pattern id="tex-dust" width="256" height="256" patternUnits="userSpaceOnUse">
          <image href="/hero/dust.png" width="256" height="256" />
        </pattern>
        <linearGradient id="shade-band" x1="0" y1="170" x2="0" y2="250" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1d4846" stopOpacity=".55" />
          <stop offset="1" stopColor="#1d4846" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="glass-curve" x1="240" y1="0" x2="1360" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#000" stopOpacity=".28" />
          <stop offset=".14" stopColor="#000" stopOpacity="0" />
          <stop offset=".86" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".28" />
        </linearGradient>
        <linearGradient id="dash-reflect" x1="0" y1="470" x2="0" y2="560" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d9dccf" stopOpacity="0" />
          <stop offset="1" stopColor="#d9dccf" stopOpacity=".08" />
        </linearGradient>
        <radialGradient id="meter-reflect" cx="994" cy="530" r="120" gradientUnits="userSpaceOnUse" gradientTransform="translate(994 530) scale(1 .3) translate(-994 -530)">
          <stop offset="0" stopColor="#f2d77e" stopOpacity=".12" />
          <stop offset="1" stopColor="#f2d77e" stopOpacity="0" />
        </radialGradient>
        <mask id="wiped" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900">
          <rect width="1600" height="900" fill="#fff" />
          <path d={wipedSector(520)} fill="#000" fillOpacity=".65" />
          <path d={wipedSector(930)} fill="#000" fillOpacity=".65" />
        </mask>
      </defs>
      <g clipPath="url(#windscreen)">
        <path d={GLASS} fill="url(#glass-curve)" />
        <path d={GLASS} fill="url(#shade-band)" />
        <path d={GLASS} fill="url(#tex-dust)" mask="url(#wiped)" opacity=".38" />
        <path d={GLASS} fill="url(#dash-reflect)" />
        <ellipse cx="994" cy="530" rx="120" ry="36" fill="url(#meter-reflect)" />
        {/* ceramic frit: solid edge, then dots that thin out toward the clear glass */}
        <path d={GLASS} fill="none" stroke="url(#frit-dots-s)" strokeWidth="44" />
        <path d={GLASS} fill="none" stroke="url(#frit-dots-l)" strokeWidth="32" />
        <path d={GLASS} fill="none" stroke="#070908" strokeWidth="20" />
        <path d="M752 170H848L838 204Q800 214 762 204Z" fill="#070908" />
        <path d="M740 170H860L846 214Q800 226 754 214Z" fill="url(#frit-dots-l)" />
        <rect x="782" y="186" width="36" height="12" rx="3" fill="#121614" stroke="#2a312c" />
        <g transform="translate(1262 492) rotate(-2)">
          <rect width="44" height="30" rx="3" fill="#cfcabb" opacity=".72" />
          <path d="M6 9H38M6 15H30M6 21H34" stroke="#8d897c" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
        </g>
      </g>
    </g>
  )
}
