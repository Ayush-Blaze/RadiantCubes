'use strict';

const W = 960;
const H = 720;
const SHAPES = ['RHOMBUS', 'RECTANGLE', 'TRIANGLE', 'SPHERE'];
const PANEL_W = 312;
const PANEL_H = 228;
const PANEL_MARGIN = 34;

let video, handsSol;
let handsData = [];
let busy = false;
let handsReady = false;
let handsLoadError = false;

let monoFont;
let bgPg = null;

let shapeIndex = 0;
let shapeChangeLatch = false;
let shapeChangeCooldown = 0;
let shapePointsCache = {};

let leftHandKps = null;
let rotateMode = false;
let rotX = -0.34;
let rotY = 0.48;
let rotZ = 0;
let rotTargetX = -0.34;
let rotTargetY = 0.48;
let rotTargetZ = 0;
let rotVelX = 0;
let rotVelY = 0;
let rotVelZ = 0;
let rotateGestureFrames = 0;
let rotateAnchor = null;
let rightCloneX = 0;
let rightCloneY = 0;
let rightCloneAlpha = 0;

function preload() {
  monoFont = loadFont(
    'https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@2.304/fonts/ttf/JetBrainsMono-Regular.ttf',
    () => {},
    () => { monoFont = null; }
  );
}

function setup() {
  createCanvas(W, H, WEBGL);
  pixelDensity(1);
  frameRate(30);

  video = createCapture(VIDEO);
  video.size(W, H);
  video.hide();

  ensureMediaPipeHands()
    .then(() => {
      initHands();
      handsReady = true;
    })
    .catch(() => {
      handsLoadError = true;
    });

  shapePointsCache = {
    RHOMBUS: buildRhombusPoints(),
    RECTANGLE: buildRectanglePoints(),
    TRIANGLE: buildTrianglePoints(),
    SPHERE: buildCirclePoints(),
  };
}

function draw() {
  background(6, 8, 12);
  drawBackground();

  if (handsReady && frameCount % 2 === 0) sendFrame();

  updateGestureState();
  updateRotationSpring();
  updateRightCloneState();

  push();
  translate(panelCenterX(), panelCenterY(), 0);
  scale(0.54);
  translate(0, 10, 0);
  rotateX(rotX);
  rotateY(rotY);
  rotateZ(rotZ);
  drawCurrentShape();
  pop();

  if (rightCloneAlpha > 0.01) {
    push();
    translate(rightCloneX, rightCloneY, 0);
    scale(0.24);
    rotateX(rotX);
    rotateY(rotY);
    rotateZ(rotZ);
    drawCurrentShape();
    pop();
  }

  drawOverlay();
}

function updateGestureState() {
  const userLeftHand = getPrimaryLeftHand();
  leftHandKps = userLeftHand ? userLeftHand.kps : null;

  if (shapeChangeCooldown > 0) shapeChangeCooldown -= 1;

  if (!leftHandKps) {
    rotateMode = false;
    rotateGestureFrames = 0;
    rotateAnchor = null;
    shapeChangeLatch = false;
    return;
  }

  const fullOpen = isFullOpen(leftHandKps);
  const rotateGesture = isIndexThumbOpen(leftHandKps);

  if (fullOpen && !rotateGesture && !shapeChangeLatch && shapeChangeCooldown === 0) {
    shapeIndex = (shapeIndex + 1) % SHAPES.length;
    shapeChangeLatch = true;
    shapeChangeCooldown = 12;
  } else if (!fullOpen) {
    shapeChangeLatch = false;
  }

  if (rotateGesture && !fullOpen) {
    rotateGestureFrames += 1;
    const state = getIndexThumbRotateState(leftHandKps);
    if (!rotateAnchor) {
      rotateAnchor = {
        centerX: state.centerX,
        wristAngle: state.wristAngle,
        fingerAngle: state.fingerAngle,
        rotX: rotTargetX,
        rotY: rotTargetY,
        rotZ: rotTargetZ,
      };
    }
    if (rotateGestureFrames >= 2) {
      rotTargetY = rotateAnchor.rotY + (state.centerX - rotateAnchor.centerX) * 6.2;
      rotTargetX = rotateAnchor.rotX + angleDelta(state.wristAngle, rotateAnchor.wristAngle) * 3.1;
      rotTargetZ = rotateAnchor.rotZ + angleDelta(state.fingerAngle, rotateAnchor.fingerAngle) * 2.2;
      rotTargetX = constrain(rotTargetX, -1.7, 1.7);
      rotTargetY = constrain(rotTargetY, -3.2, 3.2);
      rotTargetZ = constrain(rotTargetZ, -1.8, 1.8);
    }
    rotateMode = true;
  } else {
    rotateMode = false;
    rotateGestureFrames = 0;
    rotateAnchor = null;
  }
}

