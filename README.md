# SAR Flood Mapping and Exposure Assessment

Sentinel-1 SAR change detection for mapping flood extent, applied to the
August 2018 Kerala floods. Optical satellite imagery is mostly useless
during a flood because the same weather that causes the flood also brings
cloud cover, so this uses radar instead — Sentinel-1 sees through cloud and
works at night. The pipeline compares a pre-flood and a during-flood image,
picks out the pixels where backscatter dropped sharply (open water reflects
radar away from the sensor instead of back to it), and cross-references the
result against land cover and population data to estimate what was actually
affected.

Live dashboard: https://sar-flood-mapping-fvupnuedftx6nw7inrtnif.streamlit.app/

**Status:** the core pipeline runs end to end in both GEE and Python. AOI
is currently set to Kuttanad (Alappuzha district), one of the worst-hit
areas in the 2018 floods. Still need to pull the exports into the repo and
add a validation figure — see `results.json`.

## Method

The GEE script (`scripts/flood_mapping.js`) does the following:

- Pulls a Sentinel-1 GRD image (VH polarisation, same orbit pass) from
  before the flood and one during it.
- Applies a focal-median smoothing pass to reduce speckle noise, which is
  inherent to radar imaging (coherent interference of the backscattered
  signal, shows up as salt-and-pepper grain).
- Takes the after/before ratio. Flooded ground goes from rough or vegetated
  (bright in radar) to smooth open water (dark), so the ratio spikes where
  flooding happened.
- Thresholds that ratio to get a binary flood mask. I used the UN-SPIDER
  default of 1.25 first, then added Otsu's method (`otsu_threshold.js`) to
  derive the threshold from the image histogram instead of a fixed
  constant, and compare the two.
- Masks out permanent water using JRC Global Surface Water, and steep
  slopes using a DEM, since terrain-induced radar shadow and layover are
  the main source of false positives at the edges of the AOI.
- Drops isolated single-pixel detections (speckle that survived filtering).

`exposure_analysis.js` then intersects the flood mask with ESA WorldCover
(cropland, built-up area) and WorldPop to get exposure numbers, and
`flood_mapping.py` is a Python port of the same pipeline for local runs and
file exports.

## Repo layout

```
scripts/
  flood_mapping.js       core GEE change-detection script
  otsu_threshold.js       Otsu automatic thresholding
  exposure_analysis.js    WorldCover + WorldPop exposure
  flood_mapping.py        Python/earthengine-api port, writes local exports
app.py                    Streamlit dashboard
results.json              headline numbers, read by the README and the app
exports/                  GeoJSON/CSV the dashboard reads (GeoTIFFs stay local)
```

## Running it

Sign up for [Google Earth Engine](https://earthengine.google.com/) if you
haven't (free for research/non-commercial use). Then either:

**In the browser:** paste `scripts/flood_mapping.js` into the
[GEE Code Editor](https://code.earthengine.google.com/) and run it. Use the
Tasks tab to run the `flood_extent` and `flood_extent_vector` export tasks,
download the results from Drive, and drop `flood_extent_vector.geojson`
into `exports/`.

**Locally:**
```
pip install -r requirements.txt
earthengine authenticate
python scripts/flood_mapping.py
```
This writes `exposure_table.csv` and the GeoTIFFs into `exports/` directly.

Then to see the dashboard:
```
streamlit run app.py
```
It reads `results.json` and whatever's in `exports/` — no Earth Engine
credentials needed, which is why it deploys as-is on Streamlit Community
Cloud.

## Validation

| | Value |
|---|---|
| Event | Kerala floods, August 2018 (Kuttanad, Alappuzha) |
| Mapped flooded area | *(pending)* ha |
| Reported flooded area | *(pending)* |
| Agreement | *(pending)* |

## Limitations

- Speckle filtering is a simple focal median, not a proper Refined Lee
  filter — good enough for this AOI but a coarser tool than SAR imagery
  usually deserves.
- The fixed 1.25 threshold is the UN-SPIDER default, not tuned for this
  specific event; Otsu's threshold is computed as a cross-check but I
  haven't yet validated which one is closer to the true extent.
- One event so far. The method should generalise, but a single case isn't
  enough to know how sensitive the threshold choice is across different
  terrain or land cover.
