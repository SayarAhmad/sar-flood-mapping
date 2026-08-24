/*
  Exposure assessment: intersects the flood extent from flood_mapping.js
  (`flooded_clean`) with land cover and population to quantify what was
  actually affected. Run this after flood_mapping.js in the same script.
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
  .filterDate('2020-01-01', '2021-01-01') // nearest available year to the event
  .mosaic()
  .clip(geometry);

// Mask WorldPop with the flood extent directly and sum at WorldPop's native
// 100m scale. Earth Engine resamples the two inputs to a common grid during
// reduceRegion, which is far cheaper than an explicit reduceResolution/
// reproject chain (that approach hit the interactive memory limit on this AOI).
var floodedPop = worldpop.updateMask(flooded_clean.select('water'));

var popExposed = floodedPop.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 100,
  maxPixels: 1e13
});
print('Estimated people exposed to flooding:', popExposed);

// ---------- VALIDATION ----------
// Compare `flood_stats` (total flooded hectares from flood_mapping.js) against
// a published figure for the event — state disaster management authority
// report or a Copernicus EMS rapid mapping product.
