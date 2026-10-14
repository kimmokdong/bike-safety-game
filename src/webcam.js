// 웹캠 두 손 핸들 조종 (키넥트 대체). 왼손이 높으면 우회전, 오른손이 높으면 좌회전.
// 키보드 조작은 원본 그대로 동작한다.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const BIKE = '자전거 ';
const DEAD = 0.06;                    // 이 높이 차이(화면 높이 비율)까지는 직진
const FULL = 0.25;                    // 이 높이 차이면 최대로 꺾음
const MAX_SPEED = 120;                // 최대 좌우 이동 속도 (스테이지 px/초, 원본 방향키와 비슷)
const X_MIN = -150, X_MAX = 200;      // 자전거가 갈 수 있는 스테이지 x
const LANE = [21, 159];               // 자전거 전용도로 (벗어나면 감점)
const START_Y = 0.35, START_HOLD = 1500;
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

// 두 손 높이(y, 아래로 갈수록 큼) → 핸들 값 -1(좌회전) ~ 0(직진) ~ 1(우회전)
export function steer(leftY, rightY) {
  const d = rightY - leftY;           // 왼손이 높으면 양수
  if (Math.abs(d) <= DEAD) return 0;
  return Math.sign(d) * Math.min(1, (Math.abs(d) - DEAD) / (FULL - DEAD));
}
export function costumeFor(s) {
  return s > 0 ? '우회전 ' : s < 0 ? '좌회전 ' : '직진 ';
}

// ---- 화면 배치: 왼쪽 게임, 오른쪽 카메라 ----
const css = document.createElement('style');
css.textContent = `
  #app, #loading, #error, #launch { width: 62% !important; }
  #cam-panel { position: fixed; top: 0; right: 0; width: 38%; height: 100%; background: #111;
    color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; padding: 12px; box-sizing: border-box; }
  #cam-canvas { width: 100%; border-radius: 12px; background: #222; }
  #cam-status { font-size: 22px; font-weight: bold; text-align: center; min-height: 1.4em; }
  #cam-help { font-size: 15px; color: #bbb; text-align: center; line-height: 1.5; }
  #cam-opts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: center; }
  #cam-opts button { padding: 6px 12px; font-size: 14px; border-radius: 8px; border: 0;
    background: #444; color: #fff; cursor: pointer; }
  #cam-opts button[aria-pressed="true"] { background: #1e88e5; }
  #cam-credit { font-size: 13px; color: #888; }
  #cam-opts label { font-size: 14px; display: flex; align-items: center; gap: 6px; }
  @media (max-aspect-ratio: 1/1) {
    #app, #loading, #error, #launch { width: 100% !important; height: 60% !important; }
    #cam-panel { top: 60%; width: 100%; height: 40%; flex-direction: row; }
    #cam-canvas { width: auto; height: 100%; }
  }`;
document.head.appendChild(css);
const panel = document.createElement('div');
panel.id = 'cam-panel';
panel.innerHTML = `<canvas id="cam-canvas" width="640" height="480"></canvas>
  <div id="cam-status">카메라 켜는 중…</div>
  <div id="cam-help">두 손으로 핸들을 잡듯이 들어요.<br>왼손을 올리면 오른쪽 ↗, 오른손을 올리면 왼쪽 ↖<br>시작: 두 손을 머리 위로 만세!<br>(키보드: ← → 방향키, 스페이스)</div>
  <div id="cam-opts">
    <button id="opt-view" aria-pressed="false">✋ 인식 점·선 보기</button>
    <button id="opt-cam">카메라 끄기</button>
    <button id="opt-mute" aria-pressed="false">🔊 소리 켬</button>
    <label>볼륨 <input id="opt-vol" type="range" min="0" max="100" value="100" aria-label="볼륨"></label>
  </div>
  <div id="cam-credit">만든이 현승쌤(2017)</div>`;
document.body.appendChild(panel);
window.dispatchEvent(new Event('resize')); // 게임 화면 크기 다시 맞추기

const canvas = panel.querySelector('#cam-canvas');
const ctx = canvas.getContext('2d');
const statusEl = panel.querySelector('#cam-status');
const toggle = panel.querySelector('#opt-cam');
const marksBtn = panel.querySelector('#opt-view');
const muteBtn = panel.querySelector('#opt-mute');
const volInput = panel.querySelector('#opt-vol');
let showMarks = false;
marksBtn.onclick = () => {
  showMarks = !showMarks;
  marksBtn.setAttribute('aria-pressed', showMarks);
  marksBtn.textContent = showMarks ? '✋ 인식 점·선 숨기기' : '✋ 인식 점·선 보기';
};

