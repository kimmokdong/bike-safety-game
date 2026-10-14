# 자전거 안전 게임 (웹캠 손 조종)

만든이: 현승쌤 (2017)

스크래치로 만든 자전거 안전 교육 게임을 웹앱으로 옮겼습니다. 원래 키넥트로 하던 조종을 PC 웹캠 손 인식으로 바꿨습니다.

- 플레이: https://kimmokdong.github.io/bike-safety-game/
- 시작: 두 손을 머리 위로 만세
- 조종: 두 손으로 핸들을 잡듯이 들고, 왼손을 올리면 우회전, 오른손을 올리면 좌회전
- 키보드(보조): ← → 방향키, 스페이스로 시작
- Chrome 권장. 카메라를 허용해야 하고 인터넷 연결이 필요합니다(손 인식 모델을 불러옵니다).

## 다시 빌드하기

```bash
cd src
npm install
node pack.js     # game.sb3 → packaged.html (TurboWarp 패키저)
node inject.js   # packaged.html + webcam.js → ../index.html
```
