/*
  Sentinel-1 SAR flood mapping — Google Earth Engine JavaScript
  Method: UN-SPIDER Recommended Practice (change detection on VH backscatter)
  https://un-spider.org/advisory-support/recommended-practices/recommended-practice-google-earth-engine-flood-mapping

  DAY 1 GOAL: run this on the UN-SPIDER example AOI/dates unmodified, get a flood polygon.
  DAY 2 GOAL: swap geometry + dates for a real Indian event (Kerala Aug 2018 / Assam Jun 2022 / Kosi Bihar).
  DAY 3 GOAL: replace the fixed 1.25 threshold with Otsu, add WorldCover/WorldPop exposure, validate.
*/

// ---------- 1. STUDY AREA & DATES (EDIT THESE) ----------
// Placeholder AOI - replace with your event's geometry (draw on map or import a shapefile asset)
var geometry = ee.Geometry.Rectangle([76.0, 9.5, 77.5, 10.5]); // example: Kerala backwaters region

var before_start = '2018-07-01';
var before_end   = '2018-07-31';   // dry-season reference window, same year
var after_start  = '2018-08-15';
var after_end    = '2018-08-25';   // flood event window

Map.centerObject(geometry, 8);

// ---------- 2. LOAD SENTINEL-1 GRD, FILTER ----------
var collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING')) // keep before/after on same pass
  .filterBounds(geometry)
  .select('VH');

var beforeCollection = collection.filterDate(before_start, before_end);
var afterCollection  = collection.filterDate(after_start, after_end);

var before = beforeCollection.mosaic().clip(geometry);
var after  = afterCollection.mosaic().clip(geometry);

// ---------- 3. SPECKLE FILTERING ----------
// Simple smoothing (focal median). Swap for a Refined Lee filter once you understand why.
var smoothing_radius = 50; // meters
var before_filtered = before.focal_median(smoothing_radius, 'circle', 'meters');
var after_filtered  = after.focal_median(smoothing_radius, 'circle', 'meters');

// ---------- 4. CHANGE DETECTION ----------
var difference = after_filtered.divide(before_filtered);

// Fixed threshold (UN-SPIDER default). Day 3: replace with Otsu (see otsu_threshold.js).
var diff_threshold = 1.25;
var flooded = difference.gt(diff_threshold).rename('water').selfMask();

// ---------- 5. MASK OUT PERMANENT WATER (JRC Global Surface Water) ----------
var permanentWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('seasonality').gte(10).clip(geometry);
var flooded_masked = flooded.updateMask(permanentWater.not());

// ---------- 6. MASK STEEP SLOPES (removes radar shadow/layover false positives) ----------
var dem = ee.Image('WWF/HydroSHEDS/03VFDEM');
var slope = ee.Terrain.slope(dem);
var flooded_final = flooded_masked.updateMask(slope.lt(5));

// ---------- 7. REMOVE ISOLATED PIXELS (connectivity filter) ----------
var connections = flooded_final.connectedPixelCount();
var flooded_clean = flooded_final.updateMask(connections.gt(8));

// ---------- 8. AREA CALCULATION ----------
var flood_pixelarea = flooded_clean.select('water').multiply(ee.Image.pixelArea());
var flood_stats = flood_pixelarea.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 10,
  maxPixels: 1e13
});
print('Flooded area (m^2):', flood_stats.get('water'));
print('Flooded area (hectares):', ee.Number(flood_stats.get('water')).divide(10000));

// ---------- 9. VISUALIZATION ----------
Map.addLayer(before_filtered, {min: -25, max: 0}, 'Before (VH dB)', false);
Map.addLayer(after_filtered, {min: -25, max: 0}, 'After (VH dB)', false);
Map.addLayer(flooded_clean, {palette: ['#00FFFF']}, 'Flood extent');

// ---------- 10. EXPORT ----------
Export.image.toDrive({
  image: flooded_clean,
  description: 'flood_extent',
  folder: 'sar-flood-mapping',
  region: geometry,
  scale: 10,
  maxPixels: 1e13
});

// Vectorize the flood mask so it can be dropped into the Streamlit app as a
// lightweight GeoJSON (no raster tile server needed to display it).
var flood_vectors = flooded_clean.reduceToVectors({
  geometry: geometry,
  scale: 10,
  geometryType: 'polygon',
  eightConnected: false,
  maxPixels: 1e13
});
Export.table.toDrive({
  collection: flood_vectors,
  description: 'flood_extent_vector',
  folder: 'sar-flood-mapping',
  fileFormat: 'GeoJSON'
});
