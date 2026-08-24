/*
  Otsu's method for automatic threshold selection, applied to the
  after/before VH ratio image from flood_mapping.js. GEE implementation
  based on the standard approach (Gorelick et al.).

  Otsu picks the threshold that maximises the between-class variance of the
  histogram — the split point that best separates flooded from unchanged
  pixels, rather than relying on a fixed guess like 1.25.

  Usage, after computing `difference` in flood_mapping.js:
    var otsu_threshold = computeOtsuThreshold(difference, geometry);
    print('Otsu threshold:', otsu_threshold);
    var flooded_otsu = difference.gt(otsu_threshold).rename('water').selfMask();
  Compare flooded_otsu's area against the fixed-threshold result.
*/

function otsu(histogram) {
  var counts = ee.Array(ee.Dictionary(histogram).get('histogram'));
  var means = ee.Array(ee.Dictionary(histogram).get('bucketMeans'));
  var size = means.length().get([0]);
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
  var mean = sum.divide(total);

  var indices = ee.List.sequence(1, size);

  // Between-class variance for every possible split point.
  var bss = indices.map(function(i) {
    i = ee.Number(i);
    var aCounts = counts.slice(0, 0, i);
    var aCount = aCounts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var aMeans = means.slice(0, 0, i);
    var aMean = aMeans.multiply(aCounts)
      .reduce(ee.Reducer.sum(), [0]).get([0])
      .divide(aCount);
    var bCount = total.subtract(aCount);
    var bMean = sum.subtract(aCount.multiply(aMean)).divide(bCount);
    return aCount.multiply(aMean.subtract(mean).pow(2))
      .add(bCount.multiply(bMean.subtract(mean).pow(2)));
  });

  // The threshold is the bucket mean at the index that maximises between-class variance.
  return means.sort(bss).get([-1]);
}

function computeOtsuThreshold(image, region, scale) {
  scale = scale || 10;
  var histogram = image.reduceRegion({
    reducer: ee.Reducer.histogram(255, 0.1),
    geometry: region,
    scale: scale,
    maxPixels: 1e13,
    bestEffort: true
  }).get(image.bandNames().get(0));

  return otsu(histogram);
}
