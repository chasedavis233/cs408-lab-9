// set up canvas

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

const width = (canvas.width = window.innerWidth);
const height = (canvas.height = window.innerHeight);

// function to generate random number

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// function to generate random RGB color value

function randomRGB() {
  return `rgb(${random(0, 255)},${random(0, 255)},${random(0, 255)})`;
}


const SND_PATH = "sounds/"; 
const BOUNCE_URL = SND_PATH + "bounce.mp3";
const EAT_URL    = SND_PATH + "pop.mp3";
const BGM_URL    = SND_PATH + "bgm.mp3";

// Background music
const bgm = new Audio(BGM_URL);
bgm.preload = "auto";
bgm.load();
bgm.loop = true;
bgm.volume = 0.08;


let audioUnlocked = false;
let audioCtx = null;
let bounceBuf = null;
let eatBuf = null;

const bounceTag = new Audio(BOUNCE_URL);
const eatTag    = new Audio(EAT_URL);
[bounceTag, eatTag].forEach(a => { a.preload = "auto"; a.load(); });

let prefetchBounceAB = null;
let prefetchEatAB = null;
fetch(BOUNCE_URL).then(r => r.ok ? r.arrayBuffer() : null).then(ab => prefetchBounceAB = ab).catch(()=>{});
fetch(EAT_URL).then(r => r.ok ? r.arrayBuffer() : null).then(ab => prefetchEatAB = ab).catch(()=>{});

function tinyClick() {
  try {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 120;
    g.gain.value = 0.25;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.03);
  } catch {}
}

// helpers
function playViaTag(base, vol = 1, rate = 1) {
  const a = base.cloneNode(true);
  a.volume = vol;
  a.playbackRate = rate;
  a.play().catch(() => {});
}

function playBuffer(buf, vol = 1, rate = 1) {
  if (!audioCtx || !buf) return false;
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = audioCtx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(audioCtx.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}

function playBounce() {
  const rate = 1.08 + (Math.random() * 0.10 - 0.05);
  if (playBuffer(bounceBuf, 0.28, rate)) return;
  if (bounceTag.src) { playViaTag(bounceTag, 0.28, rate); return; }
  tinyClick();
}

function playEat() {
  const rate = 1.00 + (Math.random() * 0.12 - 0.06);
  if (playBuffer(eatBuf, 0.40, rate)) return;
  if (eatTag.src) { playViaTag(eatTag, 0.40, rate); return; }
  tinyClick();
}

async function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  console.log("[audio] unlocking…");

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Decode from prefetched bytes if available; else fetch now.
    if (prefetchBounceAB) {
      bounceBuf = await audioCtx.decodeAudioData(prefetchBounceAB.slice(0));
    } else {
      const rb = await fetch(BOUNCE_URL);
      if (rb.ok) bounceBuf = await audioCtx.decodeAudioData(await rb.arrayBuffer());
      else console.error(`[audio] 404 or blocked: ${BOUNCE_URL}`);
    }

    if (prefetchEatAB) {
      eatBuf = await audioCtx.decodeAudioData(prefetchEatAB.slice(0));
    } else {
      const re = await fetch(EAT_URL);
      if (re.ok) eatBuf = await audioCtx.decodeAudioData(await re.arrayBuffer());
      else console.error(`[audio] 404 or blocked: ${EAT_URL}`);
    }
  } catch (e) {
    console.warn("[audio] WebAudio decode failed — will use <audio> fallback:", e);
    bounceBuf = null;
    eatBuf = null;
  }

  // start bgm after user gesture
  bgm.play().catch((err) => console.warn("[audio] bgm play blocked:", err));
}

window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

// Base shape
class Shape 
{
  constructor(x, y, velX, velY) 
  {
    this.x = x;
    this.y = y;
    this.velX = velX;
    this.velY = velY;
  }
}

class Ball extends Shape{
  constructor(x, y, velX, velY, size, color) {
    super(x, y, velX, velY);
    this.color = color;
    this.size = size;
    this.exists = true;
  }

  draw() {
    if (!this.exists) return;
    ctx.beginPath();
    // glow needs to be set before fill to take effect
    ctx.shadowColor = this.color; 
    ctx.shadowBlur = 18;
    ctx.fillStyle = this.color;
    ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
    ctx.fill();
  }

