var fs = require('fs');
var browserify = require('browserify');
browserify('./sketch.js')
  .transform('babelify', {
    presets: ['env'],
    plugins: ['transform-async-to-generator', 'transform-runtime'],
    global: true,
    ignore: /\/node_modules\/(?!(dji_srt_parser|latlon_to_xy|p5_gui|mapbox_static_helper)\/)/
  })
  .bundle()
  .pipe(fs.createWriteStream('bundle.js'));
