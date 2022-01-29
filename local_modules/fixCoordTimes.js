const fixCoordTimes = converted => {
  var lastCoordsTime;

  if (converted && converted.features && converted.features.length) {
    for (var i = 0; i < converted.features.length; i++) {
      var feature = converted.features[i];
      if (feature.geometry.coordinates) {
        if (!feature.properties) feature.properties = {};
        if (!feature.properties.coordTimes) {
          var anyDate = new Date().toISOString();
          feature.properties.coordTimes = feature.geometry.coordinates.map(
            c => anyDate
          );
        }
      }
      if (feature.properties && feature.properties.coordTimes) {
        var coordTimes = feature.properties.coordTimes;
        if (coordTimes.length) {
          for (var j = 0; j < coordTimes.length; j++) {
            if (
              lastCoordsTime &&
              lastCoordsTime >= new Date(coordTimes[j]).getTime()
            ) {
              coordTimes[j] = new Date(lastCoordsTime + 1000).toISOString();
            }
            lastCoordsTime = new Date(coordTimes[j]).getTime();
          }
        }
      }
    }
  }

  return converted;
};

module.exports = fixCoordTimes;
