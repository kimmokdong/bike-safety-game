// sb3 → 단일 HTML (TurboWarp 패키저)
const fs = require('fs');
const Packager = require('@turbowarp/packager');
(async () => {
  const project = await Packager.loadProject(fs.readFileSync('game.sb3'));
  const p = new Packager.Packager();
  p.project = project;
  p.options.app.windowTitle = '자전거 안전 게임';
  p.options.autoplay = true;
  p.options.controls.greenFlag.enabled = true;
  p.options.controls.fullscreen.enabled = true;
  p.options.target = 'html';
  const r = await p.package();
  fs.writeFileSync('packaged.html', r.data);
  console.log('ok', r.data.length);
})().catch(e => { console.error(e); process.exit(1); });