function updateRotationSpring() {
  const stiffness = 0.058;
  const damping = 0.84;

  rotVelX += (rotTargetX - rotX) * stiffness;
  rotVelY += (rotTargetY - rotY) * stiffness;
  rotVelZ += (rotTargetZ - rotZ) * stiffness;

  rotVelX *= damping;
  rotVelY *= damping;
  rotVelZ *= damping;

  rotX += rotVelX;
  rotY += rotVelY;
  rotZ += rotVelZ;
}

function updateRightCloneState() {
  const userRightHand = getPrimaryRightHand();
  if (!userRightHand || !isIndexOnlyUp(userRightHand.kps)) {
    rightCloneAlpha = max(0, rightCloneAlpha - 0.08);
    return;
  }

  const tip = indexTipScreen(userRightHand.kps);
  const targetX = tip.sx;
  const targetY = tip.sy - 62;

  if (rightCloneAlpha <= 0.01) {
    rightCloneX = targetX;
    rightCloneY = targetY;
  } else {
    rightCloneX = lerp(rightCloneX, targetX, 0.26);
    rightCloneY = lerp(rightCloneY, targetY, 0.26);
  }

  rightCloneAlpha = min(1, rightCloneAlpha + 0.12);
}

function drawCurrentShape() {
  const shapeName = SHAPES[shapeIndex];
  const leds = getShapePoints(shapeName);
  const style = getShapeStyle(shapeName);

  for (const p of leds) {
    const haloSize = style.halo * p.scale;
    const coreSize = style.core * p.scale;
    const sparkSize = style.spark * p.scale;
    const col = samplePalette(style.palette, p.tone);

    push();
    translate(p.x, p.y, p.z);
    noStroke();
    emissiveMaterial(col[0], col[1], col[2]);
    fill(col[0], col[1], col[2], style.haloAlpha);
    sphere(haloSize, 5, 4);
    emissiveMaterial(style.sparkCol[0], style.sparkCol[1], style.sparkCol[2]);
    fill(style.sparkCol[0], style.sparkCol[1], style.sparkCol[2], style.sparkAlpha);
    sphere(sparkSize, 5, 4);
    emissiveMaterial(col[0], col[1], col[2]);
    fill(col[0], col[1], col[2], style.coreAlpha);
    sphere(coreSize, 6, 5);
    pop();
  }
}

function getShapeStyle(shapeName) {
  const emeraldPalette = [
    [46, 236, 160],
    [62, 244, 174],
    [104, 255, 208],
  ];
  if (shapeName === 'RHOMBUS') {
    return { palette: emeraldPalette, halo: 2.95, core: 2.9, spark: 0.84, haloAlpha: 18, coreAlpha: 236, sparkAlpha: 56, sparkCol: [216, 250, 234] };
  }
  if (shapeName === 'RECTANGLE') {
    return { palette: emeraldPalette, halo: 2.9, core: 2.84, spark: 0.8, haloAlpha: 17, coreAlpha: 236, sparkAlpha: 54, sparkCol: [214, 250, 232] };
  }
  if (shapeName === 'TRIANGLE') {
    return { palette: emeraldPalette, halo: 2.94, core: 2.86, spark: 0.82, haloAlpha: 17, coreAlpha: 236, sparkAlpha: 54, sparkCol: [214, 250, 232] };
  }
  return { palette: emeraldPalette, halo: 3.02, core: 2.94, spark: 0.86, haloAlpha: 18, coreAlpha: 238, sparkAlpha: 58, sparkCol: [218, 252, 236] };
}

function getShapePoints(shapeName) {
  return shapePointsCache[shapeName] || [];
}

function addLedSegment(pts, a, b, count, jitter = 1.25, scaleMin = 0.98, scaleMax = 1.08, toneBase = 0.5) {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    pts.push(makeLedPoint(
      lerp(a.x, b.x, t) + random(-jitter, jitter),
      lerp(a.y, b.y, t) + random(-jitter, jitter),
      lerp(a.z, b.z, t) + random(-jitter, jitter),
      random(scaleMin, scaleMax),
      constrain(toneBase + random(-0.16, 0.16), 0, 1)
    ));
  }
}

