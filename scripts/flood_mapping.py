"""
Python port of flood_mapping.js (earthengine-api). Runs the same
change-detection pipeline, exports GeoTIFFs locally via geemap, and writes
the exposure table to CSV.

Setup:
    pip install -r ../requirements.txt
    earthengine authenticate   # one-time browser auth, same GEE account as the Code Editor

Run:
    python flood_mapping.py
"""

import ee
import geemap
import pandas as pd

ee.Initialize(project="sentinel-1-sar-flood-mapping")

# ---------- 1. STUDY AREA & DATES ----------
# Kuttanad, Alappuzha district — the low-lying "rice bowl" of Kerala (parts sit
# below sea level), among the worst-hit areas in the August 2018 floods.
# Must match scripts/flood_mapping.js so the GeoJSON export and this CSV
# describe the same area.
GEOMETRY = ee.Geometry.Rectangle([76.25, 9.25, 76.65, 9.75])
BEFORE_START, BEFORE_END = "2018-07-01", "2018-07-31"
AFTER_START, AFTER_END = "2018-08-15", "2018-08-25"
DIFF_THRESHOLD = 1.25
SMOOTHING_RADIUS = 50  # meters


def load_s1_collection():
    return (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
        .filter(ee.Filter.eq("orbitProperties_pass", "DESCENDING"))
        .filterBounds(GEOMETRY)
        .select("VH")
    )


def compute_flood_extent():
    collection = load_s1_collection()
    before = collection.filterDate(BEFORE_START, BEFORE_END).mosaic().clip(GEOMETRY)
    after = collection.filterDate(AFTER_START, AFTER_END).mosaic().clip(GEOMETRY)

    before_f = before.focal_median(SMOOTHING_RADIUS, "circle", "meters")
    after_f = after.focal_median(SMOOTHING_RADIUS, "circle", "meters")

    difference = after_f.divide(before_f)
    flooded = difference.gt(DIFF_THRESHOLD).rename("water").selfMask()

    permanent_water = (
        ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("seasonality").gte(10).clip(GEOMETRY)
    )
    flooded = flooded.updateMask(permanent_water.Not())

    dem = ee.Image("WWF/HydroSHEDS/03VFDEM")
    slope = ee.Terrain.slope(dem)
    flooded = flooded.updateMask(slope.lt(5))

    connections = flooded.connectedPixelCount()
    flooded_clean = flooded.updateMask(connections.gt(8))

    return flooded_clean, before_f, after_f, difference


def area_hectares(mask_image, geometry=GEOMETRY, scale=10):
    area_img = mask_image.select("water").multiply(ee.Image.pixelArea())
    stats = area_img.reduceRegion(
        reducer=ee.Reducer.sum(), geometry=geometry, scale=scale, maxPixels=1e13
    )
    m2 = stats.get("water").getInfo() or 0
    return m2 / 10000.0


def exposure_table(flooded_clean):
    worldcover = ee.ImageCollection("ESA/WorldCover/v200").first().clip(GEOMETRY)
    cropland = worldcover.eq(40)
    builtup = worldcover.eq(50)

    cropland_ha = area_hectares(flooded_clean.updateMask(cropland))
    builtup_ha = area_hectares(flooded_clean.updateMask(builtup))

    return pd.DataFrame(
        [
            {"category": "cropland", "flooded_hectares": cropland_ha},
            {"category": "built-up", "flooded_hectares": builtup_ha},
        ]
    )


def export_geotiff(image, filename, geometry=GEOMETRY, scale=10):
    geemap.ee_export_image(
        image, filename=filename, scale=scale, region=geometry, file_per_band=False
    )


if __name__ == "__main__":
    print("Computing flood mask (Sentinel-1 load, speckle filter, threshold, masks)...", flush=True)
    flooded_clean, before_f, after_f, difference = compute_flood_extent()
    print("Flood mask computed.", flush=True)

    print("Requesting flooded area from Earth Engine (reduceRegion)...", flush=True)
    total_ha = area_hectares(flooded_clean)
    print(f"Total flooded area: {total_ha:,.1f} hectares", flush=True)

    print("Computing exposure table (WorldCover intersection)...", flush=True)
    table = exposure_table(flooded_clean)
    table.to_csv("../exports/exposure_table.csv", index=False)
    print(table, flush=True)

    print("Exporting GeoTIFFs (this hits the network, can take a while)...", flush=True)
    export_geotiff(flooded_clean, "../exports/flood_extent.tif")
    print("  flood_extent.tif done", flush=True)
    export_geotiff(before_f, "../exports/before_vh.tif")
    print("  before_vh.tif done", flush=True)
    export_geotiff(after_f, "../exports/after_vh.tif")
    print("  after_vh.tif done", flush=True)
    print("All done.", flush=True)
