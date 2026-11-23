// Dashboard radio: real New York internet radio from the free Radio Browser directory (https://www.radio-browser.info,
// no API key, CORS-enabled). Live stations have no "tracks", so Next moves to the next station.

export interface Station {
  name: string
  url: string
  tags: string
  frequency: string
}

export interface RadioState {
  on: boolean
  loading: boolean
  station: Station | null
  index: number
  count: number
  error: string
}

type Listener = (state: RadioState) => void

const MIRRORS = ['de1', 'de2', 'nl1', 'at1', 'fi1'].map((host) => `https://${host}.api.radio-browser.info`)
const QUERY = '/json/stations/search?countrycode=US&state=New%20York&hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=80'
const BLOCKED = /erotic|sex|adult|xxx|nsfw/i
const PLAYABLE = /^(mp3|aac|aac\+)$/i

// NYC public radio, used if the directory can't be reached
const FALLBACK: Station[] = [
  { name: 'WNYC 93.9 FM', url: 'https://fm939.wnyc.org/wnycfm', tags: 'news, talk', frequency: 'FM 93.9' },
  { name: 'WQXR 105.9 FM', url: 'https://stream.wqxr.org/wqxr', tags: 'classical', frequency: 'FM 105.9' },
]

// a believable dial position: use one from the name if present, otherwise derive a stable one
function frequencyFor(name: string) {
  const match = name.match(/\b(8[89]|9\d|10\d)[.,](\d)\b/)
  if (match) return `FM ${match[1]}.${match[2]}`
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `FM ${88 + (hash % 20)}.${(hash >> 5) % 2 ? 1 : 5}`
}

async function fetchStations(signal?: AbortSignal): Promise<Station[]> {
  for (const mirror of MIRRORS) {
    try {
      const response = await fetch(mirror + QUERY, { signal })
      if (!response.ok) continue
      const rows = await response.json() as { name: string; url_resolved: string; codec: string; tags: string; lastcheckok: number }[]
      const seen = new Set<string>()
      const stations = rows
        .filter((row) => row.lastcheckok === 1 && row.url_resolved.startsWith('https://') && PLAYABLE.test(row.codec) && !BLOCKED.test(`${row.name} ${row.tags}`))
        .filter((row) => { const key = row.name.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true })
        .slice(0, 20)
        .map((row) => ({ name: row.name.trim(), url: row.url_resolved, tags: row.tags.split(',').slice(0, 3).join(', '), frequency: frequencyFor(row.name) }))
      if (stations.length) return [...FALLBACK, ...stations]
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
    }
  }
  return FALLBACK
}

export function createRadio(volume = 0.6) {
  const audio = new Audio()
  audio.preload = 'none'
  audio.volume = volume
  let stations: Station[] = []
  let loadingList: Promise<Station[]> | null = null
  let state: RadioState = { on: false, loading: false, station: null, index: 0, count: 0, error: '' }
  const listeners = new Set<Listener>()
  const emit = (patch: Partial<RadioState>) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener(state))
  }

  const list = () => (loadingList ??= fetchStations().then((result) => { stations = result; emit({ count: result.length }); return result }))

  let failures = 0
  const tune = async (index: number) => {
    const all = await list()
    if (!state.on) return
    const i = ((index % all.length) + all.length) % all.length
    const station = all[i]
    emit({ loading: true, station, index: i, error: '' })
    audio.src = station.url
    try {
      await audio.play()
      failures = 0
      emit({ loading: false })
    } catch {
      // stream refused or offline: skip ahead, but give up after a full lap
      failures += 1
      if (failures < all.length && state.on) void tune(i + 1)
      else emit({ on: false, loading: false, error: 'No station could be played right now.' })
    }
  }

  audio.addEventListener('playing', () => emit({ loading: false }))
  audio.addEventListener('waiting', () => emit({ loading: true }))
  audio.addEventListener('error', () => { if (state.on && audio.src) void tune(state.index + 1) })

  return {
    subscribe(listener: Listener) {
      listeners.add(listener)
      listener(state)
      return () => { listeners.delete(listener) }
    },
    /** Load the station list ahead of time (optional). */
    preload() { void list() },
    power() {
      if (state.on) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        emit({ on: false, loading: false })
      } else {
        emit({ on: true, error: '' })
        void tune(state.index)
      }
    },
    next() {
      if (!state.on) { emit({ on: true, error: '' }) }
      void tune(state.index + (state.station ? 1 : 0))
    },
    setVolume(next: number) { audio.volume = Math.min(1, Math.max(0, next)) },
    getState: () => state,
    getStations: () => stations,
    dispose() {
      listeners.clear()
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    },
  }
}

export type Radio = ReturnType<typeof createRadio>
