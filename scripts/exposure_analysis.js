/*
  Day 3 addon: exposure assessment.
  Intersects the flood extent (from flood_mapping.js: `flooded_clean`) with
  land cover and population to answer "what actually got affected".

  Run this after flood_mapping.js in the same GEE script (or import its
  output as an asset).
*/

// ---------- LAND COVER EXPOSURE (ESA WorldCover, 10m, 2021) ----------
var worldcover = ee.ImageCollection('ESA/WorldCover/v200').first().clip(geometry);

// WorldCover classes: 10 Tree cover, 20 Shrubland, 30 Grassland, 40 Cropland,
// 50 Built-up, 60 Bare/sparse, 70 Snow/ice, 80 Water, 90 Wetland, 95 Mangroves, 100 Moss/lichen
var cropland = worldcover.eq(40);
var builtup  = worldcover.eq(50);

var floodedCropland = flooded_clean.updateMask(cropland);
var floodedBuiltup  = flooded_clean.updateMask(builtup);

var croplandArea = floodedCropland.select('water').multiply(ee.Image.pixelArea())
  .reduceRegion({reducer: ee.Reducer.sum(), geometry: geometry, scale: 10, maxPixels: 1e13});
var builtupArea = floodedBuiltup.select('water').multiply(ee.Image.pixelArea())
  .reduceRegion({reducer: ee.Reducer.sum(), geometry: geometry, scale: 10, maxPixels: 1e13});

print('Flooded cropland (hectares):', ee.Number(croplandArea.get('water')).divide(10000));
print('Flooded built-up (hectares):', ee.Number(builtupArea.get('water')).divide(10000));

// ---------- POPULATION EXPOSURE (WorldPop, 100m, most recent available) ----------
var worldpop = ee.ImageCollection('WorldPop/GP/100m/pop')
  .filterBounds(geometry)
  .filterDate('2020-01-01', '2021-01-01') // adjust to nearest year to your event
  .mosaic()
  .clip(geometry);

// Resample flood mask to population resolution before multiplying to avoid double counting.
var floodedPop = flooded_clean.select('water')
  .reduceResolution({reducer: ee.Reducer.max(), maxPixels: 1024})
  .reproject({crs: worldpop.projection()})
  .multiply(worldpop);

var popExposed = floodedPop.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 100,
  maxPixels: 1e13
});
print('Estimated people exposed to flooding:', popExposed);

// ---------- VALIDATION ----------
// Compare `flood_stats` (total flooded hectares from flood_mapping.js) against a
// published figure for your event (state disaster report / Copernicus EMS product).
// Record the comparison in your README, e.g.:
//   Mapped: 42,300 ha   Reported (Kerala SDMA): 45,000 ha   Agreement: 94%
