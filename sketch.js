'use strict';

var s = function(p) {
  //p5js functions
  const DJISRTParser = require('dji_srt_parser'),
    conversions = require('latlon_to_xy'),
    helper = require('./local_modules/helper'),
    map = require('mapbox_static_helper'),
    mapBoxToken = require('./keys/mapBoxToken'), //token for mapbox
    mapImages = require('./local_modules/map_drawer'),
    createPlayer = require('./local_modules/create_player'),
    visual_setup = require('./local_modules/visual_setup'),
    gui = require('p5_gui'),
    togeojson = require('@mapbox/togeojson'),
    DOMParser = require('xmldom').DOMParser,
    fromText = require('./local_modules/fromText'),
    prepareGeoJSON = require('./local_modules/prepareGeoJSON'),
    tokml = require('tokml'),
    togpx = require('togpx');

  let preferences,
    colors,
    DJIData,
    dataLoaded,
    player,
    can,
    gui_elts, //will store all the gui_elts elements and functions
    sizes;
  const tileH = 512;
  //will store the paths image to speed up drawing
  let memo = null;
  //Remember if this is an external or internal file
  let external = false;

  //Show welcome screen
  let showWelcome = true;
  let welcomeText =
    'Visualize and convert your DJI drone telemetry\nMade for SRT files (Video Caption)\nCompatible with other formats (KML, GPX, GeoJSON)';

  p.preload = function() {
    let urlParam = function(name) {
      var results = new RegExp('[?&]' + name + '=([^&#]*)').exec(
        window.location.href
      );
      if (results == null) {
        return null;
      } else {
        return decodeURI(results[1]) || 0;
      }
    };
    let source = urlParam('source');
    function loadDemo() {
      helper.preloadFile(
        './samples/sample' + Math.floor(Math.random() * 5) + '.SRT',
        confirm,
        true
      );
    }
    const alternative = function(msg) {
      return function() {
        welcomeText = msg;
        gui.welcomeText = msg;
        loadDemo();
      };
    };
    if (source != null) {
      if (/\.gpx$/.test(source)) {
        fetch(source, {
          method: 'GET'
        })
          .then(function(response) {
            return response.text();
          })
          .then(str => {
            //Errors come as JSON, try to parse them
            let error = null;
            try {
              error = JSON.parse(str).error;
            } catch (error) {}
            if (str == null || str.length < 3 || error) {
              alternative(
                'File not found.\nIf you were using the GoPro Telemetry Extractor,\nthis means your file was deleted from our server to preserve your privacy.\nYou can load the file again from the GoPro Telemetry Extractor\nor download it in GPX to use it later.'
              )();
            } else {
              confirm(
                { data: str, name: source.split('/').pop() },
                alternative('Error loading file'),
                true
              );
            }
          })
          .catch(error => {
            alternative(
              'Error loading file. Please check that your file is available.'
            )();
          });
      } else {
        alternative('File type not supported')();
      }
    } else {
      loadDemo();
    }
  };

  function loadMap(zoom) {
    // let mapW = p.width+p.width*(1-sizes.main)*2;
    // let mapH = p.height+sizes.bottom.height*2; //cover all usable screen with map (too many map views in mapbox)
    let mapW = sizes.mainW.width;
    let mapH = sizes.mainW.height;
    map.setup(
      mapBoxToken,
      mapW,
      mapH,
      zoom,
      preferences.map,
      conversions,
      1024
    );
  }

  function setZoom() {
    //calculate necessary zoom to keep all map inside screen. Maybe should be a method of the latlong module?
    DJIData.setSmoothing(0);
    let acr = DJIData.metadata().stats.GPS;

    let midLat = (acr.LATITUDE.max + acr.LATITUDE.min) / 2;
    let midLon = (acr.LONGITUDE.max + acr.LONGITUDE.min) / 2;
    let zoom = 1;

    conversions.setupConversor(tileH, zoom, midLon, midLat);
    function isOutside(lon, lat) {
      let sLon = conversions.lonToX(lon) + sizes.mainW.width / 2;
      let sLat = conversions.latToY(lat) + sizes.mainW.height / 2;
      let w = sizes.mainW.width - sizes.margin;
      let h = sizes.mainW.height - sizes.margin;
      if (sLon > w || sLon < sizes.margin) return true;
      if (sLat > h || sLat < sizes.margin) return true;
      return false;
    }
    let zoomSteps = 0.05;
    while (
      !isOutside(acr.LONGITUDE.max, acr.LATITUDE.max) &&
      !isOutside(acr.LONGITUDE.min, acr.LATITUDE.min)
    ) {
      zoom += zoomSteps;
      conversions.setupConversor(tileH, zoom, midLon, midLat);
      if (zoom >= 20) break;
    }
    zoom -= zoomSteps;
    conversions.setupConversor(tileH, zoom, midLon, midLat);
    DJIData.setSmoothing(preferences.smooth);
    for (let i = 0; i < 10; i++) {
      //check that mercator conversions are working right
      let x = p.random(-180, 180);
      if (Math.abs(x - conversions.lonToX(conversions.xToLon(x))) > 1)
        console.error('error x: ' + x);
      let y = p.random(-85, 85);
      if (Math.abs(y - conversions.latToY(conversions.yToLat(y))) > 1)
        console.error('error y: ' + y);
    }
    return zoom;
  }

  function isDataValid(DJIData) {
    try {
      let toCheck = [
        DJIData.getFileName(),
        DJIData.metadata().stats.DATE,
        // not essential? DJIData.metadata().stats.HOME[0].LATITUDE,
        DJIData.metadata().stats.SPEED.THREED.avg,
        // not effective DJIData.metadata().stats.BAROMETER || DJIData.metadata().stats.HB || DJIData.metadata().stats.HS || DJIData.metadata().stats.GPS.ALTITUDE,
        DJIData.metadata().stats.DURATION,
        DJIData.metadata().stats.DISTANCE,
        DJIData.metadata().stats.GPS.LATITUDE.avg
      ];
      if (toCheck.indexOf(null) > -1) return false;
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  function displayError() {
    if (gui_elts && gui_elts.topHint) {
      gui_elts.topHint.setValue('Sorry. File not supported.');
    } else {
      console.error('There was an error loading file');
    }
  }

  function hasExtension(filename, ext) {
    return (
      filename.substring(filename.length - ext.length).toUpperCase() ===
      ext.toUpperCase()
    );
  }

  let decode = function(d) {
    if (typeof d === 'string' && d.split(',')[0].includes('base64')) {
      return atob(d.split(',')[1]);
    } else {
      return d;
    }
  };

  function confirm(f, alternative, isExternal = false, demo) {
    external = false;
    memo = null;
    const onError = function(msg) {
      console.error(msg);
      displayError();
      if (alternative) alternative();
    };
    try {
      if (f.data && f.name) {
        let preDJIData;
        if (hasExtension(f.name, '.SRT')) {
          preDJIData = DJISRTParser(f.data, f.name);
        } else if (
          hasExtension(f.name, '.JSON') ||
          hasExtension(f.name, '.GEOJSON')
        ) {
          preDJIData = DJISRTParser(
            prepareGeoJSON(decode(f.data)),
            f.name,
            true
          );
        } else if (hasExtension(f.name, '.KML')) {
          var kml = new DOMParser().parseFromString(decode(f.data));
          var element = kml.getElementsByTagName('Style'),
            index;
          for (index = element.length - 1; index >= 0; index--) {
            element[index].parentNode.removeChild(element[index]);
          }
          var converted = togeojson.kml(kml);
          preDJIData = DJISRTParser(prepareGeoJSON(converted), f.name, true);
        } else if (hasExtension(f.name, '.text')) {
          var converted = fromText(f.data);
          preDJIData = DJISRTParser(converted, f.name);
        } else if (hasExtension(f.name, '.GPX')) {
          var gpx = new DOMParser().parseFromString(decode(f.data));
          var converted = togeojson.gpx(gpx);
          ///hack to extract GoPro speeds
          const speed3DRE = /<gpxtpx:speed>[\d.]+<\/gpxtpx:speed>/g;
          const speed2DRE = /2dSpeed:\s?[\d.]+/g;
          const speed3DREbis = /3dSpeed:\s?[\d.]+/g;

          let matches = decode(f.data).match(speed3DRE);
          let speeds3D, speeds2D;
          if (matches) {
            speeds3D = matches.map(
              m => +m.replace(/<gpxtpx:speed>([\d.]+)<\/gpxtpx:speed>/, '$1')
            );
          }

          if (!speeds3D) {
            matches = decode(f.data).match(speed3DREbis);
            if (matches) {
              speeds3D = matches.map(
                m => +m.replace(/3dSpeed:\s?([\d.]+)/, '$1')
              );
            }
          }

          matches = decode(f.data).match(speed2DRE);
          if (matches) {
            speeds2D = matches.map(
              m => +m.replace(/2dSpeed:\s?([\d.]+)/, '$1')
            );
          }
          //
          preDJIData = DJISRTParser(
            prepareGeoJSON(converted, { speeds3D, speeds2D }),
            f.name,
            true
          );
        }
        if (preDJIData == null) {
          onError('No data');
        } else if (isDataValid(preDJIData)) {
          external = isExternal;
          DJIData = preDJIData;
          let zoom = setZoom();
          player = createPlayer(DJIData.metadata().packets.length, 0, true);
          loadMap(zoom);
          createGUI();
          dataLoaded = true;
          mapImages.refresh(map, p, true);
          if (!demo) disableWelcome();
        } else {
          onError('Data not valid');
        }
      } else {
        onError('File missing');
      }
    } catch (error) {
      onError(error);
    }
  }

  function createGUI() {
    let lastElt;
    gui_elts = gui.getGuiElts();
    lastElt = gui.createArea(
      'topMap',
      0, //x
      0, //y
      sizes.mainW.width, //width
      sizes.mainW.height, //height
      p.color(0, 0), //bg color
      clickTopMap
    ); //callback

    lastElt = gui.createArea(
      'frontMap',
      0, //x
      sizes.mainW.height + sizes.sliderW.height, //y
      sizes.bottomW.width, //width
      sizes.bottomW.height, //height
      colors.areaAlpha, //bg color
      clickFrontMap
    ); //callback

    lastElt = gui.createArea(
      'timelineBg', //semi-transparent background for when play button is pressed
      0, //x
      sizes.mainW.height, //y
      sizes.mainW.width, //width
      sizes.sliderW.height, //height
      colors.areaAlpha, //bg color
      null
    ); //callback, do nothing

    lastElt = gui.createToggle(
      'playToggle',
      true, //value
      '►', //text
      0, //x
      sizes.mainW.height, //y
      sizes.play, //width
      sizes.sliderW.height, //height
      colors.playCol, //color
      on => player.play(on), //callback
      colors.buttonText
    ); //textcolor

    lastElt = gui.createArea(
      'sideBar', //semi-transparent background for when play button is pressed
      sizes.mainW.width, //x
      0, //y
      sizes.sidebarW.width, //width
      sizes.sidebarW.height, //height
      p.color(100), //bg color
      null
    ); //callback, do nothing

    lastElt = gui.createSlider(
      'playSlider',
      player.getIndex(), //value
      sizes.play, //x
      sizes.mainW.height, //y
      sizes.sliderW.width - sizes.shadowSize, //width
      sizes.sliderW.height, //height
      colors.sliderCol, //color
      index => player.setIndex(index), //callback
      0, //min
      DJIData.metadata().packets.length - 1
    ); //max

    lastElt = gui.createText(
      'topHint',
      'Load DJI SRT logs (and more GPS path formats)', //value
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      gui_elts.sideBar.y + sizes.textMargin, //y
      sizes.textSize * 0.7, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.NORMAL
    ); //text style

    lastElt = gui.createButton(
      'loadButton',
      'LOAD', //text value
      gui_elts.sideBar.x + gui_elts.sideBar.width / 3, //x
      lastElt.y + lastElt.height + sizes.textMargin, //y
      gui_elts.sideBar.width / 3, //width
      sizes.sliderW.height * 1.5, //height
      colors.sliderCol, //color
      loadDialog, //callback
      colors.buttonText
    ); //textcolor

    lastElt = gui.createText(
      'fileName',
      getFileName(), //value
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      lastElt.y + lastElt.height + sizes.textMargin * 1.5, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.BOLD
    ); //text style

    lastElt = gui.createText(
      'dateTime',
      helper.formatDate(DJIData.metadata().stats.DATE), //value
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      lastElt.y + lastElt.height + sizes.textMargin, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.NORMAL
    ); //text style

    lastElt = gui.createText(
      'distance',
      helper.formatDistance(
        DJIData.metadata().packets[0].DISTANCE,
        DJIData.metadata().stats.DISTANCE
      ), //VALUE
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      lastElt.y + lastElt.height + sizes.textMargin, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.NORMAL
    ); //text style

    lastElt = gui.createText(
      'coordinates',
      helper.formatCoordinates(DJIData.metadata().packets[0].GPS),
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      lastElt.y + lastElt.height + sizes.textMargin, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.NORMAL
    ); //text style

    lastElt = gui.createText(
      'camera',
      helper.formatCamera(DJIData.metadata().packets[0]),
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      lastElt.y + lastElt.height + sizes.textMargin, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.NORMAL
    ); //text style

    lastElt = gui.createText(
      'smoothText',
      'Smoothing',
      gui_elts.sideBar.x + sizes.margin, //x
      lastElt.y + lastElt.height + sizes.textMargin, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.LEFT, p.TOP], //TEXT ALIGN
      p.BOLD
    ); //text style

    lastElt = gui.createSlider(
      'smoothSlider',
      DJIData.getSmoothing(), //value
      gui_elts.smoothText.x + gui_elts.smoothText.width + sizes.margin, //x
      gui_elts.smoothText.y, //y
      gui_elts.sideBar.width - sizes.margin * 3 - gui_elts.smoothText.width, //width
      sizes.textSize * 1.1, //height
      colors.sliderCol, //color
      setSmoothing, //callback
      0, //min
      20
    ); //max

    lastElt = gui.createText(
      'bgText',
      'Background', //value
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      lastElt.y + lastElt.height + sizes.textMargin * 1.5, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.BOLD
    ); //text style

    lastElt = gui.createRadio(
      'mapRadio',
      map.getStyle(), //value
      preferences.mapRange, //values
      preferences.mapLabels, //texts
      gui_elts.sideBar.x + sizes.margin, //x
      lastElt.y + lastElt.height + sizes.textMargin, //y
      gui_elts.sideBar.width - sizes.margin * 2, //width
      sizes.sliderW.height * 1.2, //height
      colors.sliderCol, //color
      setMap, //callback
      colors.buttonText
    ); //textcolor

    lastElt = gui.createText(
      'gMapsText',
      'See location in', //value
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      lastElt.y + lastElt.height + sizes.textMargin * 1.5, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.BOLD
    ); //text style

    lastElt = gui.createButton(
      'gMapsButton',
      'Google Maps', //text value
      gui_elts.sideBar.x + gui_elts.sideBar.width / 4, //x
      lastElt.y + lastElt.height + sizes.textMargin, //y
      gui_elts.sideBar.width / 2, //width
      sizes.sliderW.height * 1.2, //height
      colors.sliderCol, //color
      loadGoogleMaps, //callback
      colors.buttonText
    ); //textcolor

    lastElt = gui.createText(
      'dlsText',
      'Download', //value
      gui_elts.sideBar.x + gui_elts.sideBar.width / 2, //x
      lastElt.y + lastElt.height + sizes.textMargin * 1.5, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.BOLD
    ); //text style

    let thirdSize =
      (gui_elts.sideBar.width - sizes.margin * 2 - sizes.shadowSize * 4) / 3;
    let halfSize =
      (gui_elts.sideBar.width - sizes.margin * 2 - sizes.shadowSize * 2) / 2;

    if (!external) {
      lastElt = gui.createButton(
        'mgjsonButton',
        'After Effects', //text value
        gui_elts.sideBar.x + sizes.margin, //x
        lastElt.y + lastElt.height + sizes.textMargin, //y
        halfSize, //width
        sizes.sliderW.height * 1.2, //height
        colors.sliderCol, //color
        downloadMgjson, //callback
        colors.buttonText
      ); //textcolor

      gui.createButton(
        'gpxButton',
        'GPX', //text value
        lastElt.x + lastElt.width + sizes.shadowSize * 2, //x
        lastElt.y, //y
        halfSize, //width
        sizes.sliderW.height * 1.2, //height
        colors.sliderCol, //color
        downloadGPX, //callback
        colors.buttonText
      ); //textcolor
    }

    let flexibleMargin = external ? sizes.textMargin : sizes.shadowSize * 2;

    lastElt = gui.createButton(
      'photoButton',
      'Photo', //text value
      gui_elts.sideBar.x + sizes.margin, //x
      lastElt.y + lastElt.height + flexibleMargin, //y
      halfSize, //width
      sizes.sliderW.height * 1.2, //height
      colors.sliderCol, //color
      screenshot, //callback
      colors.buttonText
    ); //textcolor

    gui.createButton(
      'recordButton',
      'Video', //text value
      lastElt.x + lastElt.width + sizes.shadowSize * 2, //x
      lastElt.y, //y
      halfSize, //width
      sizes.sliderW.height * 1.2, //height
      colors.sliderCol, //color
      record, //callback
      colors.buttonText
    ); //textcolor

    if (!external) {
      lastElt = gui.createButton(
        'kmlButton',
        'KML', //text value
        lastElt.x, //x
        lastElt.y + lastElt.height + sizes.shadowSize * 2, //y
        thirdSize, //width
        sizes.sliderW.height * 1.2, //height
        colors.sliderCol, //color
        downloadKML, //callback
        colors.buttonText
      ); //textcolor

      lastElt = gui.createButton(
        'csvButton',
        'CSV', //text value
        lastElt.x + lastElt.width + sizes.shadowSize * 2, //x
        lastElt.y, //y
        thirdSize, //width
        sizes.sliderW.height * 1.2, //height
        colors.sliderCol, //color
        downloadCsv, //callback
        colors.buttonText
      ); //textcolor

      lastElt = gui.createButton(
        'jsonButton',
        'JSON', //text value
        lastElt.x + lastElt.width + sizes.shadowSize * 2, //x
        lastElt.y, //y
        thirdSize, //width
        sizes.sliderW.height * 1.2, //height
        colors.sliderCol, //color
        downloadJson, //callback
        colors.buttonText
      ); //textcolor
    }

    ////////// Help button

    gui.createButton(
      'helpButton',
      'Help', //text value
      gui_elts.sideBar.x + sizes.margin + thirdSize + sizes.shadowSize * 2, //x
      lastElt.y + lastElt.height + sizes.shadowSize * 2 + sizes.textMargin, //y
      thirdSize, //width
      sizes.sliderW.height * 1.2, //height
      colors.sliderCol, //color
      pressHelp, //callback
      colors.buttonText
    ); //textcolor

    //////////

    let labelsOffset = (gui_elts.sideBar.width - sizes.margin * 4) / 3;
    lastElt = gui.createText(
      'heightText',
      'Height', //value
      gui_elts.sideBar.x + sizes.margin * 1 + labelsOffset * 0, //x
      gui_elts.topMap.height, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.LEFT, p.TOP], //TEXT ALIGN
      p.BOLD
    ); //text style

    lastElt = gui.createText(
      'vertSpeedText',
      'Vert. S.', //value
      gui_elts.sideBar.x + sizes.margin * 2 + labelsOffset * 1, //x
      gui_elts.topMap.height, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.LEFT, p.TOP], //TEXT ALIGN
      p.BOLD
    ); //text style

    lastElt = gui.createText(
      'thwoDSpeedText',
      '2D Speed', //value
      gui_elts.sideBar.x + sizes.margin * 3 + labelsOffset * 2, //x
      gui_elts.topMap.height, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.LEFT, p.TOP], //TEXT ALIGN
      p.BOLD
    ); //text style

    if (showWelcome) createWelcome();
  }

  function disableWelcome() {
    showWelcome = false;
    gui.empty();
    createGUI();
  }

  function createWelcome() {
    gui.createArea(
      'welcomeBG',
      sizes.welcomeBG.x, //x
      sizes.welcomeBG.y, //y
      sizes.welcomeBG.width, //width
      sizes.welcomeBG.height, //height
      p.color(0, 0.5), //bg color
      disableWelcome, //close welcome
      1 //Draw in bg
    );
    gui.createArea(
      'welcomeW',
      sizes.welcomeW.x, //x
      sizes.welcomeW.y, //y
      sizes.welcomeW.width, //width
      sizes.welcomeW.height, //height
      p.color(100, 0.9), //bg color
      () => {}, //absorb clicks before bg

      2 //Draw in middle
    );
    gui.createText(
      'title',
      'DJI SRT Viewer', //value
      sizes.welcomeBG.width / 2, //x
      sizes.welcomeW.y + sizes.margin * 4, //y
      sizes.textSize * 2, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.BOLD, //text style
      3 //draw on top
    );
    gui.createText(
      'welcomeText',
      welcomeText, //value
      sizes.welcomeBG.width / 2, //x
      sizes.welcomeW.y + sizes.margin * 10, //y
      sizes.textSize, //height
      colors.textCol, //bg color
      null, //callback, do nothing
      [p.CENTER, p.TOP], //TEXT ALIGN
      p.NORMAL, //text style
      3 //draw on top
    );
    gui.createButton(
      'loadButton2',
      'LOAD FILE(S)', //text value
      sizes.welcomeBG.width / 2 - sizes.textSize * 8, //x
      sizes.welcomeBG.height / 2 - sizes.sliderW.height * 1.5 * 2, //y
      sizes.textSize * 16, //width
      sizes.sliderW.height * 1.5, //height
      colors.sliderCol, //color
      loadDialog, //callback
      colors.buttonText,
      3 //draw on top
    );
    gui.createButton(
      'sampleButton',
      'LOAD SAMPLE', //text value
      sizes.welcomeBG.width / 2 - sizes.textSize * 8, //x
      sizes.welcomeBG.height / 2, //y
      sizes.textSize * 16, //width
      sizes.sliderW.height * 1.5, //height
      colors.sliderCol, //color
      disableWelcome, //callback
      colors.buttonText,
      3 //draw on top
    );
    gui.createButton(
      'instructionsButton',
      'INSTRUCTIONS', //text value
      sizes.welcomeBG.width / 2 - sizes.textSize * 8, //x
      sizes.welcomeBG.height / 2 + sizes.sliderW.height * 1.5 * 2, //y
      sizes.textSize * 16, //width
      sizes.sliderW.height * 1.5, //height
      colors.sliderCol, //color
      pressHelp, //callback
      colors.buttonText,
      3 //draw on top
    );
    gui.createButton(
      'overlaysButton',
      'After Effects', //text value
      sizes.welcomeBG.width / 2 - sizes.textSize * 8, //x
      sizes.welcomeBG.height / 2 + sizes.sliderW.height * 1.5 * 4, //y
      sizes.textSize * 16, //width
      sizes.sliderW.height * 1.5, //height
      colors.sliderCol, //color
      loadOverlays, //callback
      colors.buttonText,
      3 //draw on top
    );
    gui.createButton(
      'goProButton',
      'GoPro Telemetry', //text value
      sizes.welcomeBG.width / 2 - sizes.textSize * 8, //x
      sizes.welcomeBG.height / 2 + sizes.sliderW.height * 1.5 * 6, //y
      sizes.textSize * 16, //width
      sizes.sliderW.height * 1.5, //height
      colors.sliderCol, //color
      loadGoPro, //callback
      colors.buttonText,
      3 //draw on top
    );
  }

  function setSmoothing(value) {
    memo = null;
    DJIData.setSmoothing(value);
    preferences.smooth = value;
  }

  function screenshot() {
    p.fill(255, 0.5);
    p.noStroke();
    p.textAlign(p.CENTER, p.BOTTOM);
    p.textSize(sizes.textSize * 0.8);
    if (map.getStyle() != 'none') {
      p.text(
        'djitelemetryoverlay.com | Map images: © Mapbox, © OpenStreetMap',
        p.width / 2,
        p.height - 1
      );
    } else {
      p.text('djitelemetryoverlay.com', p.width / 2, p.height - 1);
    }
    p.save(can, getFileName() + '-' + player.getIndex(), 'png');
  }

  function record() {
    var stream = can.canvas.captureStream();
    let options = { mimeType: 'video/webm' };
    var mediaRecorder,
      recordedBlobs = [];

    function download() {
      const blob = new Blob(recordedBlobs, { type: 'video/webm' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = getFileName() + '-map.webm';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    }

    function handleDataAvailable(event) {
      if (event.data && event.data.size > 0) recordedBlobs.push(event.data);
    }

    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e0) {
      console.error('Unable to create MediaRecorder with options Object: ', e0);
      try {
        options = { mimeType: 'video/webm,codecs=vp9' };
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e1) {
        console.error(
          'Unable to create MediaRecorder with options Object: ',
          e1
        );
        try {
          options = { mimeType: 'video/vp8' }; // Chrome 47
          mediaRecorder = new MediaRecorder(stream, options);
        } catch (e2) {
          alert(
            'MediaRecorder is not supported by this browser.\n\n' +
              'Try Firefox 29 or later, or Chrome 47 or later, ' +
              'with Enable experimental Web Platform features enabled from chrome://flags.'
          );
          console.error('Exception while creating MediaRecorder:', e2);
          return;
        }
      }
    }
    mediaRecorder.onstop = download;
    mediaRecorder.ondataavailable = handleDataAvailable;

    player.playOnce().then(() => mediaRecorder.stop());
    mediaRecorder.start(100);
    console.log('Recording');
  }

  p.setup = function() {
    visual_setup.setP(p); //pass p5 instance to visual functions
    preferences = visual_setup.preferences();
    colors = visual_setup.colors();
    sizes = visual_setup.setSizes();
    gui.setup(p, sizes.shadowSize, colors.shadowOpacity);
    can = p.createCanvas(p.windowWidth, p.windowHeight);
    let topOfPage = p.select('#p');
    can.parent(topOfPage);
    p.noFill();
    p.colorMode(p.HSB);
    p.textAlign(p.CENTER, p.CENTER);
    p.imageMode(p.CENTER);
    p.strokeCap(p.SQUARE);
    p.rectMode(p.CORNER);
    var parent = document.getElementById('container1');
    var child = document.getElementById('container2');
    child.style.paddingRight = child.offsetWidth - child.clientWidth + 'px';
  };

  p.windowResized = function() {
    memo = null;
    sizes = visual_setup.setSizes(); // adapt sizes for everything
    createGUI();
    let zoom = setZoom();
    let mapW = sizes.mainW.width;
    let mapH = sizes.mainW.height;
    loadMap(zoom);
    mapImages.refresh(map, p, true);
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  p.draw = function() {
    if (dataLoaded) {
      let mouseOverMaps = false;
      for (let elt in gui_elts) {
        //loop through all gui_elts elements, even if mouse not pressed
        gui_elts[elt].mouseIsPressed(p.mouseIsPressed, p.mouseX, p.mouseY);
        if (gui_elts[elt] === gui_elts.topMap) {
          gui_elts[elt].mouseOver(p.mouseX, p.mouseY, (x, y) => {
            selectItem(x, y, false, 'top', false);
            mouseOverMaps = true;
          });
        } else if (gui_elts[elt] === gui_elts.frontMap) {
          gui_elts[elt].mouseOver(p.mouseX, p.mouseY, (x, y) => {
            selectItem(x, y, false, 'front', false);
            mouseOverMaps = true;
          });
        } else if (gui_elts[elt] === gui_elts.playSlider) {
          gui_elts[elt].mouseOver(p.mouseX, p.mouseY, i => {
            player.setPreIndex(i);
            mouseOverMaps = true;
          });
        } else {
          gui_elts[elt].mouseOver(p.mouseX, p.mouseY);
        }
      }
      if (!mouseOverMaps) player.setPreIndex(-1);
      drawBg();
      gui.draw();
      if (!showWelcome) {
        let packet = DJIData.metadata().packets[player.getIndex()];
        gui_elts.dateTime.setValue(helper.formatDate(packet.DATE));
        gui_elts.distance.setValue(
          helper.formatDistance(
            packet.DISTANCE,
            DJIData.metadata().stats.DISTANCE
          )
        );
        gui_elts.coordinates.setValue(helper.formatCoordinates(packet.GPS));
        gui_elts.camera.setValue(helper.formatCamera(packet));

        drawHome(packet);
        drawOnce(DJIData.metadata());
        drawGraph(packet, gui_elts.heightText);
        drawGraph(packet, gui_elts.vertSpeedText);
        drawGraph(packet, gui_elts.thwoDSpeedText);
        pointTo(packet, true);
        if (
          player.getPreIndex() >= 0 &&
          player.getPreIndex() !== player.getIndex()
        ) {
          let prePacket = DJIData.metadata().packets[player.getPreIndex()];
          pointTo(prePacket, false);
        }
        labelMap(gui_elts.frontMap);
        labelMap(gui_elts.topMap);
        player.advance(); //won't advance if not playing, so no need to worry here
      }
      gui_elts.playSlider.setValue(player.getIndex());
      gui_elts.loadButton.unClick();
    }
  };

  function chooseAlt(pckt) {
    if (pckt.BAROMETER != undefined) {
      return pckt.BAROMETER;
    } else if (pckt.HB != undefined) {
      return pckt.HB;
    } else if (pckt.HS != undefined) {
      return pckt.HS;
    } else if (pckt.GPS != undefined && pckt.GPS.ALTITUDE) {
      return pckt.GPS.ALTITUDE;
    }
    return 0;
  }

  function setTone(val, min, max, neg) {
    if (min === max) {
      return p.map(0.5, 0, 1, colors.greenTone, colors.redTone);
    } else if (neg) {
      let biggest = Math.max(Math.abs(min), Math.abs(max));
      if (val < 0) {
        return p.map(val, -biggest, 0, colors.redTone, colors.greenTone);
      } else {
        return p.map(val, 0, biggest, colors.greenTone, colors.blueTone);
      }
    } else {
      return p.map(val, min, max, colors.greenTone, colors.redTone);
    }
  }

  function setThick(val, min, max) {
    if (min !== max) {
      return p.map(val, min, max, sizes.lineThick[0], sizes.lineThick[1]);
    } else {
      return (sizes.lineThick[1] - sizes.lineThick[0]) / 2;
    }
  }

  function drawBg() {
    p.background(96);
    p.push();
    p.translate(gui_elts.topMap.width / 2, gui_elts.topMap.height / 2);
    mapImages.paint(map, p);
    p.pop();
  }

  function mapAlt(alt, stats) {
    //map "altitude" values for bottom graph
    if (chooseAlt(stats).max !== chooseAlt(stats).min) {
      return p.map(
        alt,
        chooseAlt(stats).min,
        chooseAlt(stats).max,
        gui_elts.frontMap.height - sizes.margin,
        sizes.margin
      );
    } else {
      return p.map(
        0.5,
        0,
        1,
        gui_elts.frontMap.height - sizes.margin,
        sizes.margin
      );
    }
  }

  function drawOnce(metadata) {
    if (!memo) {
      memo = p.createGraphics(p.windowWidth, p.windowHeight);
      memo.noFill();
      memo.colorMode(p.HSB);
      memo.strokeCap(p.SQUARE);
      //create image
      let arr = metadata.packets;
      let stats = metadata.stats;
      //
      function drawInside(pck, index, array) {
        let lons = [0, 0, 0, 0]; //lat and lon for drawing curves
        let lats = [0, 0, 0, 0];
        lons[2] = pck.GPS.LONGITUDE;
        lons[1] = index > 0 ? array[index - 1].GPS.LONGITUDE : lons[2];
        lons[0] = index > 1 ? array[index - 2].GPS.LONGITUDE : lons[1];
        lons[3] =
          index < array.length - 1 ? array[index + 1].GPS.LONGITUDE : lons[2];
        let xs = lons.map(lon => conversions.lonToX(lon));
        lats[2] = pck.GPS.LATITUDE;
        lats[1] = index > 0 ? array[index - 1].GPS.LATITUDE : lats[2];
        lats[0] = index > 1 ? array[index - 2].GPS.LATITUDE : lats[1];
        lats[3] =
          index < array.length - 1 ? array[index + 1].GPS.LATITUDE : lats[2];
        let ys = lats.map(lat => conversions.latToY(lat));

        function drawCurves(thick, tone, xs, ys) {
          memo.strokeWeight(thick);
          memo.stroke(tone, 100, colors.lineBri, colors.lineAlp);
          if (
            p.round(xs[0]) == p.round(xs[1]) &&
            p.round(ys[0]) == p.round(ys[1]) &&
            p.round(xs[1]) == p.round(xs[2]) &&
            p.round(ys[1]) == p.round(ys[2]) &&
            p.round(xs[2]) == p.round(xs[3]) &&
            p.round(ys[2]) == p.round(ys[3])
          ) {
            // memo.line(xs[1], ys[1], xs[2], ys[2]);
            memo.point(xs[2], ys[2]);
          } else {
            memo.curve(xs[0], ys[0], xs[1], ys[1], xs[2], ys[2], xs[3], ys[3]);
          }
        }
        function drawMain(xs, ys) {
          memo.push();
          memo.translate(gui_elts.topMap.width / 2, gui_elts.topMap.height / 2);
          let thick = setThick(
            chooseAlt(pck),
            chooseAlt(stats).min,
            chooseAlt(stats).max
          );
          let tone = setTone(
            pck.SPEED.TWOD,
            stats.SPEED.TWOD.min,
            stats.SPEED.TWOD.max
          );
          drawCurves(thick, tone, xs, ys);
          memo.pop();
        }

        drawMain(xs, ys);

        let alts = [0, 0, 0, 0];
        alts[2] = chooseAlt(pck);
        alts[1] = index > 0 ? chooseAlt(array[index - 1]) : alts[2];
        alts[0] = index > 1 ? chooseAlt(array[index - 2]) : alts[1];
        alts[3] =
          index < array.length - 1 ? chooseAlt(array[index + 1]) : alts[2];
        ys = alts.map(alt => mapAlt(alt, stats));

        function drawBottom(xs, ys) {
          memo.push();
          memo.translate(gui_elts.frontMap.width / 2, gui_elts.frontMap.y);
          let thick = setThick(
            pck.GPS.LATITUDE,
            stats.GPS.LATITUDE.max,
            stats.GPS.LATITUDE.min
          );
          let tone = setTone(
            pck.SPEED.VERTICAL,
            stats.SPEED.VERTICAL.min,
            stats.SPEED.VERTICAL.max,
            true
          );
          drawCurves(thick, tone, xs, ys);
          memo.pop();
        }

        drawBottom(xs, ys);
      }
      arr.forEach(drawInside);
    }
    //print image
    p.image(memo, p.windowWidth / 2, p.windowHeight / 2);
  }

  function drawHome(pck) {
    if (!pck || pck.HOME == undefined) return;
    let hLon = pck.HOME.LONGITUDE;
    let hLat = pck.HOME.LATITUDE;
    let hx = conversions.lonToX(hLon);
    let hy = conversions.latToY(hLat);
    p.push();
    p.translate(gui_elts.topMap.width / 2, gui_elts.topMap.height / 2);
    p.translate(hx, hy);
    p.fill(0, 90, 85, colors.lineAlp);
    p.noStroke();
    p.textSize(sizes.textSize * 0.8);
    p.textStyle(p.BOLD);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('H', 0, 0);
    p.noFill();
    p.strokeWeight(sizes.strokes);
    p.stroke(0, 90, 85, colors.lineAlp);
    p.ellipse(0, 0, sizes.textSize * 1.2);
    p.pop();
  }

  function labelMap(mp) {
    //label map if main point drawing
    p.push();
    p.translate(mp.x, mp.y);
    p.textSize(sizes.textSize);
    p.noStroke();
    p.fill(colors.textCol);
    p.textStyle(p.NORMAL);
    p.textAlign(p.LEFT, p.TOP);
    if (mp == gui_elts.frontMap) {
      p.text('Front View', sizes.shadowSize, sizes.shadowSize);
    } else if ((mp = gui_elts.topMap)) {
      p.text('Top View', sizes.shadowSize, sizes.shadowSize);
    }
    p.pop();
  }

  function pointTo(pck, main) {
    if (!pck) return;

    let stats = DJIData.metadata().stats;
    let lon = pck.GPS.LONGITUDE;
    let lat = pck.GPS.LATITUDE;
    let x = conversions.lonToX(lon);
    let y = conversions.latToY(lat);
    let tone = setTone(
      pck.SPEED.THREED,
      stats.SPEED.THREED.min,
      stats.SPEED.THREED.max
    );
    let thick =
      sizes.selectThick / 2 +
      setThick(chooseAlt(pck), chooseAlt(stats).min, chooseAlt(stats).max);
    p.push();
    p.translate(gui_elts.topMap.width / 2, gui_elts.topMap.height / 2);
    if (main) {
      p.stroke(tone, 100, colors.lineBri / 2);
      p.strokeWeight(thick);
      p.point(x, y);
    } else {
      p.noFill();
      p.stroke(colors.textCol);
      p.strokeWeight(sizes.shadowSize);
      p.ellipse(x, y, thick, thick);
    }
    p.pop();
    tone = setTone(
      pck.SPEED.VERTICAL,
      stats.SPEED.VERTICAL.min,
      stats.SPEED.VERTICAL.max,
      true
    );
    thick =
      sizes.selectThick / 2 +
      setThick(
        pck.GPS.LATITUDE,
        stats.GPS.LATITUDE.max,
        stats.GPS.LATITUDE.min
      );
    p.push();
    p.translate(gui_elts.frontMap.width / 2, gui_elts.frontMap.y);
    let alt = chooseAlt(pck); //set proportion variables, read other value if barometer not present
    y = mapAlt(alt, stats);
    if (main) {
      p.stroke(tone, 100, colors.lineBri / 2);
      p.strokeWeight(thick);
      p.point(x, y);
    } else {
      p.noFill();
      p.stroke(colors.textCol);
      p.strokeWeight(sizes.shadowSize);
      p.ellipse(x, y, thick, thick);
    }
    p.pop();
  }

  function heightBar(i, min, max) {
    p.stroke(60);
    let thick = p.map(i, max, min, sizes.lineThick[0], sizes.lineThick[1]);
    p.line(-thick / 2, i, thick / 2, i);
  }

  function speedBar(i, min, max, stats, elt) {
    let statsType = stats.SPEED.TWOD;
    if (elt == gui_elts.vertSpeedText) {
      statsType = stats.SPEED.VERTICAL;
    }
    let val = p.map(i, max, min, statsType.min, statsType.max);
    let tone = setTone(
      val,
      statsType.min,
      statsType.max,
      elt == gui_elts.vertSpeedText
    ); //negative numbers ok if verticla spped
    p.stroke(tone, 100, colors.lineBri, colors.lineAlp);
    let thick = Math.abs(sizes.lineThick[0] - sizes.lineThick[1]) / 2;
    p.line(-thick / 2, i, thick / 2, i);
  }

  function drawLegend(
    min,
    max,
    y,
    alt,
    mAlt,
    mMin,
    thick,
    stats,
    color,
    units
  ) {
    p.stroke(color);
    p.strokeWeight(5);
    p.line(-thick / 2, y, thick / 2, y);
    p.fill(colors.textCol);
    p.textStyle(p.BOLD);
    p.textAlign(p.LEFT, p.CENTER);
    p.noStroke();
    p.textSize(sizes.textSize * 0.7); //save somewhere?
    p.text(alt + ' ' + units, sizes.margin, y);
    if (Math.abs(y - min) > sizes.textSize * 0.7)
      p.text(mAlt + ' ' + units, sizes.margin, min); //draw max and min values if not really close to current
    if (Math.abs(y - max) > sizes.textSize * 0.7)
      p.text(mMin + ' ' + units, sizes.margin, max);
  }

  function heightPointer(pck, min, max, stats) {
    let thick = setThick(
      chooseAlt(pck),
      chooseAlt(stats).min,
      chooseAlt(stats).max
    );
    let alt = chooseAlt(pck); //set proportion variables, read other value if barometer not present
    let y = mapAlt(alt, stats);
    let tone = colors.textCol;
    let color = p.color(tone, 100, colors.lineBri);
    let mMin = chooseAlt(stats).min;
    let mAlt = chooseAlt(stats).max;
    drawLegend(
      min,
      max,
      y,
      alt.toFixed(2),
      mAlt.toFixed(2),
      mMin.toFixed(2),
      thick,
      stats,
      color,
      'm'
    );
  }

  function speedPointer(pck, min, max, stats, elt) {
    let statsType = stats.SPEED.TWOD;
    let pckType = pck.SPEED.TWOD;
    if (elt == gui_elts.vertSpeedText) {
      statsType = stats.SPEED.VERTICAL;
      pckType = pck.SPEED.VERTICAL;
    }
    let thick = Math.abs(sizes.lineThick[0] - sizes.lineThick[1]) / 2;
    let alt = p.nf(pckType, 1, 2);
    let y = p.map(pckType, statsType.min, statsType.max, max, min);
    let tone = setTone(
      pckType,
      statsType.min,
      statsType.max,
      elt == gui_elts.vertSpeedText
    ); //negative numbers ok if verticla spped
    let color = p.color(tone, 100, colors.lineBri / 2);
    let mMin = p.nf(statsType.min, 1, 2);
    let mAlt = p.nf(statsType.max, 1, 2);
    drawLegend(min, max, y, alt, mAlt, mMin, thick, stats, color, 'km/h');
  }

  function drawGraph(pck, elt) {
    if (!pck) return;
    let stats = DJIData.metadata().stats;
    p.push();
    p.translate(elt.x, gui_elts.frontMap.y);
    let min = sizes.margin;
    let max = gui_elts.frontMap.height - sizes.margin;
    p.strokeWeight(1);
    p.noFill();
    for (let i = min; i < max; i++) {
      switch (elt) {
        case gui_elts.heightText:
          heightBar(i, min, max);
          break;
        default:
          speedBar(i, min, max, stats, elt);
          break;
      }
    }

    switch (elt) {
      case gui_elts.heightText:
        heightPointer(pck, min, max, stats);
        break;
      default:
        speedPointer(pck, min, max, stats, elt);
        break;
    }
    p.pop();
  }

  function getFileName() {
    return DJIData.getFileName().replace(/\.(srt|SRT)/, '');
  }

  function downloadCsv() {
    p.save([DJIData.toCSV(false)], getFileName(), 'CSV');
  }

  function downloadMgjson() {
    p.save([JSON.stringify(DJIData.toMGJSON())], getFileName(), 'MGJSON');
  }

  function downloadJson() {
    p.save([DJIData.toGeoJSON()], getFileName(), 'JSON');
  }

  function pressHelp() {
    p.select('#help').elt.click();
  }

  function downloadKML() {
    let preKml = JSON.parse(DJIData.toGeoJSON());
    let timestamp = false;
    preKml.features.forEach(feature => {
      if (feature.properties.hasOwnProperty('timestamp')) {
        timestamp = true;
        if (typeof feature.properties.timestamp !== 'object')
          feature.properties.timestamp = new Date(
            feature.properties.timestamp
          ).toISOString();
      }
    });
    if (timestamp) {
      preKml.features[
        preKml.features.length - 1
      ].properties.timestamp = preKml.features[
        preKml.features.length - 1
      ].properties.timestamp.map(stamp => new Date(stamp).toISOString());
      p.save([tokml(preKml)], getFileName(), 'KML');
    }
  }

  function downloadGPX() {
    let preGpx = JSON.parse(DJIData.toGeoJSON());
    let timestamp = false;
    preGpx.features.forEach(feature => {
      if (feature.properties.hasOwnProperty('timestamp')) {
        timestamp = true;
        if (typeof feature.properties.timestamp !== 'object')
          feature.properties.times = new Date(
            feature.properties.timestamp
          ).toISOString();
      }
    });
    if (timestamp) {
      preGpx.features[
        preGpx.features.length - 1
      ].properties.times = preGpx.features[
        preGpx.features.length - 1
      ].properties.timestamp.map(stamp => new Date(stamp).toISOString());
      p.save(
        [togpx(preGpx, { creator: 'dji-srt-viewer' })],
        getFileName(),
        'GPX'
      );
    }
  }

  function setMap(style) {
    if (style != map.getStyle() && preferences.mapRange.indexOf(style) > -1) {
      map.setStyle(style);
      mapImages.refresh(map, p, false);
      preferences.map = style;
    }
  }

  function clickTopMap(mxx, myy, tolerant) {
    //clicked in map variables relative to map
    clickMap(mxx, myy, tolerant, 'top');
  }

  function clickFrontMap(mxx, myy, tolerant) {
    //clicked in map variables relative to map
    clickMap(mxx, myy, tolerant, 'front');
  }

  function selectItem(mx, my, tolerant, type, commit) {
    //click on one of the main maps, top or bottom. commit click or just preselect
    let lonLat = {
      longitude: conversions.xToLon(mx - gui_elts.topMap.width / 2),
      latitude: conversions.yToLat(my - gui_elts.topMap.height / 2)
    };
    function dist(x1, y1, x2, y2) {
      return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }
    let arr = DJIData.metadata().packets;
    function preDist(val) {
      return dist(
        val.GPS.LONGITUDE,
        val.GPS.LATITUDE,
        lonLat.longitude,
        lonLat.latitude
      );
    }
    function selectFromMain(mx, my) {
      let bestIndex = null;
      let selected = arr.reduce((best, pckt, index) => {
        if (preDist(pckt) < preDist(best)) {
          bestIndex = index;
          return pckt;
        } else {
          return best;
        }
      }, arr[0]);
      if (
        !tolerant &&
        preDist(selected) > conversions.xToLon(sizes.selectThick, 0)
      ) {
        //find if it's less than 20 (or whatever) pixels apart
        bestIndex = null;
      }
      return bestIndex;
    }

    function selectFromBottom(mx, my) {
      function preDist(val) {
        let alt = chooseAlt(val);
        return mapAlt(alt, DJIData.metadata().stats);
      }
      let bestIndex = null;
      function computeBottomDist(packet) {
        return dist(
          conversions.lonToX(packet.GPS.LONGITUDE),
          preDist(packet),
          mx - gui_elts.frontMap.width / 2,
          my - gui_elts.frontMap.x
        );
      }
      let selected = arr.reduce((best, pckt, index) => {
        let newDist = computeBottomDist(pckt);
        let oldDist = computeBottomDist(best);
        if (newDist < oldDist) {
          bestIndex = index;
          return pckt;
        } else {
          return best;
        }
      });
      let selectedDist = computeBottomDist(selected);
      if (!tolerant && selectedDist > sizes.selectThick) {
        bestIndex = null;
      }
      return bestIndex;
    }

    let index;
    if (type == 'top') {
      index = selectFromMain(mx, my);
    } else if (type == 'front') {
      index = selectFromBottom(mx, my);
    }
    if (index != null) {
      if (commit) {
        if (type == 'top') {
          gui_elts.topMap.setClick(true);
        } else if (type == 'front') {
          gui_elts.frontMap.setClick(true);
        }
        player.setIndex(index);
        stopPlay();
      } else {
        player.setPreIndex(index);
      }
    } else {
      player.setPreIndex(-1);
    }
  }

  function clickMap(mxx, myy, tolerant, type) {
    selectItem(mxx, myy, tolerant, type, true);
  }

  function stopPlay() {
    player.play(false);
    gui_elts.playToggle.setValue(false);
  }

  function loadGoogleMaps() {
    let packet = DJIData.metadata().packets[player.getIndex()];
    let lat = packet.GPS.LATITUDE;
    let lon = packet.GPS.LONGITUDE;
    helper.launchGoogleMaps(lat, lon);
    gui_elts.gMapsButton.unClick();
  }

  function loadOverlays() {
    helper.launchLink('https://goprotelemetryextractor.com/#dji');
    gui_elts.overlaysButton.unClick();
  }

  function loadGoPro() {
    helper.launchLink('https://goprotelemetryextractor.com/free');
    gui_elts.goProButton.unClick();
  }

  function loadDialog() {
    helper.loadDialog(p, confirm);
  }

  p.mousePressed = function() {
    if (dataLoaded) {
      gui.mousePressed(p.mouseX, p.mouseY);
    }
  };

  p.keyPressed = function(value) {
    if (value.key == 'f') {
      loadDialog();
    }
  };

  p.mouseReleased = function() {
    if (dataLoaded) {
      gui.mouseReleased();
    }
  };
};
var myp5 = new p5(s);
