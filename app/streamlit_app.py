"""
NYC Taxi trip duration and fare estimator (Streamlit).

Flow: pick a route -> pick a departure time -> pick the fleet (and weather) -> Estimate.
Stage 1 predicts the duration, Stage 2 predicts the metered fare from that predicted duration.
"""

import sys
import time
from datetime import datetime, time as dtime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pydeck as pdk
import streamlit as st

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.serving.predictor import TaxiPredictor  # noqa: E402

st.set_page_config(page_title="NYC Taxi Estimator", page_icon="🚕", layout="wide",
                   initial_sidebar_state="collapsed")

YELLOW, AMBER, ASPHALT, GREEN, STEEL = "#F5B800", "#E08A00", "#1F2024", "#168A62", "#5B6B7A"

# ---------------------------------------------------------------- styles
st.markdown(f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

html, body, [class*="st-"], .stMarkdown, button, input {{ font-family: 'Plus Jakarta Sans', sans-serif; }}
#MainMenu, footer, [data-testid="stToolbar"], [data-testid="stDecoration"] {{ visibility: hidden; }}
[data-testid="stHeader"] {{ background: transparent; }}
.block-container {{ padding-top: 1.2rem; max-width: 1280px; }}
.stApp {{ background: radial-gradient(1200px 500px at 85% -10%, #FFE6A8 0%, rgba(255,230,168,0) 60%), #FFF8EA; }}

/* ---------- hero ---------- */
.hero {{ position: relative; overflow: hidden; border-radius: 22px; padding: 28px 32px 78px;
        background: linear-gradient(120deg, #2A2B31 0%, #3A3A3F 35%, #8A5A12 75%, #F5B800 120%);
        color: #FFF8EA; box-shadow: 0 18px 40px -18px rgba(90,60,0,.55); animation: fadeUp .6s ease both; }}
.hero h1 {{ font-size: 2.15rem; font-weight: 800; margin: 0; letter-spacing: -.02em; color: #FFF8EA; }}
.hero h1 span {{ color: {YELLOW}; }}
.hero p {{ margin: 6px 0 0; color: #F3E3C0; font-size: 1rem; max-width: 640px; }}
.hero .glow {{ position: absolute; right: -80px; top: -120px; width: 380px; height: 380px; border-radius: 50%;
              background: radial-gradient(circle, rgba(255,214,102,.55), rgba(255,214,102,0) 70%);
              animation: pulse 6s ease-in-out infinite; }}
.skyline {{ position: absolute; left: 0; right: 0; bottom: 26px; height: 60px; opacity: .35; }}
.road {{ position: absolute; left: 0; right: 0; bottom: 0; height: 26px; background: #1B1C20; }}
.road::after {{ content: ""; position: absolute; left: 0; right: 0; top: 12px; height: 3px;
               background: repeating-linear-gradient(90deg, {YELLOW} 0 28px, transparent 28px 56px);
               animation: lane 1.1s linear infinite; }}
.cab {{ position: absolute; bottom: 14px; left: -120px; width: 92px; animation: drive 9s linear infinite; }}
.cab.two {{ animation-delay: -4.5s; width: 72px; bottom: 12px; opacity: .9; }}

/* ---------- breadcrumbs + steps ---------- */
.crumbs {{ display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 16px 0 6px;
          font-size: .85rem; color: {STEEL}; animation: fadeUp .6s .1s ease both; }}
.crumbs a, .crumbs span.c {{ padding: 4px 11px; border-radius: 999px; background: #FFF1CC; color: #6B4E00;
                            text-decoration: none; font-weight: 600; border: 1px solid #F6DE9C; }}
.crumbs span.c.now {{ background: {ASPHALT}; color: {YELLOW}; border-color: {ASPHALT}; }}
.crumbs .sep {{ color: #C9A24A; font-weight: 700; }}
.steps {{ display: flex; gap: 10px; margin: 8px 0 18px; animation: fadeUp .6s .15s ease both; }}
.step {{ flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 14px;
        background: #FFFDF6; border: 1px solid #F3E4BC; font-size: .86rem; color: {STEEL}; font-weight: 600; }}
.step b {{ display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%;
          background: #F3E4BC; color: #7A5B00; font-size: .8rem; flex: none; }}
.step.done b {{ background: {YELLOW}; color: {ASPHALT}; }}
.step.done {{ color: {ASPHALT}; border-color: #F2CF6B; }}
.step.active {{ border-color: {AMBER}; box-shadow: 0 0 0 3px rgba(232,163,0,.18); color: {ASPHALT}; }}
.step.active b {{ background: {ASPHALT}; color: {YELLOW}; animation: pulse 1.6s ease-in-out infinite; }}

/* ---------- cards ---------- */
.section-title {{ font-size: .78rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
                 color: #9A7414; margin: 4px 0 8px; }}
[data-testid="stVerticalBlockBorderWrapper"] {{ border-radius: 18px !important; border-color: #F1E1B6 !important;
                                                background: #FFFDF7; box-shadow: 0 10px 28px -20px rgba(120,80,0,.45);
                                                animation: fadeUp .55s ease both; }}
.kpi {{ position: relative; overflow: hidden; border-radius: 18px; padding: 18px 20px; color: {ASPHALT};
       background: linear-gradient(135deg, #FFE08A, {YELLOW}); box-shadow: 0 14px 30px -18px rgba(160,105,0,.8);
       animation: pop .55s cubic-bezier(.2,.9,.3,1.3) both; }}
.kpi.dark {{ background: linear-gradient(135deg, #34353B, {ASPHALT}); color: #FFF4D6; animation-delay: .08s; }}
.kpi.dark .label, .kpi.dark .sub {{ color: #E9D6A6; }}
.kpi .label {{ font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #6B4E00; }}
.kpi .value {{ font-size: 2.6rem; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; margin-top: 4px; }}
.kpi .value small {{ font-size: 1rem; font-weight: 600; margin-left: 4px; }}
.kpi .sub {{ font-size: .84rem; color: #5A4300; margin-top: 2px; }}
.kpi::after {{ content: ""; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
              background: linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent);
              transform: skewX(-20deg); animation: shine 2.8s 0.6s ease-in-out 1; }}
.kpi .value {{ animation: pop .55s cubic-bezier(.2,.9,.3,1.3) both; }}

.chips {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 4px; }}
.chip {{ padding: 5px 12px; border-radius: 999px; font-size: .8rem; font-weight: 600; background: #FFF1CC;
        color: #6B4E00; border: 1px solid #F6DE9C; animation: fadeUp .5s ease both; }}
.chip.hot {{ background: #FFE1C2; color: #A0410A; border-color: #FFC896; }}
.chip.dark {{ background: {ASPHALT}; color: {YELLOW}; border-color: {ASPHALT}; }}

.bars {{ margin-top: 6px; }}
.bar-row {{ display: grid; grid-template-columns: 92px 1fr 120px; align-items: center; gap: 10px; margin: 8px 0;
           font-size: .85rem; font-weight: 600; color: {ASPHALT}; }}
.bar {{ height: 12px; border-radius: 999px; background: #F5E9C8; overflow: hidden; }}
.bar i {{ display: block; height: 100%; border-radius: 999px; width: var(--w); animation: grow 1s ease-out both; }}
.bar-row .num {{ text-align: right; color: {STEEL}; font-weight: 500; }}

.live {{ display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #E5484D; margin-right: 6px;
        box-shadow: 0 0 0 0 rgba(229,72,77,.6); animation: ping 1.6s infinite; vertical-align: middle; }}
.route-line {{ font-size: .9rem; color: {STEEL}; margin-top: 8px; }}
.route-line b {{ color: {ASPHALT}; }}

/* ---------- custom spinner ---------- */
.loader {{ display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 34px 10px; }}
.loader .track {{ position: relative; width: 260px; height: 54px; overflow: hidden; border-radius: 12px; background: #2A2B31; }}
.loader .track::after {{ content: ""; position: absolute; left: 0; right: 0; bottom: 12px; height: 3px;
                        background: repeating-linear-gradient(90deg, {YELLOW} 0 18px, transparent 18px 36px);
                        animation: lane .5s linear infinite; }}
.loader svg {{ position: absolute; left: 92px; bottom: 15px; width: 76px; animation: bob .35s ease-in-out infinite alternate; }}
.loader .txt {{ font-weight: 700; color: {ASPHALT}; }}
.loader .dots::after {{ content: ""; animation: dots 1.2s steps(4) infinite; }}

/* ---------- widgets ---------- */
.stButton > button {{ border-radius: 12px; font-weight: 700; border: 1px solid #EED38B; transition: transform .15s, box-shadow .15s; }}
.stButton > button:hover {{ transform: translateY(-1px); box-shadow: 0 8px 18px -10px rgba(160,105,0,.7); border-color: {AMBER}; }}
.stButton > button[kind="primary"] {{ background: linear-gradient(135deg, {YELLOW}, {AMBER}); color: {ASPHALT}; border: none; }}
.stButton > button[kind="primary"]:hover {{ box-shadow: 0 12px 24px -10px rgba(224,138,0,.9); }}
[data-baseweb="select"] > div, [data-baseweb="input"] > div {{ border-radius: 12px !important; }}
[data-testid="stExpander"] {{ border-radius: 14px; border-color: #F1E1B6; background: #FFFDF7; }}

/* ---------- keyframes ---------- */
@keyframes fadeUp {{ from {{ opacity: 0; transform: translateY(12px); }} to {{ opacity: 1; transform: none; }} }}
@keyframes pop {{ from {{ opacity: 0; transform: scale(.94); }} to {{ opacity: 1; transform: none; }} }}
@keyframes drive {{ from {{ transform: translateX(0); }} to {{ transform: translateX(calc(100vw + 240px)); }} }}
@keyframes lane {{ from {{ background-position: 0 0; }} to {{ background-position: -56px 0; }} }}
@keyframes pulse {{ 0%,100% {{ transform: scale(1); opacity: 1; }} 50% {{ transform: scale(1.08); opacity: .85; }} }}
@keyframes shine {{ to {{ left: 130%; }} }}
@keyframes grow {{ from {{ width: 0; }} }}
@keyframes ping {{ 70% {{ box-shadow: 0 0 0 9px rgba(229,72,77,0); }} 100% {{ box-shadow: 0 0 0 0 rgba(229,72,77,0); }} }}
@keyframes bob {{ from {{ transform: translateY(0); }} to {{ transform: translateY(-3px); }} }}
@keyframes dots {{ 0% {{ content: ""; }} 25% {{ content: "."; }} 50% {{ content: ".."; }} 75% {{ content: "..."; }} }}
@media (prefers-reduced-motion: reduce) {{ *, *::before, *::after {{ animation: none !important; transition: none !important; }} }}
@media (max-width: 760px) {{ .steps {{ flex-wrap: wrap; }} .step {{ flex: 1 1 45%; }} .hero h1 {{ font-size: 1.6rem; }} }}
</style>
""", unsafe_allow_html=True)

CAB_SVG = f"""<svg viewBox="0 0 120 52" xmlns="http://www.w3.org/2000/svg">
<rect x="46" y="2" width="26" height="9" rx="2" fill="#FFF4D6"/><text x="59" y="9.5" font-size="6" text-anchor="middle"
font-family="sans-serif" font-weight="700" fill="#1F2024">TAXI</text>
<path d="M14 30 L30 14 H86 L104 30 H112 a6 6 0 0 1 6 6 V40 H4 V36 a6 6 0 0 1 6 -6 Z" fill="{YELLOW}"/>
<path d="M34 17 H57 V29 H22 Z M61 17 H84 L97 29 H61 Z" fill="#2A2B31" opacity=".85"/>
<rect x="4" y="33" width="114" height="3" fill="#1F2024" opacity=".25"/>
<g fill="#1F2024"><circle cx="30" cy="42" r="9"/><circle cx="92" cy="42" r="9"/></g>
<g fill="#9AA3AD"><circle cx="30" cy="42" r="4"/><circle cx="92" cy="42" r="4"/></g>
<rect x="110" y="31" width="7" height="4" rx="1" fill="#FFF4D6"/></svg>"""

SKYLINE = """<svg class="skyline" viewBox="0 0 1200 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
<path fill="#FFE7A8" d="M0 60V38h40V22h30v16h20V10h26v28h24V30h30v-14h18v22h26V4h20v34h30V26h26v12h22V18h34v20h20V8h18
v30h26V28h30v10h24V14h28v24h22V30h26V6h22v32h30V22h24v16h26V12h30v26h20V28h28v10h26V16h22v22h30V2h18v36h26V24h30v14h22
V18h28v20h24V10h20v28h30V30h26v8h24V20h30v18h26V12h22v26h28V60Z"/></svg>"""


def loader_html(text: str) -> str:
    return (f'<div class="loader"><div class="track">{CAB_SVG}</div>'
            f'<div class="txt">{text}<span class="dots"></span></div></div>')


# ---------------------------------------------------------------- hero
st.markdown(f"""
<div class="hero">
  <div class="glow"></div>
  <h1>NYC Taxi <span>Trip Estimator</span></h1>
  <p>How long will the ride take and what will the meter say? Two LightGBM models trained on
     47 million 2025 TLC trips: Stage 1 predicts the duration, Stage 2 the fare.</p>
  {SKYLINE}
  <div class="road"></div>
  <div class="cab">{CAB_SVG}</div>
  <div class="cab two">{CAB_SVG}</div>
</div>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------- model (custom loader on first start)
@st.cache_resource(show_spinner=False)
def get_predictor():
    return TaxiPredictor(root_dir=ROOT_DIR)


if "predictor_ready" not in st.session_state:
    slot = st.empty()
    slot.markdown(loader_html("Warming up the engine"), unsafe_allow_html=True)
    predictor = get_predictor()
    slot.empty()
    st.session_state.predictor_ready = True
else:
    predictor = get_predictor()

zone_options = sorted(predictor.zone_name_to_id)


def pick(name, fallback):
    return name if name in zone_options else fallback


# ---------------------------------------------------------------- state + callbacks
defaults = {
    "pu": pick("Queens - JFK Airport", zone_options[0]),
    "do": pick("Manhattan - Times Sq/Theatre District", zone_options[1]),
    "pickup_date": datetime.now().date(),
    "pickup_time": dtime(18, 0),
    "fleet": "Yellow",
    "weather": "Dry",
    "result": None,
}
for key, value in defaults.items():
    st.session_state.setdefault(key, value)


def swap_route():
    st.session_state.pu, st.session_state.do = st.session_state.do, st.session_state.pu


def set_time(t):
    st.session_state.pickup_time = t


def use_route(pu, do):
    st.session_state.pu = pick(pu, zone_options[0])
    st.session_state.do = pick(do, zone_options[1])


def short(name: str) -> str:
    return name.split(" - ", 1)[-1]


# ---------------------------------------------------------------- breadcrumbs + steps
has_result = st.session_state.result is not None
trail = f'<span class="c now">{short(st.session_state.pu)} → {short(st.session_state.do)}</span>'
st.markdown(f"""
<div class="crumbs">
  <span class="c">NYC TLC 2025</span><span class="sep">›</span>
  <span class="c">Trip estimator</span><span class="sep">›</span>{trail}
</div>
<div class="steps">
  <div class="step done"><b>1</b>Route</div>
  <div class="step done"><b>2</b>Departure</div>
  <div class="step done"><b>3</b>Fleet &amp; weather</div>
  <div class="step {'done' if has_result else 'active'}"><b>4</b>Estimate</div>
</div>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------- layout
left, right = st.columns([0.95, 1.35], gap="large")

with left:
    with st.container(border=True):
        st.markdown('<div class="section-title">1 · Route</div>', unsafe_allow_html=True)
        st.selectbox("Pickup", zone_options, key="pu")
        st.button("⇅  Swap pickup and drop-off", on_click=swap_route, width="stretch")
        st.selectbox("Drop-off", zone_options, key="do")

        q1, q2 = st.columns(2)
        q1.button("✈️ JFK → Times Sq", key="quick_jfk", width="stretch",
                  on_click=use_route, args=("Queens - JFK Airport", "Manhattan - Times Sq/Theatre District"))
        q2.button("🌳 Park → SoHo", key="quick_park", width="stretch",
                  on_click=use_route, args=("Manhattan - Central Park", "Manhattan - SoHo"))
        q3, q4 = st.columns(2)
        q3.button("🏙️ UES → FiDi", key="quick_ues", width="stretch",
                  on_click=use_route, args=("Manhattan - Upper East Side North", "Manhattan - Financial District South"))
        q4.button("🛫 LGA → Penn", key="quick_lga", width="stretch",
                  on_click=use_route, args=("Queens - LaGuardia Airport", "Manhattan - Penn Station/Madison Sq West"))

    with st.container(border=True):
        st.markdown('<div class="section-title">2 · Departure</div>', unsafe_allow_html=True)
        c1, c2 = st.columns(2)
        c1.date_input("Date", key="pickup_date")
        c2.time_input("Time", key="pickup_time", step=timedelta(minutes=15))
        p1, p2, p3, p4 = st.columns(4)
        p1.button("Morning rush", on_click=set_time, args=(dtime(8, 30),), width="stretch")
        p2.button("Midday", on_click=set_time, args=(dtime(13, 0),), width="stretch")
        p3.button("Evening rush", on_click=set_time, args=(dtime(18, 0),), width="stretch")
        p4.button("Late night", on_click=set_time, args=(dtime(2, 0),), width="stretch")

    with st.container(border=True):
        st.markdown('<div class="section-title">3 · Fleet &amp; weather</div>', unsafe_allow_html=True)
        f1, f2 = st.columns(2)
        f1.radio("Taxi", ["Yellow", "Green"], key="fleet", horizontal=True)
        f2.radio("Weather", ["Dry", "Rain", "Snow"], key="weather", horizontal=True)

        pu_id = predictor.zone_name_to_id[st.session_state.pu]
        do_id = predictor.zone_name_to_id[st.session_state.do]
        pu_borough = predictor.zones_by_id.loc[pu_id, "borough"]
        if st.session_state.fleet == "Green" and pu_borough == "Manhattan" and pu_id not in [1, 132, 138]:
            st.warning("Green cabs cannot pick up street hails in Manhattan below E 96th / W 110th St.")
        if pu_id == do_id:
            st.info("Pickup and drop-off are the same zone: a short trip inside one neighbourhood.")

    estimate = st.button("Estimate trip  →", type="primary", width="stretch")


def run_prediction():
    pickup_dt = datetime.combine(st.session_state.pickup_date, st.session_state.pickup_time)
    fleet, weather = st.session_state.fleet, st.session_state.weather.lower()
    other = "Green" if fleet == "Yellow" else "Yellow"
    return {
        "pickup_dt": pickup_dt, "fleet": fleet, "other": other, "weather": weather,
        "pu_name": st.session_state.pu, "do_name": st.session_state.do,
        "main": predictor.predict(pu_id, do_id, pickup_dt, taxi_type=fleet, weather=weather),
        "alt": predictor.predict(pu_id, do_id, pickup_dt, taxi_type=other, weather=weather),
    }


with right:
    slot = st.empty()
    if estimate or st.session_state.result is None:
        if estimate:
            slot.markdown(loader_html("Checking 2025 traffic on this route"), unsafe_allow_html=True)
            time.sleep(0.7)   # long enough to see the cab, short enough not to annoy
        st.session_state.result = run_prediction()
        slot.empty()
        if estimate:
            st.rerun()        # redraw so the breadcrumb step 4 turns to done

    r = st.session_state.result
    res, alt = r["main"], r["alt"]
    arrival = r["pickup_dt"] + timedelta(minutes=res["duration_min"])
    stale = (r["pu_name"], r["do_name"], r["fleet"], r["weather"]) != (
        st.session_state.pu, st.session_state.do, st.session_state.fleet, st.session_state.weather.lower()) \
        or r["pickup_dt"] != datetime.combine(st.session_state.pickup_date, st.session_state.pickup_time)

    st.markdown('<div class="section-title">4 · Estimate</div>', unsafe_allow_html=True)
    if stale:
        st.caption("Inputs changed. Press **Estimate trip** to update.")

    k1, k2 = st.columns(2)
    k1.markdown(f"""
    <div class="kpi">
      <div class="label">Trip duration</div>
      <div class="value">{res['duration_min']:.0f}<small>min</small></div>
      <div class="sub">usually {res['duration_range'][0]:.0f}–{res['duration_range'][1]:.0f} min ·
           arrive ≈ <b>{arrival:%H:%M}</b></div>
    </div>""", unsafe_allow_html=True)
    k2.markdown(f"""
    <div class="kpi dark">
      <div class="label">Metered fare</div>
      <div class="value">${res['fare_amount']:.2f}</div>
      <div class="sub">usually ${res['fare_range'][0]:.0f}–${res['fare_range'][1]:.0f} · before tip, tolls, fees</div>
    </div>""", unsafe_allow_html=True)

    chips = [f'<span class="chip dark">{r["fleet"]} cab</span>',
             f'<span class="chip">{r["pickup_dt"]:%a %d %b, %H:%M}</span>',
             f'<span class="chip">{res["centroid_km"]:.1f} km straight line</span>']
    chips.append('<span class="chip hot">Rush hour</span>' if res["is_rush_hour"] else '<span class="chip">Off-peak</span>')
    if res["is_airport"]:
        chips.append('<span class="chip">Airport trip</span>')
    chips.append('<span class="chip">Cross-borough</span>' if res["cross_borough"] else '<span class="chip">Same borough</span>')
    if r["weather"] != "dry":
        chips.append(f'<span class="chip hot">{r["weather"].title()}</span>')
    st.markdown(f'<div class="chips">{"".join(chips)}</div>', unsafe_allow_html=True)

    tab_map, tab_compare, tab_how = st.tabs(["Route map", "Yellow vs Green", "How it works"])

    with tab_map:
        (pu_lon, pu_lat), (do_lon, do_lat) = res["pu_coords"], res["do_coords"]
        dist_deg = np.hypot(pu_lat - do_lat, pu_lon - do_lon)
        zoom = max(9.5, min(13.5, 12.0 - np.log2(max(dist_deg, 0.01) / 0.05)))
        pins = pd.DataFrame([
            {"name": f"Pickup · {short(r['pu_name'])}", "lon": pu_lon, "lat": pu_lat, "color": [31, 32, 36, 235]},
            {"name": f"Drop-off · {short(r['do_name'])}", "lon": do_lon, "lat": do_lat, "color": [224, 138, 0, 235]},
        ])
        arc = pd.DataFrame([{"from_lon": pu_lon, "from_lat": pu_lat, "to_lon": do_lon, "to_lat": do_lat}])
        deck = pdk.Deck(
            layers=[
                pdk.Layer("ArcLayer", data=arc, get_source_position="[from_lon, from_lat]",
                          get_target_position="[to_lon, to_lat]", get_source_color=[31, 32, 36, 220],
                          get_target_color=[245, 184, 0, 240], get_width=5, get_tilt=12),
                pdk.Layer("ScatterplotLayer", data=pins, get_position="[lon, lat]", get_fill_color="color",
                          get_radius=160, radius_min_pixels=6, stroked=True, get_line_color=[255, 248, 234],
                          line_width_min_pixels=2, pickable=True),
                pdk.Layer("TextLayer", data=pins, get_position="[lon, lat]", get_text="name", get_size=13,
                          get_color=[31, 32, 36, 255], get_pixel_offset=[14, 0], get_text_anchor="'start'",
                          get_alignment_baseline="'center'"),
            ],
            initial_view_state=pdk.ViewState(latitude=(pu_lat + do_lat) / 2, longitude=(pu_lon + do_lon) / 2,
                                             zoom=zoom, pitch=35),
            map_style="light", tooltip={"text": "{name}"},
        )
        st.markdown('<span class="live"></span><b>Route</b> · zone centre to zone centre', unsafe_allow_html=True)
        st.pydeck_chart(deck, height=380)
        st.markdown(f'<div class="route-line"><b>{r["pu_name"]}</b> → <b>{r["do_name"]}</b></div>',
                    unsafe_allow_html=True)

    with tab_compare:
        rows = [(r["fleet"], res), (r["other"], alt)]
        max_d = max(x["duration_min"] for _, x in rows) or 1
        max_f = max(x["fare_amount"] for _, x in rows) or 1
        bars = ""
        for label, unit, key, top in [("Duration", "min", "duration_min", max_d), ("Fare", "$", "fare_amount", max_f)]:
            bars += f'<div class="section-title" style="margin-top:12px">{label}</div>'
            for fleet, x in rows:
                colour = YELLOW if fleet == "Yellow" else GREEN
                value = f"{x[key]:.1f} min" if unit == "min" else f"${x[key]:.2f}"
                bars += (f'<div class="bar-row"><span>{fleet}</span><div class="bar">'
                         f'<i style="--w:{100 * x[key] / top:.0f}%; background:{colour}"></i></div>'
                         f'<span class="num">{value}</span></div>')
        st.markdown(f'<div class="bars">{bars}</div>', unsafe_allow_html=True)
        st.caption("Same route and time, only the fleet changes. Answers the project question: does the taxi "
                   "type change the prediction?")

    with tab_how:
        st.markdown("""
1. **Route history:** the average duration and fare of the same pickup → drop-off route in earlier months.
2. **Stage 1, duration:** LightGBM uses the time, zones, distance between zone centres, calendar, weather and
   route history.
3. **Stage 2, fare:** a second LightGBM uses the same inputs **plus the predicted duration**.
4. **Only pre-trip information:** no drop-off time, no metered distance, no tips or tolls.

The "usually" ranges show the typical error on the Nov–Dec 2025 test months (about half of all trips fall
inside them). Weather is a simple scenario (dry / rain / snow), not a live forecast.
""")
