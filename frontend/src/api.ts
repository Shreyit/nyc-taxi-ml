import type { PredictionPair, PredictionRequest, Zone } from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init)
  } catch {
    throw new Error('Cannot reach the model service. Check that the API is running and try again.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail ?? `Model service returned HTTP ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export function getZones(signal?: AbortSignal) {
  return request<Zone[]>('/api/zones', { signal })
}

export function getPrediction(input: PredictionRequest, signal?: AbortSignal) {
  return request<PredictionPair>('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
}
