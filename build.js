var fs = require('fs');
var browserify = require('browserify');
var babelify = require('babelify');

browserify()
  .transform(babelify)
  .require('./sketch.js', { entry: true })
  .bundle()
  .on('error', function (err) {
    console.error('Error: ' + err.message);
  })
  .pipe(fs.createWriteStream('bundle.js'));
