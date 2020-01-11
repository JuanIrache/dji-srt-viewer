function visual_setup() {
  let p;
  return {
    setP: function(p5) {
      p = p5;
    },
    preferences: function() {
      return {
        map: 'none',
        mapRange: ['none', 'satellite-v9', 'outdoors-v10'],
        mapLabels: ['Clean', 'Satellite', 'Map'],
        smooth: 4,
        smoothRange: [0, 20]
      };
    },
    colors: function() {
      return {
        lineAlp: 0.7,
        redTone: 0,
        greenTone: 130,
        blueTone: 260,
        lineBri: 100,
        sliderCol: p.color(50, 180, 255),
        playCol: p.color(255, 50, 50),
        buttonText: p.color(255),
        areaAlpha: p.color(0),
        textCol: p.color(100),
        shadowOpacity: 0.5
      };
    },
    setSizes: function() {
      let lin = Math.sqrt(p.windowWidth * p.windowHeight) / Math.sqrt(1920 * 984);
      let hor = p.windowWidth / 1920;
      let vert = p.windowHeight / 984;
      function constr(val, m) {
        let min = m || 1;
        let max = p.windowHeight / 4;
        return Math.max(Math.min(val, max), min);
      }
      //main window, slider, bottom and sidebar from top to bottom
      let main = 0.7; //height %
      let sidebar = 0.25; //width %
      let slider = 25; //height px
      let play = 38; //width
      let mainW = {
        width: p.windowWidth * (1 - sidebar),
        height: p.windowHeight * main
      };
      let bottomW = {
        width: p.windowWidth * (1 - sidebar),
        height: p.windowHeight * (1 - main) - constr(slider * vert, 5)
      };
      let sidebarW = {
        width: p.windowWidth * sidebar,
        height: p.windowHeight
      };
      let sliderW = {
        width: mainW.width - constr(play * hor, 20),
        height: constr(slider * vert, 5)
      };
      let welcomeW = {
        width: p.windowWidth * 0.8,
        height: p.windowHeight * 0.8,
        x: p.windowWidth * 0.1,
        y: p.windowHeight * 0.1
      };
      let welcomeBG = {
        width: p.windowWidth,
        height: p.windowHeight,
        x: 0,
        y: 0
      };
      return {
        margin: constr(15 * lin, 5), //pixels
        textMargin: constr(12 * vert, 5), //pixels
        play: constr(play * hor, 20),
        lineThick: [constr(2 * lin), constr(10 * lin, 5)],
        selectThick: constr(12 * lin, 6),
        strokes: constr(3 * lin),
        textSize: constr(18 * lin),
        shadowSize: constr(2 * lin),
        mainW,
        bottomW,
        sidebarW,
        sliderW,
        welcomeW,
        welcomeBG
      };
    }
  };
}

module.exports = visual_setup();