function addLedVertexCluster(pts, v, count = 4, spread = 2.3, toneBase = 0.56) {
  for (let i = 0; i < count; i++) {
    pts.push(makeLedPoint(
      v.x + random(-spread, spread),
      v.y + random(-spread, spread),
      v.z + random(-spread, spread),
      random(0.96, 1.06),
      constrain(toneBase + random(-0.1, 0.1), 0, 1)
    ));
  }
}

function buildRectanglePoints() {
  const pts = [];
  const hw = 98;
  const hh = 68;
  const hz = 62;
  const front = [
    createVector(-hw, -hh, -hz), createVector(hw, -hh, -hz),
    createVector(hw, hh, -hz), createVector(-hw, hh, -hz),
  ];
  const back = [
    createVector(-hw, -hh, hz), createVector(hw, -hh, hz),
    createVector(hw, hh, hz), createVector(-hw, hh, hz),
  ];

  for (const loop of [front, back]) {
    addLedSegment(pts, loop[0], loop[1], 10, 1.15, 1.06, 1.22, 0.3);
    addLedSegment(pts, loop[1], loop[2], 8, 1.15, 1.06, 1.22, 0.48);
    addLedSegment(pts, loop[2], loop[3], 10, 1.15, 1.06, 1.22, 0.66);
    addLedSegment(pts, loop[3], loop[0], 8, 1.15, 1.06, 1.22, 0.84);
  }
  for (let i = 0; i < 4; i++) {
    addLedSegment(pts, front[i], back[i], 6, 1.15, 1.04, 1.18, 0.56);
    addLedVertexCluster(pts, front[i], 2, 2.2, 0.48 + i * 0.08);
    addLedVertexCluster(pts, back[i], 2, 2.2, 0.48 + i * 0.08);
  }
  const leftFrontMid = createVector(-hw, 0, -hz);
  const leftBackMid = createVector(-hw, 0, hz);
  const rightFrontMid = createVector(hw, 0, -hz);
  const rightBackMid = createVector(hw, 0, hz);
  const topFrontMid = createVector(0, -hh, -hz);
  const topBackMid = createVector(0, -hh, hz);
  const bottomFrontMid = createVector(0, hh, -hz);
  const bottomBackMid = createVector(0, hh, hz);
  addLedSegment(pts, leftFrontMid, leftBackMid, 5, 1.0, 0.98, 1.12, 0.22);
  addLedSegment(pts, rightFrontMid, rightBackMid, 5, 1.0, 0.98, 1.12, 0.78);
  addLedSegment(pts, topFrontMid, topBackMid, 5, 1.0, 0.98, 1.12, 0.38);
  addLedSegment(pts, bottomFrontMid, bottomBackMid, 5, 1.0, 0.98, 1.12, 0.62);

  for (let z = 0; z < 3; z++) {
    const zPos = lerp(-26, 26, z / 2);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        pts.push(makeLedPoint(
          lerp(-56, 56, x / 3) + random(-1.2, 1.2),
          lerp(-34, 34, y / 2) + random(-1.2, 1.2),
          zPos + random(-1.2, 1.2),
          random(0.78, 0.9),
          random()
        ));
      }
    }
  }
  return pts;
}

