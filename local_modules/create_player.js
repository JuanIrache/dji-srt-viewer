function createPlayer(l, c, p) {
  //selects items through a timeline one at a time, for now
  let length = l;
  let playing = p || true;
  let current = c || 0;
  let preCurrent = -1;
  return {
    advance: function() {
      if (playing) {
        current = (current + 1) % length;
        if (current == 0 && typeof playing == 'object') playing.finish();
      }
    },
    getIndex: function() {
      return current;
    },
    getPreIndex: function() {
      return preCurrent;
    },
    play: function(on) {
      if (on != undefined) {
        playing = on;
      } else {
        playing = true;
      }
    },
    playOnce: function() {
      current = 0;
      return new Promise(resolve => {
        playing = {
          finish() {
            playing = false;
            resolve();
          }
        };
      });
    },
    pause: function() {
      playing = false;
    },
    playing: function() {
      return playing;
    },
    setIndex: function(i) {
      if (i != null && i <= length && i >= 0) {
        current = i;
      } else {
        console.log("not in range");
      }
    },
    setPreIndex: function(i) {
      if (i != null && i <= length && i >= -1) {
        preCurrent = i;
      }
    }
  };
}

module.exports = createPlayer;
