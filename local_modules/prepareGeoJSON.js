function fromGeoJSON(geoJSONstr) {
  let deduceDate = function(preDate) {
    let postDate = preDate;
    if (typeof preDate === "number") {
      postDate = new Date(preDate).toISOString();//aqui check that interpreter matches this string
    }
    return postDate;
  }
  let geoJSON = JSON.parse(geoJSONstr);
  let result = [];
  let checkAndUpdateHome = function(packet,object,key) {
    if  (key.toUpperCase() === "HOME") {
      if (Arra.isArray(object[key])) {
        packet.HOME = object[key].map(num => num.toString());
        return true;
      }
    } else if (key.toUpperCase() === "HOME_LONGITUDE") {
        packet.HOME[0] = object[key].toString();
        return true;
    } else if (key.toUpperCase() === "HOME_LATITUDE") {
        packet.HOME[1] = object[key].toString();
        return true;
    } else if (key.toUpperCase() === "HOME_ELEVATION" || key.toUpperCase() === "HOME_ALTITUDE") {
        packet.HOME[2] = object[key].toString();
        return true;
    }
    return false;
  }
  if (geoJSON.features) {
    result = geoJSON.features.map(feature => {
      if (feature.geometry && feature.geometry.type === "Point") {
        let packet = {
          HOME: [],
          GPS: [],
          DATE: new Date().toISOString()
        };
        if (feature.properties) {
          for (let elt in feature.properties) {
            if (elt.toUpperCase() === "TIMESTAMP" || elt.toUpperCase() === "TIMES" || elt.toUpperCase() === "TIME" || elt.toUpperCase() === "FEATURECOORDTIMES" || elt.toUpperCase() === "COORDTIMES") {
              let date;
              if (typeof feature.properties[elt] === "object" && feature.properties[elt].length > 0) {
                packet.DATE = deduceDate(feature.properties[elt][0]);
              } else {
                packet.DATE = deduceDate(feature.properties[elt]);
              }
            } else if (checkAndUpdateHome(packet,feature.properties,elt)) {
              //do nothing else
            } else {
              packet[elt] = feature.properties[elt].toString();
            }
          }
        }
        if (feature.geometry.coordinates) {
          if (Array.isArray(feature.geometry.coordinates)) {
            if (feature.geometry.coordinates.length > 0) packet.GPS[0] = feature.geometry.coordinates[0].toString();
            if (feature.geometry.coordinates.length > 1) packet.GPS[1] = feature.geometry.coordinates[1].toString();
            if (feature.geometry.coordinates.length > 2) packet.GPS[2] = feature.geometry.coordinates[2].toString();
          }
        }
        return packet;
      }
    });
    result = result.filter(n => n != undefined);
  } else if (geoJSON.type === "Feature" && geoJSON.geometry && geoJSON.geometry.coordinates) {//aqui
    let basePacket = {
      GPS: [],
      DATE: new Date().toISOString(),
      HOME: []
    };
    for (let prop in geoJSON.properties) {
      if (checkAndUpdateHome(basePacket,geoJSON.properties,prop)) {
        //do nothing else
      } else if (!["DATE","TIMECODE","GPS","timestamp","BAROMETER","DISTANCE","SPEED_THREED","SPEED_TWOD","SPEED_VERTICAL","HB","HS"].includes(prop)) {
        basePacket[prop] = geoJSON.properties[prop].toString();
      }
    }
    let returnExisting = function(obj,keys) {
      let result = false;
      keys.forEach(key => {
        if (obj[key]) {
          result = obj[key];
        }
      } );
      return result;
    }
    let dateLocation = returnExisting(geoJSON.properties,["timestamp","times","time","featureCoordTimes","coordTimes"]);
    for (let i=0; i<geoJSON.geometry.coordinates.length; i++) {
      let packet = Object.assign({}, basePacket);
      packet.GPS = geoJSON.geometry.coordinates[i].map(num => num.toString());
      if (geoJSON.properties) {
        if (dateLocation && dateLocation.length > i) {
          packet.DATE = new Date(dateLocation[i]).toISOString();
        }
      }
      result.push(packet);
    }
  } else {
    console.log("nothing found");
  }

  return result;
}

module.exports = fromGeoJSON;
