"""
Streamlit dashboard for the SAR flood mapping project.

Reads static outputs committed to the repo (no live Earth Engine calls, so
it deploys cleanly on Streamlit Community Cloud with no auth setup):
    exports/flood_extent_vector.geojson   flood polygon (from flood_mapping.js)
    exports/exposure_table.csv            cropland/built-up hectares (from exposure_analysis.js)
    results.json                          headline numbers for the metric cards

Run locally:
    pip install -r requirements.txt
    streamlit run app.py
"""

import json
from pathlib import Path

import folium
import pandas as pd
import plotly.express as px
import streamlit as st
from streamlit_folium import st_folium

st.set_page_config(page_title="SAR Flood Mapping", layout="wide")

ROOT = Path(__file__).parent
EXPORTS = ROOT / "exports"


@st.cache_data
def load_results():
    path = ROOT / "results.json"
    if path.exists():
        return json.loads(path.read_text())
    return {}


@st.cache_data
def load_flood_geojson():
    path = EXPORTS / "flood_extent_vector.geojson"
    if path.exists():
        return json.loads(path.read_text())
    return None


@st.cache_data
def load_exposure_table():
    path = EXPORTS / "exposure_table.csv"
    if path.exists():
        return pd.read_csv(path)
    return None


def metric_or_dash(value, suffix=""):
    if value is None:
        return "—"
    return f"{value:,.1f}{suffix}" if isinstance(value, (int, float)) else str(value)


results = load_results()

st.title("Sentinel-1 SAR Flood Mapping & Exposure Assessment")
st.caption(
    f"{results.get('event_name', 'Event not set')} — "
    f"{results.get('aoi_note', '')}"
)

tab_map, tab_exposure, tab_validation, tab_method = st.tabs(
    ["Flood Map", "Exposure", "Validation", "Methodology"]
)

with tab_map:
    st.subheader("Mapped flood extent")
    geojson = load_flood_geojson()
    if geojson is None:
        st.info(
            "No `exports/flood_extent_vector.geojson` found yet. Run "
            "`flood_mapping.js` in the GEE Code Editor, run the "
            "`flood_extent_vector` export task, download it from Drive, "
            "and place it in `exports/`."
        )
    else:
        m = folium.Map(location=[9.6, 76.6], zoom_start=9, tiles="CartoDB positron")
        folium.GeoJson(
            geojson,
            name="Flood extent",
            style_function=lambda f: {"fillColor": "#0ea5e9", "color": "#0369a1", "weight": 1, "fillOpacity": 0.6},
        ).add_to(m)
        st_folium(m, width=None, height=550)

    col1, col2, col3 = st.columns(3)
    col1.metric("Mapped flooded area", metric_or_dash(results.get("mapped_flooded_ha"), " ha"))
    col2.metric("Fixed threshold used", metric_or_dash(results.get("fixed_threshold")))
    col3.metric("Otsu threshold", metric_or_dash(results.get("otsu_threshold")))

with tab_exposure:
    st.subheader("What got affected")
    table = load_exposure_table()
    if table is None:
        st.info(
            "No `exports/exposure_table.csv` found yet. Run "
            "`exposure_analysis.js` (or `flood_mapping.py`) to generate it."
        )
    else:
        fig = px.bar(table, x="category", y="flooded_hectares", color="category")
        st.plotly_chart(fig, use_container_width=True)
        st.dataframe(table, use_container_width=True)

    st.metric(
        "Estimated population exposed",
        metric_or_dash(results.get("estimated_population_exposed")),
    )

with tab_validation:
    st.subheader("Mapped vs reported")
    col1, col2, col3 = st.columns(3)
    col1.metric("Mapped area", metric_or_dash(results.get("mapped_flooded_ha"), " ha"))
    col2.metric("Reported area", metric_or_dash(results.get("reported_flooded_ha"), " ha"))
    col3.metric("Agreement", metric_or_dash(results.get("agreement_pct"), "%"))
    if results.get("reported_source"):
        st.caption(f"Reported figure source: {results['reported_source']}")
    else:
        st.warning(
            "No validation source set yet. Fill `reported_flooded_ha`, "
            "`reported_source`, and `agreement_pct` in `results.json` once "
            "you have a published figure to compare against."
        )

with tab_method:
    st.subheader("Method")
    st.markdown(
        """
1. Pull a Sentinel-1 GRD (VH polarisation) image before the flood and one during it, same orbit pass.
2. Speckle-filter both (focal median smoothing).
3. Compute the after/before backscatter ratio — flooded ground goes from rough/vegetated (bright in radar) to smooth open water (dark), so the ratio spikes where flooding occurred.
4. Threshold the ratio (fixed 1.25, and via Otsu's method on the histogram) to get a binary flood mask.
5. Mask out permanent water (JRC Global Surface Water) and steep slopes (radar shadow/layover false positives); drop isolated pixels.
6. Intersect the flood mask with ESA WorldCover and WorldPop to quantify exposure.
7. Validate the mapped area against a published figure for the event.
        """
    )
    st.subheader("Why this is the right tool")
    st.markdown(
        """
- **SAR over optical:** radar penetrates cloud and works day/night — floods come with cloud cover, exactly when optical imagery fails.
- **Water is dark in SAR:** a smooth water surface reflects the pulse away from the sensor (specular reflection) instead of scattering it back.
- **Otsu's method:** picks the threshold that maximises between-class variance of the histogram, instead of a hand-picked constant.
        """
    )