function buildTrianglePoints() {
  const pts = [];
  const triHalfBase = 94;
  const triTopY = -108;
  const triBaseY = 55;
  const front = [
    createVector(0, triTopY, -58),
    createVector(-triHalfBase, triBaseY, -58),
    createVector(triHalfBase, triBaseY, -58),
  ];
  const back = [
    createVector(0, triTopY, 58),
    createVector(-triHalfBase, triBaseY, 58),
    createVector(triHalfBase, triBaseY, 58),
  ];

  addLedSegment(pts, front[0], front[1], 9, 1.15, 1.06, 1.22, 0.26);
  addLedSegment(pts, front[1], front[2], 11, 1.15, 1.06, 1.22, 0.54);
  addLedSegment(pts, front[2], front[0], 9, 1.15, 1.06, 1.22, 0.8);
  addLedSegment(pts, back[0], back[1], 7, 1.15, 1.04, 1.18, 0.26);
  addLedSegment(pts, back[1], back[2], 8, 1.15, 1.04, 1.18, 0.54);
  addLedSegment(pts, back[2], back[0], 7, 1.15, 1.04, 1.18, 0.8);

  for (let i = 0; i < 3; i++) {
    addLedSegment(pts, front[i], back[i], 6, 1.15, 1.04, 1.18, 0.44 + i * 0.16);
    addLedVertexCluster(pts, front[i], 2, 2.3, 0.34 + i * 0.18);
    addLedVertexCluster(pts, back[i], 2, 2.3, 0.34 + i * 0.18);
  }
  const frontBaseMid = p5.Vector.lerp(front[1], front[2], 0.5);
  const backBaseMid = p5.Vector.lerp(back[1], back[2], 0.5);
  addLedSegment(pts, front[0], backBaseMid, 5, 1.0, 0.98, 1.12, 0.2);
  addLedSegment(pts, frontBaseMid, back[0], 5, 1.0, 0.98, 1.12, 0.72);
  addLedSegment(pts, frontBaseMid, backBaseMid, 5, 1.0, 0.98, 1.12, 0.48);

  for (let z = 0; z < 3; z++) {
    const zT = z / 2;
    const zPos = lerp(-24, 24, zT);
    for (let row = 1; row <= 3; row++) {
      const rowT = row / 4;
      const y = lerp(triTopY + 20, triBaseY - 18, rowT);
      const halfWidth = lerp(18, 56, rowT);
      const count = row + 1;
      for (let i = 0; i < count; i++) {
        const along = count === 1 ? 0.5 : i / (count - 1);
        pts.push(makeLedPoint(
          lerp(-halfWidth, halfWidth, along) + random(-1.1, 1.1),
          y + random(-1.1, 1.1),
          zPos + random(-1.1, 1.1),
          random(0.78, 0.9),
          random()
        ));
      }
    }
  }
  return pts;
}

function buildRhombusPoints() {
  const pts = [];
  const rhombHalfWidth = 76;
  const rhombHalfHeight = 112;
  const front = [
    createVector(0, -rhombHalfHeight, -54),
    createVector(rhombHalfWidth, 0, -54),
    createVector(0, rhombHalfHeight, -54),
    createVector(-rhombHalfWidth, 0, -54),
  ];
  const back = [
    createVector(0, -rhombHalfHeight, 54),
    createVector(rhombHalfWidth, 0, 54),
    createVector(0, rhombHalfHeight, 54),
    createVector(-rhombHalfWidth, 0, 54),
  ];

  for (const loop of [front, back]) {
    addLedSegment(pts, loop[0], loop[1], 8, 1.0, 1.02, 1.14, 0.22);
    addLedSegment(pts, loop[1], loop[2], 8, 1.0, 1.02, 1.14, 0.48);
    addLedSegment(pts, loop[2], loop[3], 8, 1.0, 1.02, 1.14, 0.72);
    addLedSegment(pts, loop[3], loop[0], 8, 1.0, 1.02, 1.14, 0.9);
  }

  for (let i = 0; i < 4; i++) {
    addLedSegment(pts, front[i], back[i], 6, 1.0, 1.0, 1.12, 0.38 + i * 0.12);
    addLedVertexCluster(pts, front[i], 2, 2.2, 0.34 + i * 0.14);
    addLedVertexCluster(pts, back[i], 2, 2.2, 0.34 + i * 0.14);
  }
  const verticalCenterFront = createVector(0, 0, -54);
  const verticalCenterBack = createVector(0, 0, 54);
  const horizontalFrontLeft = createVector(-rhombHalfWidth * 0.5, 0, -54);
  const horizontalFrontRight = createVector(rhombHalfWidth * 0.5, 0, -54);
  const horizontalBackLeft = createVector(-rhombHalfWidth * 0.5, 0, 54);
  const horizontalBackRight = createVector(rhombHalfWidth * 0.5, 0, 54);
  addLedSegment(pts, verticalCenterFront, verticalCenterBack, 5, 0.9, 0.98, 1.1, 0.5);
  addLedSegment(pts, horizontalFrontLeft, horizontalBackLeft, 4, 0.9, 0.96, 1.08, 0.16);
  addLedSegment(pts, horizontalFrontRight, horizontalBackRight, 4, 0.9, 0.96, 1.08, 0.84);

  for (let z = 0; z < 3; z++) {
    const zPos = lerp(-24, 24, z / 2);
    for (let row = 1; row <= 4; row++) {
      const rowT = row / 5;
      const y = lerp(-74, 74, rowT);
      const profile = 1 - abs(0.5 - rowT) * 2;
      const halfWidth = lerp(18, rhombHalfWidth * 0.78, profile);
      const count = 2 + row;
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? 0 : lerp(-halfWidth, halfWidth, i / (count - 1));
        pts.push(makeLedPoint(
          x + random(-0.9, 0.9),
          y + random(-0.9, 0.9),
          zPos + random(-0.9, 0.9),
          random(0.78, 0.9),
          random()
        ));
      }
    }
  }
  return pts;
}