// 소리: 게임 전체 소리가 audioEngine.inputNode를 거쳐 나간다
let muted = false, volume = 1;
try { volume = Math.min(1, Math.max(0, +(localStorage.getItem('bike-vol') ?? 1))); muted = localStorage.getItem('bike-mute') === '1'; } catch {}
volInput.value = Math.round(volume * 100);
function applySound() {
  muteBtn.setAttribute('aria-pressed', muted);
  muteBtn.textContent = muted ? '🔇 음소거' : '🔊 소리 켬';
  const gain = window.vm?.runtime.audioEngine?.inputNode?.gain;
  if (gain) gain.value = muted ? 0 : volume;
  try { localStorage.setItem('bike-vol', volume); localStorage.setItem('bike-mute', muted ? '1' : '0'); } catch {}
}
muteBtn.onclick = () => { muted = !muted; applySound(); };
volInput.oninput = () => { volume = volInput.value / 100; if (volume > 0) muted = false; applySound(); };
const video = document.createElement('video');
video.playsInline = true; video.muted = true;
const setStatus = s => { statusEl.textContent = s; };

let landmarker = null, stream = null, on = true, holdStart = 0, lastStart = 0, lastTs = -1;

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
    video.srcObject = stream;
    await video.play();
    if (!landmarker) {
      setStatus('손 인식 준비 중…');
      const { FilesetResolver, HandLandmarker } = await import(`${MP}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
      const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numHands: 2 });
      try { landmarker = await HandLandmarker.createFromOptions(files, opts('GPU')); }
      catch { landmarker = await HandLandmarker.createFromOptions(files, opts('CPU')); }
    }
    setStatus('두 손을 보여주세요');
  } catch (e) {
    console.warn(e);
    setStatus('카메라를 쓸 수 없어요 - 키보드로 하세요');
    stopCamera(false);
  }
}
function stopCamera(manual = true) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (manual) setStatus('카메라 꺼짐 - 키보드로 하세요');
}
toggle.onclick = () => {
  on = !on;
  toggle.textContent = on ? '카메라 끄기' : '카메라 켜기';
  on ? startCamera() : stopCamera();
};

function pressSpace() {
  window.vm.postIOData('keyboard', { key: ' ', isDown: true });
  setTimeout(() => window.vm.postIOData('keyboard', { key: ' ', isDown: false }), 100);
}

// 손바닥 중심 (거울 기준 u, y)
function palm(hand) {
  const ids = [0, 5, 9, 13, 17];
  const x = ids.reduce((s, i) => s + hand[i].x, 0) / ids.length;
  const y = ids.reduce((s, i) => s + hand[i].y, 0) / ids.length;
  return { u: 1 - x, y, hand };
}

// 카메라 화면 + (기본) 두 손 사이 핸들 그림 / (옵션) 손 인식 점·선
function draw(palms, playing, holdRatio, s) {
  const W = canvas.width, H = canvas.height;
  ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, W, H); ctx.restore();
  showMarks ? drawMarks(palms, playing, holdRatio, s) : drawHandlebar(palms);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 6;
  ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
  const label = !playing ? (palms.length ? '🙌 만세하면 시작!' : '두 손을 보여주세요')
    : palms.length < 2 ? '두 손으로 핸들을 잡아요' : s > 0 ? '우회전 ▶' : s < 0 ? '◀ 좌회전' : '▲ 직진';
  ctx.strokeText(label, W / 2, H - 24); ctx.fillText(label, W / 2, H - 24);
  if (holdRatio > 0) { // 시작 진행 막대
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(120, 20, W - 240, 20);
    ctx.fillStyle = '#ffeb3b'; ctx.fillRect(120, 20, (W - 240) * holdRatio, 20);
  }
}

// 두 손바닥을 손잡이로 하는 자전거 핸들 (손이 둘이 아니면 아래쪽에 흐리게)
function drawHandlebar(palms) {
  const W = canvas.width, H = canvas.height, both = palms.length === 2;
  let cx = W / 2, cy = H * 0.72, len = W * 0.55, rot = 0;
  if (both) {
    const [l, r] = palms, x1 = l.u * W, y1 = l.y * H, x2 = r.u * W, y2 = r.y * H;
    cx = (x1 + x2) / 2; cy = (y1 + y2) / 2; len = Math.hypot(x2 - x1, y2 - y1); rot = Math.atan2(y2 - y1, x2 - x1);
  }
  const h = len / 2, curve = len * 0.08;
  ctx.save();
  ctx.globalAlpha = both ? 1 : 0.45;
  ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.fillStyle = '#555'; ctx.fillRect(-10, 0, 20, len * 0.35); // 핸들 기둥
  ctx.lineCap = 'round';
  const bar = () => { ctx.beginPath(); ctx.moveTo(-h, -curve); ctx.quadraticCurveTo(-h / 2, curve, 0, curve); ctx.quadraticCurveTo(h / 2, curve, h, -curve); ctx.stroke(); };
  ctx.strokeStyle = '#222'; ctx.lineWidth = 22; bar();
  ctx.strokeStyle = '#c62828'; ctx.lineWidth = 12; bar();
  ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(0, curve, 16, 0, 7); ctx.fill();
  for (const side of [-1, 1]) { // 손잡이: 잡으면 초록
    ctx.fillStyle = both ? '#2e7d32' : '#777';
    ctx.beginPath(); ctx.roundRect(side * h - 34, -curve - 18, 68, 36, 16); ctx.fill();
  }
  ctx.restore();
}

// 작동 원리: 손 인식 점·선과 좌표
function drawMarks(palms, playing, holdRatio, s) {
  const W = canvas.width, H = canvas.height;
  if (!playing) { // 시작 제스처 선
    ctx.strokeStyle = 'rgba(255,220,0,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.moveTo(0, START_Y * H); ctx.lineTo(W, START_Y * H); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.font = 'bold 18px monospace'; ctx.textAlign = 'left';
  for (const p of palms) {
    const pts = p.hand.map(q => [(1 - q.x) * W, q.y * H]);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    for (const [a, b] of BONES) { ctx.beginPath(); ctx.moveTo(...pts[a]); ctx.lineTo(...pts[b]); ctx.stroke(); }
    ctx.fillStyle = '#ff5050';
    for (const q of pts) { ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(p.u * W, p.y * H, 14, 0, 7); ctx.fill();
    ctx.fillText(`y=${p.y.toFixed(2)}`, p.u * W + 20, p.y * H - 20);
  }
  if (palms.length === 2) { // 두 손을 잇는 선: 직진 초록, 회전 주황
    const [l, r] = palms;
    ctx.strokeStyle = s === 0 ? '#3ddc84' : '#ff9800'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(l.u * W, l.y * H); ctx.lineTo(r.u * W, r.y * H); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(`높이 차이 ${(r.y - l.y).toFixed(2)} (직진 범위 ±${DEAD})`, 12, 64);
  }
}

function loop() {
  requestAnimationFrame(loop);
  if (!on || !stream || !landmarker || video.readyState < 2) return;
  const ts = performance.now();
  if (ts <= lastTs) return;
  const dt = lastTs < 0 ? 0 : Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  // 화면 왼쪽(거울 기준)에 있는 손을 왼손으로 본다
  const palms = (landmarker.detectForVideo(video, ts).landmarks || []).map(palm).sort((a, b) => a.u - b.u);
  const t = window.vm.runtime.getSpriteTargetByName(BIKE);
  const playing = !!(t && t.visible);
  let holdRatio = 0, s = 0;

  if (playing) {
    holdStart = 0;
    if (palms.length < 2) {
      t.setCostume(t.getCostumeIndexByName('직진 '));
      setStatus(palms.length ? '두 손을 모두 보여주세요!' : '손이 안 보여요!');
    } else {
      s = steer(palms[0].y, palms[1].y);
      const nx = Math.min(X_MAX, Math.max(X_MIN, t.x + s * MAX_SPEED * dt));
      t.setCostume(t.getCostumeIndexByName(costumeFor(s)));
      t.setXY(nx, t.y);
      setStatus(nx > LANE[0] && nx < LANE[1] ? '✅ 자전거 전용도로 안전 주행!' : '⚠️ 자전거 전용도로로 들어가요!');
    }
  } else if (palms.length && palms.every(p => p.y < START_Y) && ts - lastStart > 3000) {
    holdStart ||= ts;
    holdRatio = Math.min(1, (ts - holdStart) / START_HOLD);
    setStatus('그대로 기다리면 시작!');
    if (holdRatio >= 1) { pressSpace(); lastStart = ts; holdStart = 0; }
  } else {
    holdStart = 0;
    setStatus(palms.length ? '두 손을 머리 위로 만세!' : '두 손을 보여주세요');
  }
  draw(palms, playing, holdRatio, s);
}

(async () => {
  while (!window.vm) await new Promise(r => setTimeout(r, 100));
  applySound();
  startCamera();
  loop();
})();

if (location.hash === '#selftest') {
  console.assert(steer(0.5, 0.5) === 0 && steer(0.5, 0.55) === 0, '작은 차이는 직진');
  console.assert(steer(0.3, 0.6) === 1, '왼손 높음 → 우회전 최대');
  console.assert(steer(0.6, 0.3) === -1, '오른손 높음 → 좌회전 최대');
  const mid = steer(0.4, 0.5);
  console.assert(mid > 0 && mid < 1, '중간 꺾임');
  console.assert(costumeFor(0.3) === '우회전 ' && costumeFor(-0.3) === '좌회전 ' && costumeFor(0) === '직진 ', '모양');
  console.log('selftest done');
}