  update() {
    if (this.x + this.size >= width) {
      this.velX = -Math.abs(this.velX);
      // speed up on bounce
      this.velX *= 1.08;
      this.velY *= 1.02;
      playBounce();
    }

    if (this.x - this.size <= 0) {
      this.velX = Math.abs(this.velX);
      this.velX *= 1.08;
      this.velY *= 1.02;
      playBounce();
    }

    if (this.y + this.size >= height) {
      this.velY = -Math.abs(this.velY);
      this.velY *= 1.08;
      this.velX *= 1.02;
      playBounce();
    }

    if (this.y - this.size <= 0) {
      this.velY = Math.abs(this.velY);
      this.velY *= 1.08;
      this.velX *= 1.02;
      playBounce();
    }

    this.velX *= 0.995; 
    this.velY *= 0.995;

    // ensure balls actually move across the canvas
    this.x += this.velX;
    this.y += this.velY;

    // stronger minimum speed floor
    const MIN_SPEED = 3.5;
    if (Math.abs(this.velX) < MIN_SPEED) this.velX = this.velX < 0 ? -MIN_SPEED : MIN_SPEED;
    if (Math.abs(this.velY) < MIN_SPEED) this.velY = this.velY < 0 ? -MIN_SPEED : MIN_SPEED;

    // soft cap to avoid runaway speeds
    const MAX_SPEED = 24;
    if (Math.abs(this.velX) > MAX_SPEED) this.velX = this.velX < 0 ? -MAX_SPEED : MAX_SPEED;
    if (Math.abs(this.velY) > MAX_SPEED) this.velY = this.velY < 0 ? -MAX_SPEED : MAX_SPEED;
  }

  collisionDetect() {
    if (!this.exists) return;
    for (const ball of balls) {
      if (!ball.exists || ball === this) continue;
      const dx = this.x - ball.x;
      const dy = this.y - ball.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < this.size + ball.size) {
        // speed up slightly on ball-ball collisions
        this.velX *= 1.05; this.velY *= 1.05;
        ball.velX *= 1.05;  ball.velY *= 1.05;
        ball.color = this.color = randomRGB();
      }
    }
  }
}

const balls = [];

while (balls.length < 25) {
  const size = random(10, 20);
  const ball = new Ball(
    // ball position always drawn at least one ball width
    // away from the edge of the canvas, to avoid drawing errors
    random(0 + size, width - size),
    random(0 + size, height - size),
    random(-7, 7) || 1,
    random(-7, 7) || -1,
    size,
    randomRGB()
    
  );

  balls.push(ball);
}


class EvilCircle extends Shape {
  constructor(x, y) {
    super(x, y, 20, 20); // speed 20
    this.color = "white";
    this.size = 18;

    window.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "a": this.x -= this.velX; break;
        case "d": this.x += this.velX; break;
        case "w": this.y -= this.velY; break;
        case "s": this.y += this.velY; break;
        case "ArrowLeft": this.x -= this.velX; break;
        case "ArrowRight": this.x += this.velX; break;
        case "ArrowUp": this.y -= this.velY; break;
        case "ArrowDown": this.y += this.velY; break;
      }
    });
  }

  draw() {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 6]);
    ctx.translate(this.x, this.y);
    ctx.rotate(performance.now()/400);  // spin
    ctx.beginPath();
    ctx.strokeStyle = this.color;
    ctx.arc(0, 0, this.size, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  checkBounds() {
    if (this.x + this.size > width) this.x = width - this.size;
    if (this.x - this.size < 0) this.x = this.size;
    if (this.y + this.size > height) this.y = height - this.size;
    if (this.y - this.size < 0) this.y = this.size;
  }

  collisionDetect(balls, onEat) {
    for (const ball of balls) {
      if (!ball.exists) continue;
      const dx = this.x - ball.x;
      const dy = this.y - ball.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < this.size + ball.size) {
        ball.exists = false;

        // change all remaining balls' colors when one is eaten
        for (const b of balls) {
          if (b.exists) b.color = randomRGB();
        }

        // eat sound
        playEat();

        if (onEat) onEat();
      }
    }
  }
}



