const createTimecode = time => {
  //https://stackoverflow.com/questions/6312993/javascript-seconds-to-time-string-with-format-hhmmss
  const sec_num = parseInt(time, 10); // don't forget the second param
  let hours = Math.floor(sec_num / 3600);
  let minutes = Math.floor((sec_num - hours * 3600) / 60);
  let seconds = sec_num - hours * 3600 - minutes * 60;

  if (hours < 10) {
    hours = '0' + hours;
  }
  if (minutes < 10) {
    minutes = '0' + minutes;
  }
  if (seconds < 10) {
    seconds = '0' + seconds;
  }
  return hours + ':' + minutes + ':' + seconds + ',000';
};

const toSrt = data => {
  let result = [];
  const lines = data.split(/[\r\n]+/);
  lines.forEach((l, i) => {
    l = l.replace(/[�]/g, '');
    l = l.trim();
    let clean = '';
    for (let ii = 0; ii < l.length; ii++) {
      if (l.charCodeAt(ii) !== 0) {
        clean += l[ii];
      }
    }
    if (clean.length) {
      result.push(i + 1);
      result.push(`${createTimecode(i)} --> ${createTimecode(i + 1)}`);
      result.push(clean);
      result.push('');
    }
  });

  return result.join('\n');
};

module.exports = toSrt;
