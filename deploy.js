const { deployFolder } = require('./private/keys');
const fs = require('fs-extra');
const path = require('path');

fs.remove(deployFolder, err => {
  if (err) return console.error(err);
  console.log('Deploy folder deleted');

  fs.copy('./samples', path.join(deployFolder, 'samples'), err => {
    if (err) return console.error(err);
    console.log('samples copied');
  }); // copies directory, even if it has subdirectories or files

  const files = ['.htaccess', 'bundle.js', 'favicon.ico', 'index.html'];

  files.forEach(f => {
    fs.copy('./' + f, path.join(deployFolder, f), err => {
      if (err) return console.error(err);
      console.log(`${f} copied successfully`);
    });
  });
});