const counterEl = document.getElementById("ballCount");
let aliveCount = balls.length;
let eatenCount = 0;
counterEl.innerHTML = `Balls left: ${aliveCount}<br>Eaten: ${eatenCount}<br>[P] Pause • [R] Restart`;

const evil = new EvilCircle(width / 2, height / 2);

// background color that changes on each eat
let bgColor = { r: 15, g: 15, b: 18 }; // initial dark tone

// helpers to derive gradient from an rgb() string
function colorFromRGB(rgb) {
  // expects 'rgb(r,g,b)'
  const m = rgb.match(/\d+/g);
  if (!m) return { r: 15, g: 15, b: 18 };
  return { r: +m[0], g: +m[1], b: +m[2] };
}
function darker(c, f) {
  return { r: Math.max(0, Math.floor(c.r * f)), g: Math.max(0, Math.floor(c.g * f)), b: Math.max(0, Math.floor(c.b * f)) };
}
function rgbStr(c, a=1) {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

// particles on eat
const particles = [];
function addBurst(x, y, color) {
  const src = typeof color === "string" ? colorFromRGB(color) : color;
  for (let i = 0; i < 12; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      life: 22,
      color: src
    });
  }
}
function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life--;
    const a = Math.max(p.life / 22, 0);
    ctx.globalAlpha = a;
    ctx.fillStyle = rgbStr(p.color);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
    if (p.life <= 0) particles.splice(i, 1);
  }
  ctx.globalAlpha = 1;
}

// pause / restart / timer
let paused = false;
let gameOver = false;
let startTime = performance.now();
let finishTime = null;

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "p") {
    paused = !paused;
  }
  if (e.key.toLowerCase() === "r") {
    // restart: reset all state
    while (balls.length) balls.pop();
    while (particles.length) particles.pop();
    while (balls.length < 25) {
      const size = random(10, 20);
      const ball = new Ball(
        random(0 + size, width - size),
        random(0 + size, height - size),
        random(-7, 7) || 1,
        random(-7, 7) || -1,
        size,
        randomRGB()
      );
      balls.push(ball);
    }
    aliveCount = balls.length;
    eatenCount = 0;
    counterEl.innerHTML = `Balls left: ${aliveCount}<br>Eaten: ${eatenCount}<br>[P] Pause • [R] Restart`;
    evil.x = width / 2;
    evil.y = height / 2;
    paused = false;
    gameOver = false;
    startTime = performance.now();
    finishTime = null;
    bgColor = { r: 15, g: 15, b: 18 };
  }
});

function gameLoop() {
  // gradient trail background based on current bgColor
  const c1 = darker(bgColor, 0.35);
  const c2 = darker(bgColor, 0.9);
  const g = ctx.createLinearGradient(0,0,width,height);
  g.addColorStop(0, rgbStr(c1));
  g.addColorStop(1, rgbStr(c2));
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  if (!paused && !gameOver) {
    drawParticles();

    for (const ball of balls) {
      if (!ball.exists) continue;
      ball.draw();
      ball.update();
      ball.collisionDetect();
    }

    evil.draw();
    evil.checkBounds();
    evil.collisionDetect(balls, () => {
      // when a ball is eaten:
      aliveCount--;
      eatenCount++;
      counterEl.innerHTML = `Balls left: ${aliveCount}<br>Eaten: ${eatenCount}<br>[P] Pause • [R] Restart`;

      // update background tint based on a remaining ball (if any)
      for (const b of balls) { if (b.exists) { bgColor = colorFromRGB(b.color); break; } }

      // small burst at the circle
      addBurst(evil.x, evil.y, `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`);

      if (aliveCount === 0) {
        gameOver = true;
        finishTime = performance.now();
      }
    });
  } else {
    // draw frozen frame + overlay when paused
    drawParticles();
    for (const ball of balls) { if (ball.exists) ball.draw(); }
    evil.draw();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.font = "28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(paused ? "Paused — press P to resume" : "Stopped", 24, 48);
    ctx.fillText("Press R to restart", 24, 84);
  }

  // win banner
  if (gameOver) {
    const secs = ((finishTime - startTime) / 1000).toFixed(1);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, width, 120);
    ctx.fillStyle = "#fff";
    ctx.font = "32px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(`You Win — ${secs}s`, 24, 48);
    ctx.font = "20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Press R to play again", 24, 84);
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();
