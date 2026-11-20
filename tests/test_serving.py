"""
Smoke tests for the TaxiPredictor serving inference pipeline.
"""

from datetime import datetime
from pathlib import Path
import pytest

from src.serving.predictor import TaxiPredictor

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def predictor():
    return TaxiPredictor(root_dir=ROOT)


def test_predictor_initialization(predictor):
    assert predictor.duration_model is not None
    assert predictor.fare_model is not None
    assert len(predictor.zones) == 263
    assert len(predictor.feature_columns) > 0


def test_predictor_prediction_structure(predictor):
    dt = datetime(2026, 11, 20, 18, 30)
    res = predictor.predict(pu_zone=132, do_zone=230, pickup_dt=dt, taxi_type="yellow")

    assert "duration_min" in res
    assert "fare_amount" in res
    assert "duration_range" in res
    assert "fare_range" in res
    assert res["duration_min"] > 0
    assert res["fare_amount"] > 0
    assert res["pu_coords"][0] < 0  # NYC longitude is negative
    assert res["pu_coords"][1] > 0  # NYC latitude is positive


def test_green_vs_yellow_prediction(predictor):
    dt = datetime(2026, 11, 20, 12, 0)
    res_yellow = predictor.predict(pu_zone=74, do_zone=138, pickup_dt=dt, taxi_type="yellow")
    res_green = predictor.predict(pu_zone=74, do_zone=138, pickup_dt=dt, taxi_type="green")

    assert res_yellow["taxi_type"] == "yellow"
    assert res_green["taxi_type"] == "green"
    assert res_yellow["duration_min"] > 0
    assert res_green["duration_min"] > 0
