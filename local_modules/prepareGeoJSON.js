function fromGeoJSON(JSONstr, { speeds2D, speeds3D }) {
  let deduceDate = function(preDate) {
    let postDate = preDate;
    if (typeof preDate === 'number') {
      postDate = new Date(preDate).toISOString(); //check that interpreter matches this string
    }
    return postDate;
  };
  let schema = {
    HOME: ['0', '0'],
    GPS: ['0', '0', '0'],
    DATE: new Date().toISOString()
  };

  let geoJSON = typeof JSONstr === 'string' ? JSON.parse(JSONstr) : JSONstr;
  let result = [];
  let checkAndUpdateHome = function(packet, object, key) {
    if (key.toUpperCase() === 'HOME') {
      if (Arra.isArray(object[key])) {
        packet.HOME = object[key].map(num => num.toString());
        return true;
      }
    } else if (key.toUpperCase() === 'HOME_LONGITUDE') {
      packet.HOME[0] = object[key].toString();
      return true;
    } else if (key.toUpperCase() === 'HOME_LATITUDE') {
      packet.HOME[1] = object[key].toString();
      return true;
    } else if (key.toUpperCase() === 'HOME_ELEVATION' || key.toUpperCase() === 'HOME_ALTITUDE') {
      packet.HOME[2] = object[key].toString();
      return true;
    }
    return false;
  };
  let looksLikeNumber = function(val) {
    if (isNaN(val)) return false;
    if (typeof val === 'number') return true;
    if (/^(\d|\.|\-)+$/.test(val)) return true;
    return false;
  };
  let managed = false;
  let arr = false;
  if (geoJSON.features && Array.isArray(geoJSON.features)) {
    arr = true;
    if (geoJSON.features.length > 1) {
      result = geoJSON.features.map(feature => {
        if (
          feature.geometry &&
          feature.geometry.type === 'Point' &&
          feature.geometry.coordinates &&
          looksLikeNumber(feature.geometry.coordinates[0])
        ) {
          let packet = JSON.parse(JSON.stringify(schema));
          if (feature.properties) {
            if (feature.properties.desc) {
              let propRegex = /\b(\w+)=(.+)(?:\r\n|\r|\n)/g;
              let match;
              while ((match = propRegex.exec(feature.properties.desc)) !== null) {
                let value = /^(\d|\.|\-)+$/.test(match[2]) ? Number(match[2]) : match[2];
                feature.properties[match[1]] = value;
              }
              delete feature.properties.desc;
            }
            for (let elt in feature.properties) {
              if (
                ['TIMESTAMP', 'TIMES', 'TIME', 'FEATURECOORDTIMES', 'COORDTIMES'].includes(
                  elt.toUpperCase()
                )
              ) {
                let date;
                if (Array.isArray(feature.properties[elt]) && feature.properties[elt].length > 0) {
                  packet.DATE = deduceDate(feature.properties[elt][0]);
                } else {
                  packet.DATE = deduceDate(feature.properties[elt]);
                }
              } else if (checkAndUpdateHome(packet, feature.properties, elt)) {
                //do nothing else
              } else {
                packet[elt.toUpperCase()] = feature.properties[elt].toString();
              }
            }
          }
          if (feature.geometry.coordinates) {
            if (Array.isArray(feature.geometry.coordinates)) {
              managed = true;
              if (feature.geometry.coordinates.length > 0)
                packet.GPS[0] = feature.geometry.coordinates[0].toString();
              if (feature.geometry.coordinates.length > 1)
                packet.GPS[1] = feature.geometry.coordinates[1].toString();
              if (feature.geometry.coordinates.length > 2)
                packet.GPS[2] = feature.geometry.coordinates[2].toString();
            }
          }
          return packet;
        }
      });
      result = result.filter(n => n != undefined);
    }
  }
  let chooseFeature = function(arr) {
    return arr.reduce((acc, pckt) => {
      if (
        pckt.type === 'Feature' &&
        pckt.geometry &&
        Array.isArray(pckt.geometry.coordinates) &&
        pckt.geometry.coordinates.length >= acc.geometry.coordinates.length
      )
        return pckt;
    }, arr[0]);
  };
  if (!managed) {
    let object = arr ? chooseFeature(geoJSON.features) : geoJSON;
    if (object.type === 'Feature' && object.geometry && object.geometry.coordinates) {
      let basePacket = JSON.parse(JSON.stringify(schema));
      for (let prop in object.properties) {
        if (checkAndUpdateHome(basePacket, object.properties, prop)) {
          //do nothing else
        } else if (
          ![
            'DATE',
            'TIMECODE',
            'GPS',
            'TIMESTAMP',
            'BAROMETER',
            'DISTANCE',
            'SPEED_THREED',
            'SPEED_TWOD',
            'SPEED_VERTICAL',
            'HB',
            'HS',
            'TIMES',
            'TIME',
            'FEATURECOORDTIMES',
            'COORDTIMES'
          ].includes(prop.toUpperCase())
        ) {
          basePacket[prop.toUpperCase()] = object.properties[prop].toString();
        }
      }
      let returnExisting = function(obj, keys) {
        let result = false;
        keys.forEach(key => {
          if (obj[key] != null) {
            result = obj[key];
          }
        });
        return result;
      };
      let dateLocation = returnExisting(object.properties, [
        'timestamp',
        'times',
        'time',
        'featureCoordTimes',
        'coordTimes',
        'AbsoluteUtcMicroSec'
      ]);
      for (let i = 0; i < object.geometry.coordinates.length; i++) {
        managed = true;
        if (looksLikeNumber(object.geometry.coordinates[0][0])) {
          let packet = JSON.parse(JSON.stringify(schema));
          packet.GPS = object.geometry.coordinates[i].map(num => num.toString());
          if (packet.GPS.length < 3) packet.GPS[2] = 0;
          if (object.properties) {
            if (dateLocation && dateLocation.length > i) {
              if (looksLikeNumber(dateLocation[i]) && dateLocation[i].toString().length > 15) {
                packet.DATE = new Date(dateLocation[i] / 1000).toISOString();
              } else {
                packet.DATE = new Date(dateLocation[i]).toISOString();
              }
            }
          }
          result.push(packet);
        }
      }
    }
  }

  if (!managed) {
    if (Array.isArray(geoJSON) && geoJSON[0].GPS && looksLikeNumber(geoJSON[0].GPS[0])) {
      result = geoJSON;
      managed = true;
    }
  }

  let generateStandardPacket = function(pckt) {
    let packet = JSON.parse(JSON.stringify(schema));
    for (let prop in pckt) {
      if (pckt[prop]) {
        if (['LONGITUDE', 'LON'].includes(prop.toUpperCase()))
          packet.GPS[0] = pckt[prop].toString();
        else if (['LATITUDE', 'LAT'].includes(prop.toUpperCase()))
          packet.GPS[1] = pckt[prop].toString();
        else if (['ALTITUDE', 'ALT'].includes(prop.toUpperCase()))
          packet.GPS[2] = pckt[prop].toString();
        else if (
          'UTC' === prop.toUpperCase() &&
          typeof pckt[prop] === 'number' &&
          pckt[prop].toString().length > 13
        ) {
          let d = (d = new Date(0));
          d.setUTCMilliseconds(pckt[prop] / 1000);
          packet.DATE = d.toISOString();
        } else if (
          ['DEVICETIME', 'TIME', 'TIMES', 'FEATURECOORDTIMES', 'COORDTIMES'].includes(
            prop.toUpperCase()
          )
        )
          packet.DATE = new Date(pckt[prop]).toISOString();
        else packet[prop.toUpperCase()] = pckt[prop].toString();
      }
    }
    return packet;
  };

  if (!managed) {
    let pointer;
    if (
      Array.isArray(geoJSON.data) &&
      (geoJSON.data[0].lat ||
        geoJSON.data[0].LAT ||
        geoJSON.data[0].latitude ||
        geoJSON.data[0].LATITUDE)
    ) {
      pointer = geoJSON.data;
    } else if (
      Array.isArray(geoJSON) &&
      (geoJSON[0].lat || geoJSON[0].LAT || geoJSON[0].latitude || geoJSON[0].LATITUDE)
    ) {
      pointer = geoJSON;
    }
    if (pointer) {
      result = [];
      pointer.forEach(pckt => {
        result.push(generateStandardPacket(pckt));
      });
      managed = true;
    }
  }
  if (!managed) {
    console.log('nothing found');
  }

  //Apply known speeds
  if (speeds2D && result.length === speeds2D.length)
    result.forEach((r, i) => {
      //convert m/s to km/h
      r.SPEED_TWOD = '' + (60 * 60 * speeds2D[i]) / 1000;
    });
  if (speeds3D && result.length === speeds3D.length)
    result.forEach((r, i) => {
      //convert m/s to km/h
      r.SPEED_THREED = '' + (60 * 60 * speeds3D[i]) / 1000;
    });

  if (
    speeds3D &&
    result.length === speeds3D.length &&
    speeds2D &&
    result.length === speeds2D.length
  ) {
    result.forEach((r, i) => {
      //convert m/s to km/h
      const newSide = Math.sqrt(speeds3D[i] * speeds3D[i] - speeds2D[i] * speeds2D[i]);
      r.SPEED_VERTICAL = '' + (60 * 60 * newSide) / 1000;
    });
  }

  return JSON.stringify(result);
}

module.exports = fromGeoJSON;
