"""
NYC Taxi Duration and Fare Serving Predictor.
Implements the two-stage inference contract:
Stage 1: Predicts trip duration (minutes) using pre-trip features.
Stage 2: Predicts metered fare ($) using pre-trip features augmented with Stage 1 predicted duration.
"""

from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
import holidays


class TaxiPredictor:
    def __init__(self, root_dir: Path | str | None = None):
        if root_dir is None:
            self.root_dir = Path(__file__).resolve().parents[2]
        else:
            self.root_dir = Path(root_dir)

        models_dir = self.root_dir / "outputs" / "models"
        lookup_dir = self.root_dir / "outputs" / "lookup"

        # Load models
        self.duration_model = joblib.load(models_dir / "duration_lgbm.joblib")
        self.fare_model = joblib.load(models_dir / "fare_lgbm.joblib")

        # Load metadata and medians
        with open(models_dir / "feature_columns.json") as f:
            self.feature_columns = json.load(f)

        with open(models_dir / "medians.json") as f:
            self.medians = json.load(f)

        # Load lookup tables
        self.zones = pd.read_parquet(lookup_dir / "zones.parquet")
        self.zones_by_id = self.zones.set_index("LocationID")
        self.route_history = pd.read_parquet(lookup_dir / "route_history.parquet").set_index(["pu_zone", "do_zone"])
        self.pu_history = pd.read_parquet(lookup_dir / "pu_history.parquet").set_index("pu_zone")

        # NY holidays
        self.ny_holidays = holidays.country_holidays("US", subdiv="NY", years=[2025, 2026, 2027])

        # Zone display mapping (Borough - Zone name)
        self.zones["display_name"] = self.zones["borough"] + " - " + self.zones["zone"]
        self.zone_name_to_id = dict(zip(self.zones["display_name"], self.zones["LocationID"]))
        self.zone_id_to_name = dict(zip(self.zones["LocationID"], self.zones["display_name"]))

    def prepare_features(self, pu_zone: int, do_zone: int, pickup_dt, is_green: int = 0) -> pd.DataFrame:
        """Construct the exact 1-row feature matrix expected by the duration model."""
        hour = pickup_dt.hour
        weekday = pickup_dt.isoweekday()
        month = pickup_dt.month
        week_of_year = int(pickup_dt.isocalendar()[1])
        is_weekend = int(weekday >= 6)
        is_rush_hour = int((weekday <= 5) and ((7 <= hour <= 9) or (16 <= hour <= 19)))
        is_holiday = int(pickup_dt.date() in self.ny_holidays)

        hour_sin = np.sin(2 * np.pi * hour / 24.0)
        hour_cos = np.cos(2 * np.pi * hour / 24.0)

        # Zone geometry lookup
        pu_row = self.zones_by_id.loc[pu_zone]
        do_row = self.zones_by_id.loc[do_zone]

        pu_airport = int(pu_zone in [1, 132, 138])
        do_airport = int(do_zone in [1, 132, 138])
        same_zone = int(pu_zone == do_zone)
        same_borough = int(pu_row["borough"] == do_row["borough"])

        centroid_km = float(np.sqrt((pu_row["x_km"] - do_row["x_km"])**2 + (pu_row["y_km"] - do_row["y_km"])**2))
        grid_km = float(abs(pu_row["x_km"] - do_row["x_km"]) + abs(pu_row["y_row" if "y_row" in pu_row else "y_km"] - do_row["y_km"]))

        # Prior lookups
        duration_median = self.medians["duration_median"]
        fare_median = self.medians["fare_median"]

        if (pu_zone, do_zone) in self.route_history.index:
            rh = self.route_history.loc[(pu_zone, do_zone)]
            route_prior_mean = float(rh["route_prior_mean"])
            route_prior_trips = int(rh["route_prior_trips"])
            fare_route_prior_mean = float(rh["fare_route_prior_mean"])
        elif pu_zone in self.pu_history.index:
            puh = self.pu_history.loc[pu_zone]
            route_prior_mean = float(puh["pu_prior_mean"])
            route_prior_trips = 0
            fare_route_prior_mean = float(puh["fare_pu_prior_mean"])
        else:
            route_prior_mean = duration_median
            route_prior_trips = 0
            fare_route_prior_mean = fare_median

        if pu_zone in self.pu_history.index:
            puh = self.pu_history.loc[pu_zone]
            pu_prior_mean = float(puh["pu_prior_mean"])
            fare_pu_prior_mean = float(puh["fare_pu_prior_mean"])
        else:
            pu_prior_mean = duration_median
            fare_pu_prior_mean = fare_median

        # Seasonal central park weather defaults
        temp_by_month = {1: 1.5, 2: 2.8, 3: 7.2, 4: 12.8, 5: 18.2, 6: 23.4,
                         7: 26.5, 8: 25.8, 9: 21.6, 10: 15.4, 11: 9.8, 12: 4.5}
        temperature_c = temp_by_month.get(month, 15.0)
        relative_humidity_pct = 60.0
        precipitation_mm = 0.0
        snowfall_cm = 0.0
        windspeed_kmh = 12.0
        is_precipitating = 0

        # Create row
        features_dict = {
            "is_green": is_green,
            "hour": hour,
            "weekday": weekday,
            "month": month,
            "week_of_year": week_of_year,
            "is_weekend": is_weekend,
            "is_rush_hour": is_rush_hour,
            "is_holiday": is_holiday,
            "hour_sin": hour_sin,
            "hour_cos": hour_cos,
            "temperature_c": temperature_c,
            "relative_humidity_pct": relative_humidity_pct,
            "precipitation_mm": precipitation_mm,
            "snowfall_cm": snowfall_cm,
            "windspeed_kmh": windspeed_kmh,
            "is_precipitating": is_precipitating,
            "pu_zone": pu_zone,
            "do_zone": do_zone,
            "pu_airport": pu_airport,
            "do_airport": do_airport,
            "same_zone": same_zone,
            "same_borough": same_borough,
            "centroid_km": centroid_km,
            "grid_km": grid_km,
            "route_prior_mean": route_prior_mean,
            "route_prior_trips": route_prior_trips,
            "pu_prior_mean": pu_prior_mean,
            "fare_route_prior_mean": fare_route_prior_mean,
            "fare_route_prior_trips": route_prior_trips,
            "fare_pu_prior_mean": fare_pu_prior_mean,
            "pu_borough": pu_row["borough"],
            "do_borough": do_row["borough"],
        }

        # Dummies matching training columns
        df_row = pd.DataFrame([features_dict])
        X = pd.get_dummies(df_row, columns=["pu_borough", "do_borough"], dtype=int)
        X = X.reindex(columns=self.feature_columns, fill_value=0)
        return X

    def predict(self, pu_zone: int, do_zone: int, pickup_dt, taxi_type: str = "yellow") -> dict:
        """Run two-stage duration and fare inference."""
        is_green = 1 if taxi_type.lower() == "green" else 0
        X_dur = self.prepare_features(pu_zone, do_zone, pickup_dt, is_green=is_green)

        # Stage 1: Duration
        pred_duration = float(self.duration_model.predict(X_dur)[0])
        pred_duration = max(1.0, round(pred_duration, 1))

        # Stage 2: Fare
        X_fare = X_dur.assign(pred_duration=pred_duration)
        pred_fare = float(self.fare_model.predict(X_fare)[0])
        pred_fare = max(3.0, round(pred_fare, 2))

        # Context details
        pu_row = self.zones_by_id.loc[pu_zone]
        do_row = self.zones_by_id.loc[do_zone]

        is_airport = (pu_zone in [1, 132, 138]) or (do_zone in [1, 132, 138])
        is_rush = bool((pickup_dt.isoweekday() <= 5) and ((7 <= pickup_dt.hour <= 9) or (16 <= pickup_dt.hour <= 19)))
        cross_borough = bool(pu_row["borough"] != do_row["borough"])

        # Confidence bounds (based on test MedAE of ~2.8 min duration, ~$1.8 fare)
        duration_low = max(1.0, round(pred_duration - 2.8, 1))
        duration_high = round(pred_duration + 3.2, 1)

        fare_low = max(3.0, round(pred_fare - 2.5, 2))
        fare_high = round(pred_fare + 3.0, 2)

        return {
            "duration_min": pred_duration,
            "duration_range": (duration_low, duration_high),
            "fare_amount": pred_fare,
            "fare_range": (fare_low, fare_high),
            "pu_zone": pu_zone,
            "pu_name": self.zone_id_to_name[pu_zone],
            "pu_coords": (float(pu_row["lon"]), float(pu_row["lat"])),
            "do_zone": do_zone,
            "do_name": self.zone_id_to_name[do_zone],
            "do_coords": (float(do_row["lon"]), float(do_row["lat"])),
            "is_airport": is_airport,
            "is_rush_hour": is_rush,
            "cross_borough": cross_borough,
            "taxi_type": taxi_type.lower(),
        }
