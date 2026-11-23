import pandas as pd
from fastapi.testclient import TestClient

import api.main as api


class FakePredictor:
    zones = pd.DataFrame(
        [
            {"LocationID": 132, "borough": "Queens", "zone": "JFK Airport", "lat": 40.64, "lon": -73.78},
            {"LocationID": 230, "borough": "Manhattan", "zone": "Times Sq", "lat": 40.76, "lon": -73.99},
        ]
    )
    zones_by_id = pd.DataFrame(index=[132, 230])
    zone_id_to_name = {
        132: "Queens - JFK Airport",
        230: "Manhattan - Times Sq",
    }

    def predict(self, pu_zone, do_zone, pickup_dt, taxi_type):
        return {
            "duration_min": 58.0 if taxi_type == "Yellow" else 59.2,
            "duration_range": (55.2, 61.2),
            "fare_amount": 72.03,
            "fare_range": (69.53, 75.03),
            "pu_zone": pu_zone,
            "pu_name": self.zone_id_to_name[pu_zone],
            "pu_coords": (-73.78, 40.64),
            "do_zone": do_zone,
            "do_name": self.zone_id_to_name[do_zone],
            "do_coords": (-73.99, 40.76),
            "is_airport": True,
            "is_rush_hour": True,
            "cross_borough": True,
            "taxi_type": taxi_type.lower(),
        }


def test_zones_and_prediction_endpoints(monkeypatch):
    monkeypatch.setattr(api, "TaxiPredictor", lambda root_dir: FakePredictor())
    with TestClient(api.app) as client:
        zones_response = client.get("/api/zones")
        prediction_response = client.post(
            "/api/predict",
            json={
                "pickup_zone": 132,
                "dropoff_zone": 230,
                "pickup_at": "2026-11-23T18:00:00",
                "taxi_type": "Yellow",
            },
        )

    assert zones_response.status_code == 200
    assert len(zones_response.json()) == 2
    assert prediction_response.status_code == 200
    prediction = prediction_response.json()
    assert prediction["selected"]["taxi_type"] == "yellow"
    assert prediction["comparison"]["taxi_type"] == "green"
    assert prediction["selected"]["duration_min"] == 58.0
    assert prediction["selected"]["fare_range"] == [69.53, 75.03]


def test_prediction_rejects_unknown_zone(monkeypatch):
    monkeypatch.setattr(api, "TaxiPredictor", lambda root_dir: FakePredictor())
    with TestClient(api.app) as client:
        response = client.post(
            "/api/predict",
            json={
                "pickup_zone": 9999,
                "dropoff_zone": 230,
                "pickup_at": "2026-11-23T18:00:00",
                "taxi_type": "Yellow",
            },
        )

    assert response.status_code == 422
    assert response.json()["detail"] == "Unknown pickup taxi zone."
