from contextlib import asynccontextmanager
from datetime import datetime
import os
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.serving.predictor import TaxiPredictor

ROOT_DIR = Path(__file__).resolve().parents[1]
NYC = ZoneInfo("America/New_York")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.predictor = TaxiPredictor(root_dir=ROOT_DIR)
    yield


app = FastAPI(
    title="NYC Taxi Estimator API",
    version="1.0.0",
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ZoneResponse(BaseModel):
    location_id: int
    borough: str
    zone: str
    display_name: str
    lat: float
    lon: float


class PredictionRequest(BaseModel):
    pickup_zone: int = Field(gt=0)
    dropoff_zone: int = Field(gt=0)
    pickup_at: datetime
    taxi_type: Literal["Yellow", "Green"]


class PredictionResponse(BaseModel):
    duration_min: float
    duration_range: tuple[float, float]
    fare_amount: float
    fare_range: tuple[float, float]
    pu_zone: int
    pu_name: str
    pu_coords: tuple[float, float]
    do_zone: int
    do_name: str
    do_coords: tuple[float, float]
    is_airport: bool
    is_rush_hour: bool
    cross_borough: bool
    taxi_type: str


class PredictionPair(BaseModel):
    selected: PredictionResponse
    comparison: PredictionResponse


@app.get("/api/health")
def health(request: Request) -> dict[str, str]:
    predictor = getattr(request.app.state, "predictor", None)
    if predictor is None:
        raise HTTPException(status_code=503, detail="Prediction model is not loaded.")
    return {"status": "ok"}


@app.get("/api/zones", response_model=list[ZoneResponse])
def zones(request: Request) -> list[ZoneResponse]:
    predictor: TaxiPredictor = request.app.state.predictor
    rows = predictor.zones.sort_values(["borough", "zone"]).to_dict("records")
    return [
        ZoneResponse(
            location_id=int(row["LocationID"]),
            borough=str(row["borough"]),
            zone=str(row["zone"]),
            display_name=predictor.zone_id_to_name[int(row["LocationID"])],
            lat=float(row["lat"]),
            lon=float(row["lon"]),
        )
        for row in rows
    ]


@app.post("/api/predict", response_model=PredictionPair)
def predict(body: PredictionRequest, request: Request) -> PredictionPair:
    predictor: TaxiPredictor = request.app.state.predictor
    if body.pickup_zone not in predictor.zones_by_id.index:
        raise HTTPException(status_code=422, detail="Unknown pickup taxi zone.")
    if body.dropoff_zone not in predictor.zones_by_id.index:
        raise HTTPException(status_code=422, detail="Unknown drop-off taxi zone.")

    pickup_at = body.pickup_at
    if pickup_at.tzinfo is None:
        pickup_at = pickup_at.replace(tzinfo=NYC)
    else:
        pickup_at = pickup_at.astimezone(NYC)

    selected = predictor.predict(
        pu_zone=body.pickup_zone,
        do_zone=body.dropoff_zone,
        pickup_dt=pickup_at,
        taxi_type=body.taxi_type,
    )
    other_fleet = "Green" if body.taxi_type == "Yellow" else "Yellow"
    comparison = predictor.predict(
        pu_zone=body.pickup_zone,
        do_zone=body.dropoff_zone,
        pickup_dt=pickup_at,
        taxi_type=other_fleet,
    )
    return PredictionPair(selected=selected, comparison=comparison)
