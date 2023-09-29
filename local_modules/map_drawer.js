function mapImagesModule() {
  //
  let mapImgsArr;
  let mapUrlsArr;
  let reloadRequested = false; //timeout and reloadrequested allow for delayed api calls to avoid consumint too many resources
  const timeout = 4000;
  let lastCall = -timeout;

  function loadingImg(p) {
    p.fill(50);
    p.noStroke();
    p.textSize(25);
    p.textStyle(p.NORMAL);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('Loading map...', 0, 0);
  }

  function loadMapStyle(mp, style, p) {
    let currentTime = window.performance.now();
    if (style != 'none' && mapImgsArr) {
      if (currentTime - lastCall > timeout) {
        //don't call too often)
        lastCall = currentTime;
        for (let i = 0; i < mapUrlsArr.length; i++) {
          mapImgsArr[i][style] = p.loadImage(mapUrlsArr[i].url);
        }
      } else if (!reloadRequested) {
        reloadRequested = true;
        setTimeout(() => {
          reloadRequested = false;
          loadMapStyle(mp, style, p);
        }, timeout - (currentTime - lastCall) + 1);
      }
    }
  }

  return {
    refresh: function (mp, p, reload) {
      mapUrlsArr = mp.getUrlsAndXY();
      if (reload || !mapImgsArr) mapImgsArr = mapUrlsArr;
      if (
        !mapImgsArr ||
        !mapImgsArr[0] ||
        !mapImgsArr[0][mp.getStyle() + ':' + mp.getZoom()]
      )
        reload = true;
      if (reload) {
        loadMapStyle(mp, mp.getStyle() + ':' + mp.getZoom(), p);
      }
    },
    paint: function (mp, p) {
      if (mp.getStyle() != 'none' && mapImgsArr) {
        let key = mp.getStyle() + ':' + mp.getZoom();
        mapImgsArr.forEach(img => {
          if (img[key] && img[key].width > 1) {
            p.push();
            p.translate(img.x, img.y);
            p.image(img[key], 0, 0);
            p.pop();
          } else {
            loadingImg(p);
          }
        });
      }
    }
  };
}

module.exports = mapImagesModule();
