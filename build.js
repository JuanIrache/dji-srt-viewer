var fs = require('fs');
var browserify = require('browserify');
var babelify = require('babelify');

browserify()
  .transform(babelify, {
    presets: ['@babel/preset-env'],
    global: true
  })
  .require('./sketch.js', { entry: true })
  .bundle()
  .on('error', function (err) {
    console.log('Error: ' + err.message);
  })
  .pipe(fs.createWriteStream('bundle.js'));