function buildCirclePoints() {
  const pts = [];
  const shellCount = 64;
  const innerCount = 26;
  const radius = 92;
  const goldenAngle = PI * (3 - sqrt(5));

  for (let i = 0; i < shellCount; i++) {
    const yNorm = 1 - (i / (shellCount - 1)) * 2;
    const ringRadius = sqrt(max(0, 1 - yNorm * yNorm));
    const theta = goldenAngle * i;
    pts.push(makeLedPoint(
      cos(theta) * ringRadius * radius + random(-2.5, 2.5),
      yNorm * radius + random(-2.5, 2.5),
      sin(theta) * ringRadius * radius + random(-2.5, 2.5),
      random(0.94, 1.08),
      random()
    ));
  }

  for (let i = 0; i < innerCount; i++) {
    const theta = random(TWO_PI);
    const phi = acos(random(-1, 1));
    const r = radius * pow(random(), 0.72) * 0.82;
    pts.push(makeLedPoint(
      sin(phi) * cos(theta) * r + random(-2, 2),
      cos(phi) * r + random(-2, 2),
      sin(phi) * sin(theta) * r + random(-2, 2),
      random(0.82, 0.96),
      random()
    ));
  }
  return pts;
}

function makeLedPoint(x, y, z, scale = 1, tone = 0.5) {
  return { x, y, z, scale, tone };
}

function samplePalette(palette, t) {
  const scaled = constrain(t, 0, 0.9999) * palette.length;
  const i0 = floor(scaled) % palette.length;
  const i1 = (i0 + 1) % palette.length;
  const frac = scaled - floor(scaled);
  return [
    lerp(palette[i0][0], palette[i1][0], frac),
    lerp(palette[i0][1], palette[i1][1], frac),
    lerp(palette[i0][2], palette[i1][2], frac),
  ];
}

function drawOverlay() {
  push();
  resetMatrix();
  translate(-W / 2, -H / 2);

  const px = panelLeft();
  const py = panelTop();
  drawCornerFrame(px, py, PANEL_W, PANEL_H);

  noStroke();
  fill(255, 255, 255, 225);
  if (monoFont) textFont(monoFont);
  textSize(14);
  textAlign(LEFT, TOP);
  text(`shape test: ${SHAPES[shapeIndex].toLowerCase()}`, px + 10, py - 30);

  fill(255, 255, 255, 130);
  textSize(10);
  text('mano sinistra aperta: cambia figura', px + 10, py + PANEL_H + 12);
  text('indice + pollice aperti: ruota figura', px + 10, py + PANEL_H + 28);

  if (!handsReady && !handsLoadError) {
    fill(255, 220, 140, 220);
    text('loading mediapipe hands...', px + 12, py + 12);
  } else if (handsLoadError) {
    fill(255, 120, 120, 220);
    text('failed to load mediapipe hands', px + 12, py + 12);
  }

  pop();
}

function drawCornerFrame(x, y, w, h) {
  stroke(255, 255, 255, 176);
  strokeWeight(2.2);
  noFill();

  const L = 28;
  line(x, y, x + L, y);
  line(x, y, x, y + L);

  line(x + w - L, y, x + w, y);
  line(x + w, y, x + w, y + L);

  line(x, y + h - L, x, y + h);
  line(x, y + h, x + L, y + h);

  line(x + w - L, y + h, x + w, y + h);
  line(x + w, y + h - L, x + w, y + h);
}

function getIndexThumbRotateState(kps) {
  const indexTip = kps[8];
  const thumbTip = kps[4];
  const centerX = (indexTip.x + thumbTip.x) * 0.5;
  const fingerAngle = atan2(indexTip.y - thumbTip.y, indexTip.x - thumbTip.x);
  const wristAngle = handRollAngle(kps);
  return { centerX, fingerAngle, wristAngle };
}

function indexTipScreen(kps) {
  return {
    sx: (1 - kps[8].x) * W - W / 2,
    sy: kps[8].y * H - H / 2,
  };
}

