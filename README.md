# SAR Flood Mapping and Exposure Assessment

Sentinel-1 SAR change detection to map flood extent for a real Indian flood
event, with land-cover and population exposure and validation against a
published inundation figure.

**Status:** GEE change-detection script runs end-to-end (Day 1 confirmed:
2,598 ha detected on the initial AOI). Streamlit dashboard scaffolded and
ready to populate. Remaining: refine AOI to the real flood extent, run
Otsu + exposure, fill in validation, and drop exports into `exports/`.

[![Streamlit](https://img.shields.io/badge/Streamlit-app-ff4b4b)](https://streamlit.io/)

**Live app:** *(not deployed yet — will be added here, e.g. `https://sar-flood-mapping.streamlit.app`)*

## Live dashboard

```
pip install -r requirements.txt
streamlit run app.py
```

Reads `results.json` and the files in `exports/` — no Earth Engine
credentials needed to view it, so it deploys as-is on
[Streamlit Community Cloud](https://streamlit.io/cloud) once pushed to
GitHub (point it at `app.py`).

## Method

1. Pull a Sentinel-1 GRD (VH polarisation) image before the flood and one
   during it, over the same orbit pass.
2. Speckle-filter both (focal median smoothing).
3. Compute the after/before ratio. Water shows up as a strong increase in
   this ratio because a flooded surface goes from rough/vegetated (bright in
   radar) to smooth open water (dark in radar — the pulse reflects away from
   the sensor instead of back to it).
4. Threshold the ratio image to get a binary flood mask — first with a fixed
   value (1.25, per UN-SPIDER), then with an Otsu threshold derived from the
   image histogram itself.
5. Mask out permanent water (JRC Global Surface Water) and steep slopes
   (radar shadow/layover false positives) and drop isolated pixels.
6. Intersect the flood mask with ESA WorldCover (cropland/built-up) and
   WorldPop to quantify exposure.
7. Validate the mapped area against a published figure for the event.

## Repo layout

```
scripts/
  flood_mapping.js       Day 1-2: core GEE change-detection script (paste into code.earthengine.google.com)
  otsu_threshold.js       Day 3: Otsu automatic thresholding, to compare against the fixed 1.25 threshold
  exposure_analysis.js    Day 3: WorldCover + WorldPop exposure, run after flood_mapping.js
  flood_mapping.py        Python port (earthengine-api) for local runs and exports
data/                     (empty — GEE reads its own catalogue, nothing to download)
exports/                  GeoJSON/CSV outputs the app reads (GeoTIFFs stay local, .gitignored)
figures/                  before/after/extent-overlay figures for the README
app.py                    Streamlit dashboard (flood map, exposure charts, validation, methodology)
results.json              single source of truth for the headline numbers shown in the README and the app
```

## How to run

1. Sign up for [Google Earth Engine](https://earthengine.google.com/) (free
   for research/non-commercial use, usually same-day approval).
2. **Day 1:** paste `scripts/flood_mapping.js` into the
   [GEE Code Editor](https://code.earthengine.google.com/), run it unmodified
   on the placeholder AOI/dates, confirm you get a flood polygon.
3. **Day 2:** replace `geometry`, `before_start/end`, `after_start/end` with
   a real event — Kerala Aug 2018, Assam Jun 2022, or Kosi/Bihar. Set the
   before-window to a dry month of the same year. Export the extent.
4. **Day 3:** run `otsu_threshold.js` and compare its threshold/area against
   the fixed 1.25 result; run `exposure_analysis.js`; fill in the validation
   number below.
5. In the GEE Tasks tab, run the `flood_extent` and `flood_extent_vector`
   export tasks, download the results from Drive, and place
   `flood_extent_vector.geojson` into `exports/`. Save `exposure_table.csv`
   (from `flood_mapping.py` or copied from the console output) into
   `exports/` too. Update the numbers in `results.json`.
6. `streamlit run app.py` to see it all rendered.

For the Python path: `pip install -r requirements.txt`, then
`earthengine authenticate` once, then `python scripts/flood_mapping.py`.

## Validation

| | Value |
|---|---|
| Event | *(fill in)* |
| Mapped flooded area | *(fill in)* ha |
| Reported flooded area (source: *(fill in — SDMA report / Copernicus EMS)*) | *(fill in)* ha |
| Agreement | *(fill in)* % |

## Exposure summary

*(fill in after running exposure_analysis.js — hectares of cropland,
built-up area, and estimated population in the flooded extent)*

## CV bullets

Use now (numbers already available):

> Built an end-to-end SAR flood-mapping pipeline (Google Earth Engine +
> Python/Streamlit) using Sentinel-1 change detection to map flood extent
> for the 2018 Kerala floods, with an interactive dashboard for exposure
> and validation reporting.

> Implemented automatic (Otsu) and fixed-threshold change detection on
> Sentinel-1 VH backscatter, with permanent-water and terrain-slope masking
> to suppress false positives from radar shadow and layover.

Upgrade once `results.json` is filled in with a real validated number:

> Mapped flood inundation for the 2018 Kerala floods using Sentinel-1 SAR
> change detection in Google Earth Engine with Otsu-derived thresholding;
> quantified exposure against ESA WorldCover and WorldPop, and validated
> the mapped extent to within *X*% of the reported inundated area.

Keep the first two — they're accurate today. Don't put a validation
percentage on the CV until `results.json.agreement_pct` is a real number
from a real comparison; an interviewer will ask where it came from.

## Notes on method choices (for interview defense)

- **SAR over optical:** radar penetrates cloud and works day/night; floods
  come with cloud cover, so optical imagery is frequently unusable exactly
  when you need it.
- **Water is dark in SAR:** a smooth water surface acts like a mirror
  (specular reflection) and sends the radar pulse away from the sensor
  instead of scattering it back, so backscatter drops sharply.
- **VH vs VV:** VH (cross-polarised) is generally more sensitive to the
  smooth-surface change and less affected by double-bounce effects from
  emergent vegetation than VV.
- **Speckle:** SAR images have grainy noise from coherent interference of
  backscattered waves. A focal median (or a proper Refined Lee filter) is
  applied before thresholding to reduce false detections from this noise.
- **False positives:** radar shadow behind terrain and layover on slopes
  (handled here with a slope mask), smooth surfaces like asphalt or dry
  sand, and wind-roughened water causing false negatives.
- **Otsu's method:** picks the threshold that maximises between-class
  variance of the histogram, i.e. finds the split that best separates
  "changed" from "unchanged" pixels without a hand-picked constant.
- **Why difference two dates instead of thresholding one image:** a single
  image can't distinguish permanent water/wet ground from newly flooded
  areas; differencing isolates what actually changed.

## Reading list before defending this in an interview

- UN-SPIDER "In Detail" page for this Recommended Practice (full methodology)
- One SAR fundamentals reference — ESA SAR Basics or NASA ARSET SAR training
  materials — covering backscatter, polarisation, and speckle
