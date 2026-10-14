// packaged.html + webcam.js → 최종 HTML
const fs = require('fs');
let h = fs.readFileSync('packaged.html', 'utf8');
const i = h.lastIndexOf('</body>');
h = h.slice(0, i) + '<script type="module">\n' + fs.readFileSync('webcam.js', 'utf8') + '\n</script>\n' + h.slice(i);
fs.writeFileSync('../index.html', h);
console.log('ok');