function isIndexThumbOpen(kps) {
  const scale = handGestureScale(kps);
  const indexUp = kps[8].y < kps[6].y - max(0.004, scale * 0.012);
  const thumbOpen = dist(kps[4].x, kps[4].y, kps[5].x, kps[5].y) > max(0.022, scale * 0.22);
  const thumbFar = dist(kps[4].x, kps[4].y, kps[8].x, kps[8].y) > max(0.05, scale * 0.44);
  const middleDown = kps[12].y > kps[10].y + max(0.002, scale * 0.004);
  const ringDown = kps[16].y > kps[14].y + max(0.002, scale * 0.004);
  const pinkyDown = kps[20].y > kps[18].y + max(0.002, scale * 0.004);
  return indexUp && thumbOpen && thumbFar && middleDown && ringDown && pinkyDown;
}

function isFullOpen(kps) {
  const scale = handGestureScale(kps);
  const margin = max(0.004, scale * 0.01);
  const fingersOpen = [[8, 6], [12, 10], [16, 14], [20, 18]].every(([t, p]) => (
    kps[t].y < kps[p].y - margin
  ));
  const thumbOpen = dist(kps[4].x, kps[4].y, kps[5].x, kps[5].y) > max(0.022, scale * 0.22);
  const spread = dist(kps[8].x, kps[8].y, kps[20].x, kps[20].y) > max(0.085, scale * 0.8);
  return fingersOpen && thumbOpen && spread;
}

function isIndexOnlyUp(kps) {
  return kps[8].y < kps[6].y
      && kps[12].y > kps[10].y
      && kps[16].y > kps[14].y
      && kps[20].y > kps[18].y;
}

function handGestureScale(kps) {
  const palmWidth = dist(kps[5].x, kps[5].y, kps[17].x, kps[17].y);
  const midX = (kps[9].x + kps[13].x) * 0.5;
  const midY = (kps[9].y + kps[13].y) * 0.5;
  const palmDepth = dist(kps[0].x, kps[0].y, midX, midY);
  return max(palmWidth, palmDepth, 0.001);
}

function getPrimaryLeftHand() {
  return handsData.find(h => h.label === 'Right') || null;
}

function getPrimaryRightHand() {
  return handsData.find(h => h.label === 'Left') || null;
}

function handRollAngle(kps) {
  const indexBase = kps[5];
  const pinkyBase = kps[17];
  return atan2(pinkyBase.y - indexBase.y, pinkyBase.x - indexBase.x);
}

function panelLeft() {
  return PANEL_MARGIN;
}

function panelTop() {
  return PANEL_MARGIN + 16;
}

function panelCenterX() {
  return panelLeft() + PANEL_W * 0.5 - W * 0.5;
}

function panelCenterY() {
  return panelTop() + PANEL_H * 0.54 - H * 0.5;
}

function angleDelta(a, b) {
  let d = a - b;
  while (d > PI) d -= TWO_PI;
  while (d < -PI) d += TWO_PI;
  return d;
}

function drawBackground() {
  if (!bgPg) bgPg = createGraphics(W, H);
  bgPg.clear();
  bgPg.push();
  bgPg.translate(W, 0);
  bgPg.scale(-1, 1);
  bgPg.image(video, 0, 0, W, H);
  bgPg.pop();
  bgPg.noStroke();
  bgPg.fill(4, 6, 10, 44);
  bgPg.rect(0, 0, W, H);

  const gl = drawingContext;
  gl.disable(gl.DEPTH_TEST);
  push();
  noStroke();
  texture(bgPg);
  plane(W, H);
  pop();
  gl.enable(gl.DEPTH_TEST);
}

function ensureMediaPipeHands() {
  if (typeof Hands !== 'undefined') return Promise.resolve();
  return loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-codex-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('script load failed')), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.codexSrc = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('script load failed')), { once: true });
    document.head.appendChild(script);
  });
}

function initHands() {
  handsSol = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  handsSol.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.72,
    minTrackingConfidence: 0.55,
  });
  handsSol.onResults(r => {
    const lm = r.multiHandLandmarks || [];
    const hn = r.multiHandedness || [];
    handsData = lm.map((kps, i) => ({
      kps,
      label: hn[i]?.label ?? 'Unknown',
    }));
  });
}

async function sendFrame() {
  if (busy || !video?.elt || video.elt.readyState < 2) return;
  busy = true;
  try {
    await handsSol.send({ image: video.elt });
  } catch (_) {}
  busy = false;
}