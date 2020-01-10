function helper() {
  function doNf(num, left, right) {
    var neg = num < 0;
    var n = neg ? num.toString().substring(1) : num.toString();
    var decimalInd = n.indexOf('.');
    var intPart = decimalInd !== -1 ? n.substring(0, decimalInd) : n;
    var decPart = decimalInd !== -1 ? n.substring(decimalInd + 1) : '';
    var str = neg ? '-' : '';
    if (typeof right !== 'undefined') {
      var decimal = '';
      if (decimalInd !== -1 || right - decPart.length > 0) {
        decimal = '.';
      }
      if (decPart.length > right) {
        decPart = decPart.substring(0, right);
      }
      for (var i = 0; i < left - intPart.length; i++) {
        str += '0';
      }
      str += intPart;
      str += decimal;
      str += decPart;
      for (var j = 0; j < right - decPart.length; j++) {
        str += '0';
      }
      return str;
    } else {
      for (var k = 0; k < Math.max(left - intPart.length, 0); k++) {
        str += '0';
      }
      str += n;
      return str;
    }
  }

  function convertDMS(lat, lng) {
    function toDegreesMinutesAndSeconds(coordinate) {
      //FROM https://stackoverflow.com/questions/37893131/how-to-convert-lat-long-from-decimal-degrees-to-dms-format
      var absolute = Math.abs(coordinate);
      var degrees = Math.floor(absolute);
      var minutesNotTruncated = (absolute - degrees) * 60;
      var minutes = Math.floor(minutesNotTruncated);
      var seconds = Math.floor((minutesNotTruncated - minutes) * 60);
      return degrees + 'º ' + minutes + "' " + seconds + "''";
    }
    var latitude = toDegreesMinutesAndSeconds(lat);
    var latitudeCardinal = lat >= 0 ? 'N' : 'S';
    var longitude = toDegreesMinutesAndSeconds(lng);
    var longitudeCardinal = lng >= 0 ? 'E' : 'W';
    return (
      latitude +
      ' ' +
      latitudeCardinal +
      ' ' +
      longitude +
      ' ' +
      longitudeCardinal
    );
  }

  function readOneFile(file) {
    return new Promise((resolve, reject) => {
      var reader = new FileReader();
      reader.onload = event => resolve(event.target.result); // desired file content
      reader.onerror = error => reject(error);
      reader.readAsText(file); // you could also read images and other binaries
    });
  }

  return {
    formatCamera: function(pckt) {
      let phrase = [];
      if (pckt.ISO != null) phrase.push('ISO: ' + pckt.ISO);
      if (pckt.FNUM != null) phrase.push('Aperture: F' + pckt.FNUM);
      if (pckt.SHUTTER != null) phrase.push('Shutter: 1/' + pckt.SHUTTER);
      if (pckt.EV != null) phrase.push('EV: ' + doNf(pckt.EV, 1, 1));
      return phrase.join(' | '); //VALUE
    },
    formatCoordinates: function(gps) {
      return 'Location: ' + convertDMS(gps.LATITUDE, gps.LONGITUDE);
    },
    formatDistance: function(curr, tot) {
      curr /= 1000;
      tot /= 1000;
      return (
        'Disance: ' + doNf(curr, 1, 2) + ' km / ' + doNf(tot, 1, 2) + ' km'
      );
    },
    formatDate: function(date) {
      return (
        new Date(date).toLocaleDateString() +
        ' | ' +
        new Date(date).toLocaleTimeString()
      );
    },
    loadDialog: function(p, confirm) {
      document
        .querySelector('#loadFiles')
        .addEventListener('change', async event => {
          let { files } = event.target;
          if (files && files.length) {
            var result = {};
            files = Array.from(files);
            if (
              files.length === 1 ||
              //Only merge SRT files, for other formats, pick the first one
              files.some(f => !f.name.match(/\.srt$/i))
            ) {
              result.name = files[0].name;
              result.data = await readOneFile(files[0]).catch(e => {
                confirm({});
              });
              confirm(result);
            } else {
              files.sort((a, b) => a.lastModified - b.lastModified);
              result.name = files.map(f => f.name).join('+');
              result.data = '';
              for (var i = 0; i < files.length; i++) {
                result.data += await readOneFile(files[i]).catch(e => {});
              }
              confirm(result);
            }
          } else confirm({});
        });
      document.getElementById('loadFiles').click();
    },
    launchGoogleMaps: function(lat, lon) {
      function link(url, winName, options) {
        (winName && open(url, winName, options)) || (location = url);
      }
      let url =
        'https://www.google.com/maps/search/?api=1&query=' + lat + '%2C' + lon;
      link(url, '_blank');
    },
    preloadFile: function(file, cb) {
      function loadFileBrowser(file) {
        function readTextFile(file) {
          let rawFile = new XMLHttpRequest();
          let allText;
          rawFile.open('GET', file, true);
          rawFile.onreadystatechange = function() {
            if (rawFile.readyState === 4) {
              if (rawFile.status === 200 || rawFile.status == 0) {
                let allText = rawFile.responseText;
                let fileName = rawFile.responseURL
                  ? rawFile.responseURL.match(/\b\w+\.(srt|SRT)$/g)[0]
                  : 'SRT_Data';
                let dataObj = {
                  data: allText,
                  name: fileName
                };
                cb(dataObj);
              }
            }
          };
          rawFile.send(null);
        }
        readTextFile(file);
      }
      loadFileBrowser(file);
    }
  };
}
module.exports = helper();
