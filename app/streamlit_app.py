"""
NYC TLC Trip Duration & Fare Prediction App
Streamlit Interactive Serving Interface
"""

import sys
from pathlib import Path
from datetime import datetime, date, time as dtime

import streamlit as st
import pandas as pd
import numpy as np
import pydeck as pdk

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.serving.predictor import TaxiPredictor

# Page Configuration
st.set_page_config(
    page_title="NYC Taxi Trip Duration & Fare Estimator",
    page_icon="🚕",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling
st.markdown("""
<style>
    .metric-card {
        background-color: #f8f9fa;
        border-radius: 10px;
        padding: 16px;
        border-left: 5px solid #D6A900;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        margin-bottom: 12px;
    }
    .metric-title {
        font-size: 13px;
        color: #6c757d;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 600;
    }
    .metric-value {
        font-size: 32px;
        font-weight: 700;
        color: #212529;
        margin: 4px 0;
    }
    .metric-sub {
        font-size: 13px;
        color: #495057;
    }
    .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        margin-right: 6px;
        margin-bottom: 6px;
    }
    .badge-yellow { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
    .badge-green { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .badge-info { background-color: #e2e3e5; color: #383d41; border: 1px solid #d6d8db; }
    .badge-warning { background-color: #ffe8cc; color: #d9480f; border: 1px solid #ffd8a8; }
</style>
""", unsafe_allow_html=True)


@st.cache_resource
def get_predictor():
    return TaxiPredictor(root_dir=ROOT_DIR)

predictor = get_predictor()

# App Header
st.title("🚕 NYC Taxi Trip Duration & Fare Estimator")
st.caption("Two-Stage Machine Learning Pipeline (LightGBM) trained on NYC TLC 2025 Trip Records")

# --- SIDEBAR: TRIP CONTROLS ---
with st.sidebar:
    st.header("📍 Trip Configuration")

    # Zone selection sorted alphabetically by Borough - Zone
    zone_options = sorted(list(predictor.zone_name_to_id.keys()))

    # Default selections (JFK Airport -> Times Square)
    default_pu = "Queens - JFK Airport" if "Queens - JFK Airport" in zone_options else zone_options[0]
    default_do = "Manhattan - Times Sq/Theatre District" if "Manhattan - Times Sq/Theatre District" in zone_options else zone_options[1]

    pu_name = st.selectbox(
        "🟢 Pickup Location",
        zone_options,
        index=zone_options.index(default_pu)
    )

    # Optional quick swap button
    if st.button("🔄 Swap Pickup & Drop-off", use_container_width=True):
        st.session_state["swap"] = True

    do_name = st.selectbox(
        "🔴 Drop-off Location",
        zone_options,
        index=zone_options.index(default_do)
    )

    st.markdown("---")
    st.subheader("⏰ Departure Time")

    # Time shortcut buttons
    preset_cols = st.columns(2)
    with preset_cols[0]:
        if st.button("☀️ Morning Rush", use_container_width=True):
            st.session_state["trip_time"] = dtime(8, 30)
    with preset_cols[1]:
        if st.button("🌆 Evening Rush", use_container_width=True):
            st.session_state["trip_time"] = dtime(18, 0)

    now = datetime.now()
    pickup_date = st.date_input("Date", value=now.date())
    default_time = st.session_state.get("trip_time", now.time().replace(second=0, microsecond=0))
    pickup_time = st.time_input("Time", value=default_time)

    st.markdown("---")
    st.subheader("🚖 Fleet Selection")
    taxi_type = st.radio(
        "Taxi Service",
        options=["Yellow", "Green"],
        format_func=lambda x: f"{x} Cab ({'All NYC' if x == 'Yellow' else 'Outer Boroughs & Upper Manhattan'})",
        index=0
    )

    pu_id = predictor.zone_name_to_id[pu_name]
    do_id = predictor.zone_name_to_id[do_name]
    pu_borough = predictor.zones_by_id.loc[pu_id, "borough"]

    # Green taxi hail restriction warning
    if taxi_type == "Green" and pu_borough == "Manhattan" and pu_id not in [1, 132, 138]:
        st.warning("⚠️ **Regulatory Restriction:** Green Boro Taxis cannot pick up street hails in Manhattan south of East 96th / West 110th St.")


# Combine selected Date and Time
pickup_dt = datetime.combine(pickup_date, pickup_time)

# Compute predictions (real-time responsiveness)
res = predictor.predict(
    pu_zone=pu_id,
    do_zone=do_id,
    pickup_dt=pickup_dt,
    taxi_type=taxi_type
)

# Alternative fleet for comparison
alt_fleet = "Green" if taxi_type == "Yellow" else "Yellow"
alt_res = predictor.predict(
    pu_zone=pu_id,
    do_zone=do_id,
    pickup_dt=pickup_dt,
    taxi_type=alt_fleet
)


# --- MAIN PAGE: 2-COLUMN RESPONSIVE LAYOUT ---
col_pred, col_map = st.columns([1, 1.3], gap="large")

with col_pred:
    st.subheader("📊 Model Predictions")

    # Primary KPI Cards
    kpi_col1, kpi_col2 = st.columns(2)
    with kpi_col1:
        st.markdown(f"""
        <div class="metric-card" style="border-left-color: {'#D6A900' if taxi_type == 'Yellow' else '#168A62'};">
            <div class="metric-title">Estimated Duration</div>
            <div class="metric-value">{res['duration_min']} <span style="font-size: 18px; font-weight: normal;">min</span></div>
            <div class="metric-sub">Expected range: <b>{res['duration_range'][0]} – {res['duration_range'][1]} min</b></div>
        </div>
        """, unsafe_allow_html=True)

    with kpi_col2:
        st.markdown(f"""
        <div class="metric-card" style="border-left-color: #2b8a3e;">
            <div class="metric-title">Estimated Metered Fare</div>
            <div class="metric-value">${res['fare_amount']:.2f}</div>
            <div class="metric-sub">Expected range: <b>${res['fare_range'][0]:.2f} – ${res['fare_range'][1]:.2f}</b></div>
        </div>
        """, unsafe_allow_html=True)

    st.caption("ℹ️ *Metered fare before optional tip, airport access fees, and bridge/tunnel tolls.*")

    # Contextual Signals / Badges
    st.markdown("##### 💡 Trip & Environmental Factors")
    badges_html = ""
    if res["is_rush_hour"]:
        badges_html += '<span class="badge badge-warning">🚦 Peak Rush Hour</span>'
    else:
        badges_html += '<span class="badge badge-info">🟢 Normal Traffic Window</span>'

    if res["is_airport"]:
        badges_html += '<span class="badge badge-yellow">✈️ Airport Route</span>'

    if res["cross_borough"]:
        badges_html += '<span class="badge badge-info">🌉 Cross-Borough Trip</span>'
    else:
        badges_html += '<span class="badge badge-info">📍 Intra-Borough</span>'

    badges_html += f'<span class="badge badge-info">🗓️ {pickup_dt.strftime("%A, %b %d")}</span>'
    st.markdown(badges_html, unsafe_allow_html=True)

    # Fleet Comparison Card
    st.markdown("---")
    st.markdown("##### ⚖️ Fleet Comparison (Yellow vs. Green)")
    comp_df = pd.DataFrame({
        "Fleet": [f"{taxi_type} (Selected)", f"{alt_fleet} (Alternative)"],
        "Est. Duration": [f"{res['duration_min']} min", f"{alt_res['duration_min']} min"],
        "Est. Fare": [f"${res['fare_amount']:.2f}", f"${alt_res['fare_amount']:.2f}"]
    })
    st.table(comp_df.set_index("Fleet"))

    with st.expander("🔍 Model Architecture & Feature Flow"):
        st.markdown("""
        - **Stage 1 (Duration):** LightGBM Regressor using pickup time, route history, zone geometry, and calendar features.
        - **Stage 2 (Fare):** LightGBM Regressor using pre-trip features **plus** Stage 1 predicted duration.
        - **No Leaky Inputs:** Excludes post-trip drop-off timestamps, metered trip distance, and tolls.
        - **Zero Passenger Count:** Removed from pipeline as driver-entered headcounts have zero predictive signal.
        """)


# --- RESPONSIVE MAP (ALWAYS VISIBLE & IMMEDIATELY UPDATED) ---
with col_map:
    st.subheader("🗺️ Live Route Map")

    pu_lon, pu_lat = res["pu_coords"]
    do_lon, do_lat = res["do_coords"]

    # Calculate center and zoom dynamically
    mid_lat = (pu_lat + do_lat) / 2.0
    mid_lon = (pu_lon + do_lon) / 2.0
    dist_deg = np.sqrt((pu_lat - do_lat)**2 + (pu_lon - do_lon)**2)
    zoom = max(10.0, min(13.5, 12.0 - np.log2(max(dist_deg, 0.01) / 0.05)))

    # Location pins dataframe
    pins_data = pd.DataFrame([
        {
            "name": f"Pickup: {pu_name}",
            "lon": pu_lon,
            "lat": pu_lat,
            "color": [34, 139, 34, 230],     # Green
            "radius": 140
        },
        {
            "name": f"Drop-off: {do_name}",
            "lon": do_lon,
            "lat": do_lat,
            "color": [220, 20, 60, 230],     # Red
            "radius": 140
        }
    ])

    # Connecting Arc Data
    arc_data = pd.DataFrame([{
        "from_name": pu_name,
        "to_name": do_name,
        "from_lon": pu_lon,
        "from_lat": pu_lat,
        "to_lon": do_lon,
        "to_lat": do_lat,
    }])

    # PyDeck Layers
    scatterplot_layer = pdk.Layer(
        "ScatterplotLayer",
        data=pins_data,
        get_position="[lon, lat]",
        get_fill_color="color",
        get_radius="radius",
        pickable=True,
        auto_highlight=True,
    )

    text_layer = pdk.Layer(
        "TextLayer",
        data=pins_data,
        get_position="[lon, lat]",
        get_text="name",
        get_size=13,
        get_color=[30, 30, 30, 255],
        get_angle=0,
        get_text_anchor="'start'",
        get_alignment_baseline="'center'",
        get_pixel_offset=[12, 0],
    )

    arc_layer = pdk.Layer(
        "ArcLayer",
        data=arc_data,
        get_source_position="[from_lon, from_lat]",
        get_target_position="[to_lon, to_lat]",
        get_source_color=[34, 139, 34, 200],     # Green
        get_target_color=[214, 169, 0, 240],    # Taxi Yellow
        get_width=4,
        get_tilt=15,
        pickable=True,
    )

    view_state = pdk.ViewState(
        latitude=mid_lat,
        longitude=mid_lon,
        zoom=zoom,
        pitch=30,
        bearing=0
    )

    deck = pdk.Deck(
        layers=[arc_layer, scatterplot_layer, text_layer],
        initial_view_state=view_state,
        map_style="light",
        tooltip={"text": "{name}"}
    )

    st.pydeck_chart(deck, use_container_width=True)

    # Route summary caption below map
    st.markdown(f"""
    **Selected Route:** `🟢 {pu_name}` ➔ `🔴 {do_name}`  
    *Direct Centroid Distance:* **{np.sqrt((res['pu_coords'][0]-res['do_coords'][0])**2 + (res['pu_coords'][1]-res['do_coords'][1])**2) * 82.5:.1f} km*
    """)
