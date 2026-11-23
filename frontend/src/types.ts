export type Page = 'home' | 'model' | 'docs'

export interface Zone {
  location_id: number
  borough: string
  zone: string
  display_name: string
  lat: number
  lon: number
}

export interface PredictionRequest {
  pickup_zone: number
  dropoff_zone: number
  pickup_at: string
  taxi_type: 'Yellow' | 'Green'
}

export interface Prediction {
  duration_min: number
  duration_range: [number, number]
  fare_amount: number
  fare_range: [number, number]
  pu_zone: number
  pu_name: string
  pu_coords: [number, number]
  do_zone: number
  do_name: string
  do_coords: [number, number]
  is_airport: boolean
  is_rush_hour: boolean
  cross_borough: boolean
  taxi_type: string
}

export interface PredictionPair {
  selected: Prediction
  comparison: Prediction
}
