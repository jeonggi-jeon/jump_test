/**
 * Neon Run — 캔버스 러닝 점프 게임
 */
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });

  const elScore = document.getElementById("score");
  const elBest = document.getElementById("best");
  const elFinal = document.getElementById("final");
  const screenStart = document.getElementById("screen-start");
  const screenOver = document.getElementById("screen-over");
  const frameEl = document.querySelector(".frame");

  const LS_KEY = "neon_run_best";
  let best = Number(localStorage.getItem(LS_KEY)) || 0;
  elBest.textContent = String(Math.floor(best));

  const BASE_W = 900;
  const BASE_H = 400;
  const GROUND_H = 52;
  const GRAVITY = 0.75;
  const JUMP_VY = -13.2;
  const HORIZ_SPEED = 248;
  const FLY_VERT_SPEED = 230;
  const EDGE_PAD = 8;
  const MIN_P_Y = 12;
  const PLAYER = { w: 34, h: 38, x0: 120 };

  const PICK = {
    invinc: { dur: 7, w: 22, h: 22, label: "SHIELD" },
    jump: { dur: 10, w: 20, h: 22, label: "JUMP" },
    fly: { dur: 10, w: 24, h: 20, label: "FLY" },
    gun: { dur: 8, w: 24, h: 16, label: "GUN" },
  };
  const BULLET_VX = 12;
  const BULLET_W = 9;
  const BULLET_H = 3;
  const BULLET_FIRE_SEC = 0.1;
  const JUMP_BONUS_MULT = 1.48;

  const AIR_SPAWN_T0 = 3.5;
  const AIR_SPAWN_RAMP = 50;
  const JUMP_APEX_PX = 120;
  const AIR_ABOVE_JUMP = 12;
  const GROUND_SPAWN_AIR_CHILL = 0.32;
  const keys = { left: false, right: false, up: false, down: false };
  const input = {
    activeId: null,
    downInFrame: false,
    dragging: false,
    startTime: 0,
    startX: 0,
    startY: 0,
    usingTouch: false,
    touchHDir: 0,
    flyAnchorX: 0,
    flyAnchorY: 0,
    flySynced: false,
  };

  function toGameX(clientX) {
    const r = canvas.getBoundingClientRect();
    if (r.width < 0.5) {
      return BASE_W * 0.5;
    }
    return ((clientX - r.left) / r.width) * BASE_W;
  }

  function clampPlayerX(p) {
    const minX = EDGE_PAD;
    const maxX = BASE_W - p.w - EDGE_PAD;
    if (p.x < minX) p.x = minX;
    if (p.x > maxX) p.x = maxX;
  }

  function toGameY(clientY) {
    const r = canvas.getBoundingClientRect();
    if (r.height < 0.5) {
      return BASE_H * 0.5;
    }
    return ((clientY - r.top) / r.height) * BASE_H;
  }

  function readDisplayWidth() {
    let w =
      frameEl && frameEl.clientWidth > 0
        ? frameEl.clientWidth
        : Math.min(920, (window.visualViewport && window.visualViewport.width) || window.innerWidth) - 12;
    if (w < 1 || !isFinite(w)) w = window.innerWidth || 360;
    w = Math.max(1, w);
    return w;
  }

  function syncCanvas() {
    const displayW = readDisplayWidth();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bufW = Math.max(1, Math.round(displayW * dpr));
    const bufH = Math.max(1, Math.round((displayW * BASE_H) / BASE_W * dpr));
    if (canvas.width !== bufW || canvas.height !== bufH) {
      canvas.width = bufW;
      canvas.height = bufH;
    }
  }
  syncCanvas();
  if (frameEl) {
    new ResizeObserver(() => syncCanvas()).observe(frameEl);
  }
  window.addEventListener("resize", syncCanvas, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncCanvas, { passive: true });
    window.visualViewport.addEventListener("scroll", syncCanvas, { passive: true });
  }
  window.addEventListener(
    "orientationchange",
    function onOrient() {
      setTimeout(syncCanvas, 200);
    },
    { passive: true }
  );
  requestAnimationFrame(syncCanvas);
  if (window.screen && window.screen.orientation) {
    try {
      window.screen.orientation.addEventListener("change", function onSO() {
        setTimeout(syncCanvas, 200);
      });
    } catch (e) {
      /* some browsers */
    }
  }

  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  const state = {
    mode: "title",
    t: 0,
    player: { x: PLAYER.x0, y: 0, w: PLAYER.w, h: PLAYER.h, vy: 0, onGround: true, pulse: 0 },
    obstacles: [],
    nextSpawn: 0,
    nextAirSpawn: 168,
    score: 0,
    displayScore: 0,
    baseSpeed: 5.2,
    speed: 5.2,
    shake: 0,
    shakeSeed: 0,
    landBurst: null,
    nebulaOffset: 0,
    comet: { x: 0, y: 0, t: 0, active: false },
    buffInvinc: 0,
    buffJump: 0,
    buffFly: 0,
    buffGun: 0,
    bulletAcc: 0,
    bullets: [],
    airSpawnChill: 0,
    pickups: [],
    nextPickup: 0,
  };

  function isFlying() {
    return state.buffFly > 0;
  }
  function clampPlayerYFly(p) {
    const yMin = MIN_P_Y;
    const yMax = groundY() - p.h;
    if (p.y < yMin) p.y = yMin;
    if (p.y > yMax) p.y = yMax;
  }

  const stars = [];
  for (let i = 0; i < 120; i++) {
    stars.push({
      x: Math.random() * BASE_W,
      y: Math.random() * (BASE_H * 0.55),
      r: 0.4 + Math.random() * 1.6,
      a: 0.3 + Math.random() * 0.7,
      tw: Math.random() * Math.PI * 2,
    });
  }

  const parallaxBlobs = [
    { x: 0.1, s: 0.3, hue: 270 },
    { x: 0.5, s: 0.25, hue: 200 },
    { x: 0.85, s: 0.28, hue: 160 },
  ];

  const particles = [];
  const floatingTexts = [];
  let lastActionAt = 0;
  const ACTION_DEBOUNCE_MS = 42;

  function groundY() {
    return BASE_H - GROUND_H;
  }

  function resetPlayer() {
    const p = state.player;
    p.x = PLAYER.x0;
    p.w = PLAYER.w;
    p.h = PLAYER.h;
    p.y = groundY() - p.h;
    p.vy = 0;
    p.onGround = true;
    p.pulse = 0;
  }

  function startGame() {
    state.mode = "play";
    state.t = 0;
    state.obstacles = [];
    state.nextSpawn = 40;
    state.nextAirSpawn = 168;
    state.pickups.length = 0;
    state.nextPickup = 100;
    state.buffInvinc = 0;
    state.buffJump = 0;
    state.buffFly = 0;
    state.buffGun = 0;
    state.bulletAcc = 0;
    state.bullets.length = 0;
    state.airSpawnChill = 0;
    state.score = 0;
    state.displayScore = 0;
    state.baseSpeed = 5.2;
    state.speed = 5.2;
    state.shake = 0;
    state.landBurst = null;
    particles.length = 0;
    floatingTexts.length = 0;
    screenStart.classList.add("hidden");
    screenOver.classList.add("hidden");
    resetPlayer();
    elScore.textContent = "0";
  }

  function gameOver() {
    if (state.mode === "over") return;
    state.mode = "over";
    state.shake = 20;
    state.shakeSeed = state.t;
    for (let i = 0; i < 48; i++) {
      spawnParticle(
        state.player.x + state.player.w / 2,
        state.player.y + state.player.h / 2,
        2.5 + Math.random() * 4
      );
    }
    if (state.score > best) {
      best = state.score;
      localStorage.setItem(LS_KEY, String(Math.floor(best)));
    }
    elBest.textContent = String(Math.floor(best));
    elFinal.textContent = String(Math.floor(state.score));
    elScore.textContent = elFinal.textContent;
    state.bullets.length = 0;
    state.buffGun = 0;
    state.bulletAcc = 0;
    screenOver.classList.remove("hidden");
    screenStart.classList.add("hidden");
  }

  function spawnParticle(x, y, speedScale) {
    const a = Math.random() * Math.PI * 2;
    const v = (2 + Math.random() * 4) * speedScale;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 1,
      life: 0.7 + Math.random() * 0.5,
      max: 0.7 + Math.random() * 0.5,
      r: 2 + Math.random() * 3.5,
      hue: 160 + Math.random() * 120,
    });
  }

  function spawnDustAtFeet() {
    const py = state.player.y + state.player.h;
    for (let i = 0; i < 7; i++) {
      const x = state.player.x + Math.random() * state.player.w;
      spawnParticle(x, py - 2, 0.35);
    }
  }

  function aabb(c, b) {
    return (
      c.x < b.x + b.w && c.x + c.w > b.x && c.y < b.y + b.h && c.y + c.h > b.y
    );
  }

  function spawnBullet() {
    const p = state.player;
    state.bullets.push({
      x: p.x + p.w * 0.55,
      y: p.y + p.h * 0.36,
      w: BULLET_W,
      h: BULLET_H,
    });
  }

  function addObstacle() {
    const w = 22 + Math.random() * 24;
    const h = 32 + Math.random() * 44;
    const gy = groundY();
    state.obstacles.push({
      x: BASE_W + 20,
      y: gy - h,
      w,
      h,
      hit: 0.35 + Math.random() * 0.35,
      isAir: false,
    });
    state.airSpawnChill = GROUND_SPAWN_AIR_CHILL;
  }

  function addAirObstacle() {
    const w = 20 + Math.random() * 26;
    const h = 16 + Math.random() * 28;
    const gy = groundY();
    const yHeadPeak = gy - PLAYER.h - JUMP_APEX_PX;
    const yBlockBottomMax = yHeadPeak - AIR_ABOVE_JUMP;
    if (yBlockBottomMax < MIN_P_Y + h) {
      return false;
    }
    const yTopMax = yBlockBottomMax - h;
    const yTopMin = MIN_P_Y + 20;
    if (yTopMax < yTopMin + 2) {
      return false;
    }
    const y = yTopMin + Math.random() * (yTopMax - yTopMin);
    state.obstacles.push({
      x: BASE_W + 18,
      y: y,
      w,
      h,
      hit: 0.3 + Math.random() * 0.35,
      isAir: true,
    });
    return true;
  }

  const PICK_TYPES = ["invinc", "jump", "fly", "gun"];
  function addPickup() {
    const kind = PICK_TYPES[Math.floor(Math.random() * PICK_TYPES.length)];
    const d = PICK[kind];
    const onGround = Math.random() < 0.5;
    let y;
    if (onGround) {
      y = groundY() - d.h;
    } else {
      const top = MIN_P_Y + 18;
      const bottom = groundY() - 70;
      y = top + Math.random() * Math.max(1, bottom - top);
    }
    state.pickups.push({
      type: kind,
      x: BASE_W + 24,
      y: y,
      w: d.w,
      h: d.h,
      t: 0,
      onGround: onGround,
    });
  }

  function currentJumpV() {
    if (state.buffJump > 0) {
      return JUMP_VY * JUMP_BONUS_MULT;
    }
    return JUMP_VY;
  }

  function tryJump() {
    if (state.mode === "play" && isFlying()) {
      const now0 = performance.now();
      if (now0 - lastActionAt < ACTION_DEBOUNCE_MS) {
        return;
      }
      lastActionAt = now0;
      const p = state.player;
      p.y = Math.max(MIN_P_Y, p.y - 20);
      clampPlayerYFly(p);
      p.pulse = 0.8;
      for (let j = 0; j < 8; j++) {
        const xj = p.x + p.w * 0.2 + Math.random() * p.w * 0.6;
        spawnParticle(xj, p.y + p.h, 0.3);
      }
      return;
    }
    if (state.mode === "play" && !state.player.onGround) {
      return;
    }
    const now = performance.now();
    if (now - lastActionAt < ACTION_DEBOUNCE_MS) {
      return;
    }
    lastActionAt = now;
    if (state.mode === "title" || state.mode === "over") {
      startGame();
      return;
    }
    const p = state.player;
    if (!p.onGround) return;
    p.vy = currentJumpV();
    p.onGround = false;
    p.pulse = 1;
    for (let i = 0; i < 16; i++) {
      const x = p.x + p.w * 0.2 + Math.random() * p.w * 0.6;
      spawnParticle(x, p.y + p.h, 0.5);
    }
    floatingTexts.push({ x: p.x + p.w * 0.4, y: p.y, text: "▲", t: 0, life: 0.45 });
  }

  function setKeyDir(e, isDown) {
    const c = e.code;
    if (c === "ArrowLeft" || c === "KeyA") {
      keys.left = isDown;
      e.preventDefault();
    } else if (c === "ArrowRight" || c === "KeyD") {
      keys.right = isDown;
      e.preventDefault();
    } else if (c === "ArrowUp" || c === "KeyW") {
      keys.up = isDown;
      e.preventDefault();
    } else if (c === "ArrowDown" || c === "KeyS") {
      keys.down = isDown;
      e.preventDefault();
    }
  }

  function onKeyDown(e) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      tryJump();
      return;
    }
    setKeyDir(e, true);
  }
  function onKeyUp(e) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      return;
    }
    setKeyDir(e, false);
  }
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("blur", function onBlur() {
    keys.left = false;
    keys.right = false;
    keys.up = false;
    keys.down = false;
  });

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (!frameEl) return;
    if (!frameEl.contains(e.target)) return;
    input.activeId = e.pointerId;
    input.downInFrame = true;
    input.dragging = false;
    input.startTime = performance.now();
    input.startX = e.clientX;
    input.startY = e.clientY;
    input.usingTouch = e.pointerType === "touch";
    input.touchHDir = 0;
    if (state.mode === "play") {
      if (isFlying()) {
        const pl = state.player;
        input.flyAnchorX = pl.x;
        input.flyAnchorY = pl.y;
        input.flySynced = true;
      } else {
        input.flySynced = false;
      }
    }
    try {
      frameEl.setPointerCapture(e.pointerId);
    } catch (err) {
      /* */
    }
  }
  function onPointerMove(e) {
    if (e.pointerId !== input.activeId) return;
    if (state.mode !== "play") return;
    const p = state.player;
    if (isFlying()) {
      if (!input.flySynced) {
        input.flyAnchorX = p.x;
        input.flyAnchorY = p.y;
        input.startX = e.clientX;
        input.startY = e.clientY;
        input.flySynced = true;
      }
      const ddx = e.clientX - input.startX;
      const ddy = e.clientY - input.startY;
      const r = canvas.getBoundingClientRect();
      const scX = BASE_W / Math.max(0.5, r.width);
      const scY = BASE_H / Math.max(0.5, r.height);
      p.x = input.flyAnchorX + ddx * scX;
      p.y = input.flyAnchorY + ddy * scY;
      clampPlayerX(p);
      clampPlayerYFly(p);
      if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) {
        input.dragging = true;
      }
      return;
    }
    const dx = e.clientX - input.startX;
    const dy = e.clientY - input.startY;
    if (input.usingTouch) {
      if (Math.abs(dx) > 8) {
        input.dragging = true;
        input.touchHDir = dx > 0 ? 1 : -1;
      } else {
        input.touchHDir = 0;
      }
      return;
    }
    if (Math.abs(dx) > 8) {
      input.dragging = true;
    }
    if (input.dragging) {
      const gx = toGameX(e.clientX);
      p.x = Math.max(EDGE_PAD, Math.min(BASE_W - p.w - EDGE_PAD, gx - p.w * 0.5));
    }
  }
  function onPointerUp(e) {
    if (e.pointerId !== input.activeId) return;
    if (e.type === "pointerup" && e.button !== 0) return;
    if (!input.downInFrame) return;
    const wasDrag = input.dragging;
    const dur = performance.now() - input.startTime;
    const dist = Math.hypot(e.clientX - input.startX, e.clientY - input.startY);
    if (frameEl) {
      try {
        frameEl.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* */
      }
    }
    input.activeId = null;
    input.downInFrame = false;
    input.dragging = false;
    input.usingTouch = false;
    input.touchHDir = 0;
    if (wasDrag) return;
    const inMenu = state.mode === "title" || state.mode === "over";
    if (inMenu) {
      if (dist > 56) return;
    } else {
      if (dist > 24) return;
    }
    if (dur > 500) return;
    tryJump();
  }
  if (frameEl) {
    frameEl.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
    frameEl.addEventListener("pointermove", onPointerMove, { passive: true });
    frameEl.addEventListener("pointerup", onPointerUp, { passive: true });
    frameEl.addEventListener("pointercancel", onPointerUp, { passive: true });
  }

  // --- update
  function update(dt) {
    state.t += dt;
    state.nebulaOffset += 0.008 * (state.mode === "play" ? 1.1 : 0.35);

    for (const s of stars) {
      s.tw += 0.022;
    }

    if (state.shake > 0) {
      state.shake *= 0.9;
      if (state.shake < 0.2) state.shake = 0;
    }

    if (state.mode === "over") {
      for (const pa of particles) {
        pa.x += pa.vx;
        pa.y += pa.vy;
        pa.vy += 0.15;
        pa.life -= dt;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].life <= 0) particles.splice(i, 1);
      }
      for (const ft of floatingTexts) {
        ft.t += dt;
        ft.y -= 32 * dt;
      }
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        if (floatingTexts[i].t >= floatingTexts[i].life) floatingTexts.splice(i, 1);
      }
      return;
    }

    if (state.mode === "title") {
      if (!state.comet.active && Math.random() < 0.0025) {
        state.comet.active = true;
        state.comet.x = BASE_W + 50;
        state.comet.y = 20 + Math.random() * 90;
        state.comet.t = 0;
      }
      if (state.comet.active) {
        state.comet.x -= 2.4;
        if (state.comet.x < -100) state.comet.active = false;
      }
      return;
    }

    // play
    const p = state.player;
    p.pulse = Math.max(0, p.pulse - dt * 3.5);
    if (isFlying()) {
      p.onGround = false;
      if (input.activeId === null) {
        let vh = 0;
        if (keys.left) vh -= 1;
        if (keys.right) vh += 1;
        p.x += vh * HORIZ_SPEED * dt;
        let vv = 0;
        if (keys.up) vv -= 1;
        if (keys.down) vv += 1;
        p.y += vv * FLY_VERT_SPEED * dt;
        clampPlayerX(p);
        clampPlayerYFly(p);
      } else {
        clampPlayerX(p);
        clampPlayerYFly(p);
      }
    } else {
      p.vy += GRAVITY;
      p.y += p.vy;
      const floor = groundY() - p.h;
      if (p.y >= floor) {
        p.y = floor;
        p.vy = 0;
        if (!p.onGround) {
          p.onGround = true;
          state.landBurst = { t: 0, x: p.x + p.w * 0.5 };
          spawnDustAtFeet();
          for (let j = 0; j < 4; j++) {
            const x = p.x + 6 + Math.random() * (p.w - 12);
            spawnParticle(x, p.y + p.h - 2, 0.28);
          }
        }
      }
      if (p.onGround) p.pulse += dt * 0.85;

      let hdir = 0;
      if (keys.left) hdir -= 1;
      if (keys.right) hdir += 1;
      if (input.activeId !== null && input.usingTouch) {
        if (input.touchHDir !== 0) hdir = input.touchHDir;
      }
      p.x += hdir * HORIZ_SPEED * dt;
      clampPlayerX(p);
    }

    const ramp = 1 + Math.min(1.85, state.t / 38000);
    state.speed = state.baseSpeed * ramp;
    const scoreAdd = (state.speed / 60) * 0.38;
    state.score += scoreAdd;
    state.displayScore = state.displayScore * 0.9 + state.score * 0.1;
    elScore.textContent = String(Math.floor(state.displayScore));

    if (state.landBurst) {
      state.landBurst.t += dt;
      if (state.landBurst.t > 0.14) state.landBurst = null;
    }

    for (const ob of state.obstacles) {
      ob.x -= state.speed;
    }
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      if (state.obstacles[i].x + state.obstacles[i].w < -24) {
        const gone = state.obstacles[i];
        state.obstacles.splice(i, 1);
        state.score += 6;
        floatingTexts.push({
          x: 160 + Math.random() * 280,
          y: gone.isAir
            ? Math.max(40, Math.min(groundY() - 20, gone.y - 2 + Math.random() * 18))
            : 100 + Math.random() * 50,
          text: "+6",
          t: 0,
          life: 0.55,
        });
      }
    }

    state.nextSpawn -= state.speed * 0.5;
    if (state.nextSpawn <= 0) {
      const gap = 90 + Math.random() * 115;
      state.nextSpawn = gap + state.speed * 2.4;
      addObstacle();
    }

    {
      const tsec = state.t;
      if (tsec < AIR_SPAWN_T0) {
        state.nextAirSpawn = 168;
      } else {
        state.airSpawnChill = Math.max(0, state.airSpawnChill - dt);
        if (state.airSpawnChill <= 0) {
          const u = Math.min(1, (tsec - AIR_SPAWN_T0) / AIR_SPAWN_RAMP);
          const strength = 0.22 + 0.78 * u;
          state.nextAirSpawn -= state.speed * 0.6 * strength;
          if (state.nextAirSpawn <= 0) {
            const placed = addAirObstacle();
            if (!placed) {
              state.nextAirSpawn = 50;
            } else {
              const g =
                (90 + Math.random() * 120) / (0.18 + 0.82 * strength) +
                state.speed * 1.05;
              state.nextAirSpawn = Math.max(40, g);
            }
          }
        }
      }
    }

    state.nextPickup -= state.speed * 0.4;
    if (state.nextPickup <= 0) {
      const gap2 = 220 + Math.random() * 200;
      state.nextPickup = gap2 + state.speed;
      if (state.pickups.length < 2) {
        addPickup();
      }
    }
    for (const pk of state.pickups) {
      pk.t += dt * 5;
      pk.x -= state.speed;
    }
    for (let i2 = state.pickups.length - 1; i2 >= 0; i2--) {
      if (state.pickups[i2].x + state.pickups[i2].w < -16) {
        state.pickups.splice(i2, 1);
      }
    }

    for (let bi = state.bullets.length - 1; bi >= 0; bi--) {
      const b = state.bullets[bi];
      b.x += BULLET_VX;
      if (b.x > BASE_W + 36) {
        state.bullets.splice(bi, 1);
        continue;
      }
      for (let oi = state.obstacles.length - 1; oi >= 0; oi--) {
        const ob = state.obstacles[oi];
        if (!aabb(b, ob)) continue;
        const cx = ob.x + ob.w * 0.5;
        const cyy = ob.y + ob.h * 0.5;
        state.obstacles.splice(oi, 1);
        state.bullets.splice(bi, 1);
        for (let q = 0; q < 12; q++) {
          spawnParticle(cx, cyy, 1.3);
        }
        state.score += 3;
        floatingTexts.push({
          x: cx,
          y: cyy,
          text: "BANG",
          t: 0,
          life: 0.4,
        });
        break;
      }
    }
    if (state.buffGun > 0) {
      state.bulletAcc += dt;
      while (state.buffGun > 0 && state.bulletAcc >= BULLET_FIRE_SEC) {
        state.bulletAcc -= BULLET_FIRE_SEC;
        spawnBullet();
      }
    } else {
      state.bulletAcc = 0;
    }

    const margin = 5.5;
    const pRect = {
      x: p.x + margin,
      y: p.y + margin * 0.4,
      w: p.w - margin * 2,
      h: p.h - margin * 0.6,
    };
    for (let oi = state.obstacles.length - 1; oi >= 0; oi--) {
      const ob = state.obstacles[oi];
      if (!aabb(pRect, ob)) continue;
      if (state.buffInvinc > 0) {
        state.obstacles.splice(oi, 1);
        const cx = ob.x + ob.w * 0.5;
        const cyy = ob.y + ob.h * 0.5;
        for (let q = 0; q < 18; q++) {
          spawnParticle(cx, cyy, 1.6);
        }
        state.score += 4;
        floatingTexts.push({
          x: cx,
          y: cyy,
          text: "CRASH",
          t: 0,
          life: 0.45,
        });
      } else {
        gameOver();
        return;
      }
    }

    for (let pi = state.pickups.length - 1; pi >= 0; pi--) {
      const it = state.pickups[pi];
      if (aabb(pRect, it)) {
        if (it.type === "invinc") {
          state.buffInvinc += PICK.invinc.dur;
        } else if (it.type === "jump") {
          state.buffJump += PICK.jump.dur;
        } else if (it.type === "fly") {
          state.buffFly += PICK.fly.dur;
        } else {
          state.buffGun += PICK.gun.dur;
        }
        floatingTexts.push({
          x: p.x,
          y: p.y - 4,
          text: PICK[it.type].label,
          t: 0,
          life: 0.6,
        });
        state.pickups.splice(pi, 1);
        for (let w = 0; w < 20; w++) {
          spawnParticle(
            p.x + p.w * 0.5,
            p.y + p.h * 0.5,
            1.3
          );
        }
      }
    }

    state.buffInvinc = Math.max(0, state.buffInvinc - dt);
    state.buffJump = Math.max(0, state.buffJump - dt);
    state.buffFly = Math.max(0, state.buffFly - dt);
    state.buffGun = Math.max(0, state.buffGun - dt);

    for (const pa of particles) {
      pa.x += pa.vx;
      pa.y += pa.vy;
      pa.vy += 0.12;
      pa.life -= dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }

    for (const ft of floatingTexts) {
      ft.t += dt;
      ft.y -= 42 * dt;
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      if (floatingTexts[i].t >= floatingTexts[i].life) floatingTexts.splice(i, 1);
    }
  }

  // --- draw
  function drawNebula() {
    const t = state.nebulaOffset;
    for (const b of parallaxBlobs) {
      const cx = b.x * BASE_W + Math.sin(t + b.s * 3) * 20;
      const cy = 70 + Math.cos(t * 0.5 + b.s) * 30;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 200 * b.s + 100);
      g.addColorStop(0, `hsla(${b.hue}, 70%, 30%, 0.35)`);
      g.addColorStop(0.4, `hsla(${b.hue + 40}, 50%, 20%, 0.1)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, BASE_W, BASE_H);
    }
    const gSky = ctx.createLinearGradient(0, 0, 0, BASE_H * 0.5);
    gSky.addColorStop(0, "#0c1028");
    gSky.addColorStop(1, "rgba(5,6,20,0)");
    ctx.fillStyle = gSky;
    ctx.fillRect(0, 0, BASE_W, BASE_H * 0.5);
  }

  function drawStars() {
    for (const s of stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s.tw * 0.4 + s.x * 0.01));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 230, 255, ${s.a * tw})`;
      ctx.fill();
    }
  }

  function drawComet() {
    const c = state.comet;
    if (!c.active) return;
    for (let i = 0; i < 9; i++) {
      const x = c.x - i * 5.5;
      const y = c.y - i * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 3.8 - i * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 255, 255, ${0.5 - i * 0.045})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#e0ffff";
    ctx.fill();
  }

  function drawParallaxHills() {
    const t = state.t * 0.012;
    for (let layer = 0; layer < 3; layer++) {
      const baseY = groundY() - 2 - layer * 18;
      const sp = 0.012 + layer * 0.002;
      const amp = 14 + layer * 10;
      const wave = 0.008 + layer * 0.004;
      ctx.beginPath();
      ctx.moveTo(0, BASE_H);
      for (let x = 0; x <= BASE_W; x += 4) {
        const y =
          baseY +
          Math.sin((x * wave + t * 40) * (1.2 + layer * 0.1)) * amp * 0.3 +
          Math.sin((x * 0.02 - t * sp * 200) + layer) * (amp * 0.2);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(BASE_W, BASE_H);
      ctx.lineTo(0, BASE_H);
      const hue = 175 + layer * 20;
      const lit = 14 - layer * 2.5;
      ctx.closePath();
      ctx.fillStyle = `hsla(${hue}, 42%, ${lit}%, ${0.4 + (1 - layer) * 0.1})`;
      ctx.fill();
    }
  }

  function drawGround() {
    const y = groundY();
    const g = ctx.createLinearGradient(0, y, 0, BASE_H);
    g.addColorStop(0, "#0e6b6b");
    g.addColorStop(0.22, "#083838");
    g.addColorStop(0.5, "#061a20");
    g.addColorStop(1, "#020508");
    ctx.fillStyle = g;
    ctx.fillRect(0, y, BASE_W, BASE_H - y);
    for (let i = 0; i < 28; i++) {
      const gx = (i * 40 + (state.t * 0.06) % 40) - 4;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx - 4, y + 10);
      ctx.lineTo(gx, y);
      ctx.fillStyle = `rgba(0, 255, 200, ${0.04 + (i % 2) * 0.04})`;
      ctx.fill();
    }
    const scan = ctx.createLinearGradient(0, y, 0, y + 18);
    scan.addColorStop(0, "rgba(0, 255, 200, 0.3)");
    scan.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = scan;
    ctx.fillRect(0, y, BASE_W, 4);
    ctx.fillStyle = "rgba(0, 255, 200, 0.2)";
    ctx.fillRect(0, y, BASE_W, 1.5);
  }

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawPlayer() {
    const p = state.player;
    const pulse = 1 + 0.07 * p.pulse;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    ctx.save();
    const bob = p.onGround ? Math.sin(p.pulse * 0.22) * 0.9 : 0;
    ctx.translate(cx, cy + bob);
    const tilt = p.onGround
      ? 0.04 * Math.sin(state.t * 0.01)
      : -0.12 * (p.vy * 0.04);
    ctx.rotate(tilt);
    ctx.scale(pulse, pulse);
    const rw = p.w * 0.5;
    const rh = p.h * 0.5;
    const g = ctx.createLinearGradient(-rw, -rh, rw, rh);
    g.addColorStop(0, "rgb(125, 255, 176)");
    g.addColorStop(0.45, "rgb(0, 220, 200)");
    g.addColorStop(1, "rgb(0, 150, 255)");
    ctx.shadowColor = "rgb(0, 255, 200)";
    ctx.shadowBlur = 12 + 10 * p.pulse;
    roundRectPath(ctx, -rw, -rh, p.w, p.h, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRectPath(ctx, -rw + 4, -rh + 5, p.w - 20, 11, 3);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fill();
    const eyeX = rw * 0.12;
    const eyeY = -rh * 0.08;
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY, 4, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#0a1020";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eyeX + 1.2, eyeY - 1, 1.1, 1.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    if (!p.onGround) {
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, 1.4, 0.35, 0, 0, Math.PI);
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    if (state.buffInvinc > 0) {
      roundRectPath(ctx, -rw - 3, -rh - 3, p.w + 6, p.h + 6, 9);
      ctx.shadowColor = "rgba(255, 220, 100, 0.9)";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = "rgba(255, 220, 120, 0.9)";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (state.buffJump > 0) {
      ctx.beginPath();
      ctx.moveTo(rw * 0.2, -rh * 0.4);
      ctx.lineTo(rw * 0.1, -rh * 0.6);
      ctx.lineTo(rw * 0.0, -rh * 0.4);
      ctx.fillStyle = "rgba(0, 255, 200, 0.55)";
      ctx.fill();
    }
    if (isFlying()) {
      ctx.beginPath();
      ctx.moveTo(-rw - 2, -rh * 0.2);
      ctx.lineTo(-rw - 14, -rh * 0.65);
      ctx.lineTo(-rw - 2, -rh * 0.5);
      ctx.closePath();
      ctx.fillStyle = "rgba(180, 230, 255, 0.75)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(rw + 2, -rh * 0.2);
      ctx.lineTo(rw + 14, -rh * 0.65);
      ctx.lineTo(rw + 2, -rh * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    const tx = p.w * 0.08;
    const ty = rh * 0.12;
    ctx.ellipse(-tx, ty, 2.6, 1.1, 0, 0, Math.PI);
    ctx.fillStyle = "rgba(255,80,100,0.35)";
    ctx.fill();
    ctx.restore();
    if (state.landBurst) {
      const k = 1 - state.landBurst.t / 0.14;
      ctx.beginPath();
      ctx.arc(
        state.landBurst.x,
        groundY() - 2,
        20 + 22 * (1 - k),
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = `rgba(0, 255, 200, ${k * 0.55})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  }

  function drawObstacles() {
    for (const ob of state.obstacles) {
      if (ob.isAir) continue;
      const g = ctx.createLinearGradient(ob.x, ob.y, ob.x + ob.w, ob.y + ob.h);
      g.addColorStop(0, `hsl(${20 + ob.hit * 32}, 92%, 60%)`);
      g.addColorStop(0.48, `hsl(${345 - ob.hit * 8}, 82%, 50%)`);
      g.addColorStop(1, `hsl(285, 58%, 34%)`);
      ctx.save();
      ctx.shadowColor = "#ff5090";
      ctx.shadowBlur = 16;
      roundRectPath(ctx, ob.x, ob.y, ob.w, ob.h, 5);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      for (let s = 0; s < 2; s++) {
        const sy = ob.y + 8 + s * 14;
        const sg = ctx.createLinearGradient(ob.x, sy, ob.x + ob.w, sy);
        sg.addColorStop(0, "rgba(0,0,0,0)");
        sg.addColorStop(0.5, "rgba(255,210,60,0.5)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        roundRectPath(ctx, ob.x + 4, sy, ob.w - 8, 6, 2);
        ctx.fillStyle = sg;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(ob.x, ob.y + 5);
      ctx.lineTo(ob.x + 7, ob.y);
      ctx.lineTo(ob.x + 14, ob.y + 5);
      ctx.fillStyle = "rgba(255,220,200,0.15)";
      ctx.fill();
      ctx.restore();
    }
    for (const ob of state.obstacles) {
      if (!ob.isAir) continue;
      const g2 = ctx.createLinearGradient(ob.x, ob.y, ob.x + ob.w, ob.y + ob.h);
      g2.addColorStop(0, `hsl(${195 + ob.hit * 20}, 85%, 55%)`);
      g2.addColorStop(0.5, `hsl(${255 - ob.hit * 15}, 70%, 44%)`);
      g2.addColorStop(1, `hsl(${300 + ob.hit * 10}, 50%, 28%)`);
      ctx.save();
      ctx.shadowColor = "#6ae0ff";
      ctx.shadowBlur = 14;
      roundRectPath(ctx, ob.x, ob.y, ob.w, ob.h, 4);
      ctx.fillStyle = g2;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(180, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      roundRectPath(ctx, ob.x + 2, ob.y + 2, ob.w - 4, ob.h - 4, 3);
      ctx.stroke();
      ctx.setLineDash([]);
      const sy = ob.y + ob.h * 0.35;
      const sg2 = ctx.createLinearGradient(ob.x, sy, ob.x + ob.w, sy);
      sg2.addColorStop(0, "rgba(0,0,0,0)");
      sg2.addColorStop(0.5, "rgba(120, 255, 255, 0.4)");
      sg2.addColorStop(1, "rgba(0,0,0,0)");
      roundRectPath(ctx, ob.x + 3, sy, ob.w - 6, 5, 1);
      ctx.fillStyle = sg2;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ob.x + 4, ob.y + 4);
      ctx.lineTo(ob.x + 9, ob.y);
      ctx.lineTo(ob.x + 14, ob.y + 4);
      ctx.fillStyle = "rgba(200, 255, 255, 0.2)";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPickups() {
    for (const pk of state.pickups) {
      const s = 0.6 + 0.4 * Math.sin(pk.t);
      const cx = pk.x + pk.w * 0.5;
      const cy = pk.y + pk.h * 0.5;
      const rw = (pk.w * 0.45) * s;
      const rh = (pk.h * 0.45) * s;
      ctx.save();
      if (pk.onGround) {
        const gy = groundY() - 0.5;
        ctx.beginPath();
        ctx.ellipse(
          cx,
          gy,
          Math.max(8, pk.w * 0.5),
          2.6,
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx, gy, Math.max(6, pk.w * 0.38), 1.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 80, 80, 0.15)";
        ctx.fill();
      }
      if (pk.type === "invinc") {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i * (Math.PI * 2) / 3) - Math.PI * 0.5;
          const x = cx + Math.cos(a) * rw;
          const y = cy + Math.sin(a) * rw;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rw * 1.2);
        g.addColorStop(0, "rgba(255, 240, 200, 0.95)");
        g.addColorStop(0.4, "rgba(255, 200, 60, 0.9)");
        g.addColorStop(1, "rgba(200, 120, 0, 0.8)");
        ctx.fillStyle = g;
        ctx.shadowColor = "rgba(255, 200, 0, 0.8)";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (pk.type === "jump") {
        const g2 = ctx.createLinearGradient(
          cx - rw,
          cy,
          cx + rw,
          cy
        );
        g2.addColorStop(0, "rgba(60, 255, 200, 0.95)");
        g2.addColorStop(0.5, "rgba(0, 200, 140, 0.95)");
        g2.addColorStop(1, "rgba(0, 150, 120, 0.9)");
        roundRectPath(
          ctx,
          cx - rw * 0.6,
          cy - rh * 0.4,
          rw * 1.2,
          rh * 0.8,
          3
        );
        ctx.fillStyle = g2;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy - rh);
        ctx.lineTo(cx, cy + rh * 0.2);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.stroke();
        ctx.beginPath();
        for (let i2 = 0; i2 < 3; i2++) {
          const yy = cy - rh * 0.1 + i2 * rh * 0.2;
          ctx.moveTo(cx - 4, yy);
          ctx.lineTo(cx, yy - 2);
          ctx.lineTo(cx + 4, yy);
        }
        ctx.stroke();
      } else if (pk.type === "fly") {
        const g3 = ctx.createLinearGradient(
          cx - rw,
          cy,
          cx + rw,
          cy
        );
        g3.addColorStop(0, "rgba(180, 230, 255, 0.95)");
        g3.addColorStop(0.5, "rgba(80, 200, 255, 0.9)");
        g3.addColorStop(1, "rgba(0, 140, 200, 0.85)");
        roundRectPath(
          ctx,
          cx - rw * 0.5,
          cy - rh * 0.3,
          rw * 1.0,
          rh * 0.5,
          2
        );
        ctx.fillStyle = g3;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - rw, cy);
        ctx.quadraticCurveTo(
          cx - rw * 1.4,
          cy - rh * 0.8,
          cx - rw * 0.4,
          cy - rh
        );
        ctx.moveTo(cx + rw, cy);
        ctx.quadraticCurveTo(
          cx + rw * 1.4,
          cy - rh * 0.8,
          cx + rw * 0.4,
          cy - rh
        );
        ctx.strokeStyle = "rgba(200, 240, 255, 0.6)";
        ctx.lineWidth = 1.1;
        ctx.stroke();
      } else {
        const g4 = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh);
        g4.addColorStop(0, "rgba(100, 90, 120, 0.95)");
        g4.addColorStop(0.4, "rgba(60, 50, 80, 0.95)");
        g4.addColorStop(1, "rgba(30, 25, 50, 0.9)");
        roundRectPath(
          ctx,
          cx - rw * 0.7,
          cy - rh * 0.4,
          rw * 1.4,
          rh * 0.7,
          2
        );
        ctx.fillStyle = g4;
        ctx.fill();
        ctx.beginPath();
        roundRectPath(
          ctx,
          cx - rw * 0.1,
          cy - rh * 0.1,
          rw * 0.5,
          rh * 0.2,
          1
        );
        ctx.fillStyle = "rgba(255, 200, 100, 0.75)";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + rw * 0.2, cy);
        ctx.lineTo(cx + rw * 0.9, cy);
        ctx.strokeStyle = "rgba(255, 240, 80, 0.9)";
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - rw * 0.2, cy, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 60, 80, 0.5)";
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of state.bullets) {
      const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
      g.addColorStop(0, "rgba(255, 255, 200, 0.95)");
      g.addColorStop(0.5, "rgba(255, 220, 40, 1)");
      g.addColorStop(1, "rgba(255, 120, 0, 0.9)");
      ctx.save();
      ctx.shadowColor = "rgba(255, 200, 60, 0.8)";
      ctx.shadowBlur = 6;
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 1.2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(
        b.x + b.w * 0.12,
        b.y + b.h * 0.5,
        1.2,
        0.8,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBuffHud() {
    if (state.mode !== "play") return;
    const items = [
      { v: state.buffInvinc, m: PICK.invinc.dur, label: "M", c: "220, 180, 60" },
      { v: state.buffJump, m: PICK.jump.dur, label: "J", c: "40, 220, 180" },
      { v: state.buffFly, m: PICK.fly.dur, label: "F", c: "80, 200, 255" },
      { v: state.buffGun, m: PICK.gun.dur, label: "G", c: "255, 160, 100" },
    ];
    let n = 0;
    for (const it of items) {
      if (it.v > 0) n += 1;
    }
    if (n === 0) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 7px Orbitron, system-ui, sans-serif";
    let y = 34;
    const wmax = 100;
    for (const it of items) {
      if (it.v <= 0) continue;
      const t = it.v;
      const ratio = Math.max(0, t / it.m);
      const x0 = (BASE_W - wmax) * 0.5;
      roundRectPath(ctx, x0, y, wmax, 10, 2);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fill();
      roundRectPath(
        ctx,
        x0 + 1,
        y + 1,
        (wmax - 2) * ratio,
        8,
        1
      );
      ctx.fillStyle = `rgba(${it.c}, 0.9)`;
      ctx.fill();
      const sec = t.toFixed(1);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(it.label + " " + sec + "s", x0 + wmax * 0.5, y + 5);
      y += 12;
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const pa of particles) {
      const k = Math.max(0, pa.life / pa.max);
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, pa.r * (0.4 + 0.6 * k), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${pa.hue}, 100%, 64%, ${0.25 + 0.75 * k})`;
      ctx.fill();
    }
  }

  function drawFloating() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const ft of floatingTexts) {
      const a = 1 - ft.t / ft.life;
      ctx.font = "700 12px Orbitron, system-ui, sans-serif";
      ctx.fillStyle = `rgba(0, 255, 200, ${a * 0.9})`;
      ctx.shadowColor = "rgba(0,255,200,0.75)";
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(
      BASE_W * 0.5,
      groundY() * 0.4,
      BASE_W * 0.1,
      BASE_W * 0.5,
      groundY() * 0.55,
      BASE_W * 0.85
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.65, "rgba(0,0,0,0.15)");
    g.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  function shakeOffset() {
    if (state.shake <= 0) return { x: 0, y: 0 };
    const s = state.shake * 0.12;
    const t = state.t * 0.2 + state.shakeSeed;
    return {
      x: Math.sin(t * 3.1) * s * 0.8 + Math.cos(t * 5) * s * 0.3,
      y: Math.cos(t * 2.7) * s * 0.7,
    };
  }

  function paint() {
    const o = shakeOffset();
    const scale = canvas.width / BASE_W;
    ctx.setTransform(scale, 0, 0, scale, o.x, o.y);
    const pad = state.shake > 0.5 ? 4 : 0;
    ctx.clearRect(-pad, -pad, BASE_W + pad * 2, BASE_H + pad * 2);
    drawNebula();
    drawStars();
    if (state.mode === "title") drawComet();
    drawParallaxHills();
    drawGround();
    drawObstacles();
    drawPickups();
    drawPlayer();
    drawBullets();
    drawParticles();
    drawFloating();
    if (state.mode === "play") {
      drawBuffHud();
    }
    drawVignette();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.055, (now - last) / 1000);
    last = now;
    update(dt);
    paint();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  resetPlayer();
})();
