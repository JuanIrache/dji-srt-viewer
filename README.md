# dji-srt-viewer
Visualizes DJI SRT logs
Live here: http://tailorandwayne.com/dji-srt-viewer/

Uses P5js in Instance mode (https://github.com/processing/p5.js/wiki/Global-and-instance-mode) and the following NPM modules
- https://www.npmjs.com/package/dji_srt_parser
- https://www.npmjs.com/package/latlon_to_xy
- https://www.npmjs.com/package/p5_gui
- https://www.npmjs.com/package/mapbox_static_helper

Can be built with Browserify (https://www.npmjs.com/package/browserify) and Babelify (https://www.npmjs.com/package/babelify)

Discussion and suggestions also here: https://forum.dji.com/thread-140031-1-1.html

## Installation and build

```shell
$ npm install
$ node build.js
```

## TODO
- Check babelify in new modules
- satellite images appear pixelated now, for some reason
- different playing speeds?
- Convert to AE, gpx or kmz?
- check for black tiles?
- merge more than one srt? Concat and sort by date just in case
- Move sidebar to bottom if proportion is... Worse than square? Height still in side. Load on top? smooth vertical? Camera and location divided in lines. background and downloads divided. speeds horizontal?
- drop load files?
- move createGUI to visual_setup module?
