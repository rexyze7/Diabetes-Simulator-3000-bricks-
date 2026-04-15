const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
canvas.setAttribute("tabindex", "0");

const { width: WIDTH, height: HEIGHT } = canvas;

// HUD
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const bestScoreEl = document.getElementById("bestScore");

// -----------------------------
// Asset loading
// -----------------------------
const loadImage = (src) => Object.assign(new Image(), { src });

const assets = {
  blocks: ["red", "blue", "green", "yellow"].reduce((a, c) => {
    a[c] = loadImage(`Blocks/${c}_block.png`);
    return a;
  }, {}),
  special: ["purple", "chocolate", "bomb"].reduce((a, c) => {
    a[c] = loadImage(`Special_Blocks/${c}_block.png`);
    return a;
  }, {}),
  paddle: loadImage("Paddles/paddle.png"),
  ball: loadImage("Balls/candy_ball.png")
};

// -----------------------------
// Game state
// -----------------------------
let x = WIDTH / 2,
  y = HEIGHT - 80,
  dx = 0,
  dy = -4,
  ballRadius = 12;

let paddlex = WIDTH / 2 - 60,
  paddlew = 120,
  paddleh = 22,
  paddleSpeed = 10;

let rightDown = false,
  leftDown = false;

let score = 0,
  lives = 3,
  level = 1,
  maxLevel = 3,
  bestScore = Number(localStorage.getItem("theBricksBestScore")) || 0;

let sekunde = 0,
  timerInterval = null;

let gameStarted = false,
  gameOver = false,
  paused = false,
  gameWon = false;

// -----------------------------
// Brick settings
// -----------------------------
const NCOLS = 8;
const BRICKWIDTH = 90;
const BRICKHEIGHT = 30;
const PADDING = 8;
const TOP_OFFSET = 50;
const LEFT_OFFSET = 16;

let bricks = [];

// -----------------------------
// Right-side level selector
// -----------------------------
function createLevelSelector() {
  const panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "fixed",
    right: "20px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "14px",
    background: "rgba(255,255,255,0.85)",
    borderRadius: "16px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
    zIndex: "1000"
  });
  panel.id = "level-selector";

  const title = document.createElement("div");
  title.textContent = "Levels";
  Object.assign(title.style, {
    fontWeight: "bold",
    color: "#6c3483",
    textAlign: "center"
  });
  panel.appendChild(title);

  for (let i = 1; i <= maxLevel; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `Level ${i}`;
    btn.dataset.level = i;
    Object.assign(btn.style, {
      padding: "10px 14px",
      border: "none",
      borderRadius: "10px",
      cursor: "pointer",
      fontWeight: "bold",
      background: "#f7d6ff",
      color: "#6c3483"
    });

    btn.addEventListener("click", () => {
      jumpToLevel(i);
      btn.blur();
      canvas.focus();
    });

    panel.appendChild(btn);
  }

  document.body.appendChild(panel);
}

function refreshLevelSelector() {
  document.querySelectorAll("#level-selector button").forEach((btn) => {
    const active = Number(btn.dataset.level) === level;
    btn.style.background = active ? "#c77dff" : "#f7d6ff";
    btn.style.color = active ? "#ffffff" : "#6c3483";
  });
}

function jumpToLevel(targetLevel) {
  level = targetLevel;
  gameStarted = gameOver = paused = gameWon = false;
  createBrickLayout();
  resetBallAndPaddle();
  updateHud();
  refreshLevelSelector();
  document.activeElement?.blur();
}

// -----------------------------
// Level settings
// -----------------------------
const getRowsForLevel = () => [0, 2, 4, 5][level] || 5;
const getBallSpeedForLevel = () => [0, 6, 8, 11][level] || 9;

// -----------------------------
// Brick generation
// -----------------------------
function createBrickLayout() {
  bricks = [];
  const rows = getRowsForLevel();
  const limits = {
    purple: level,
    chocolate: Math.max(1, level - 1),
    bomb: Math.min(level, 2)
  };
  const counts = { purple: 0, chocolate: 0, bomb: 0 };

  const normalBrickStages = [
    { hp: 4, colorStage: "red" },
    { hp: 3, colorStage: "blue" },
    { hp: 2, colorStage: "green" },
    { hp: 1, colorStage: "yellow" }
  ];

  for (let row = 0; row < rows; row++) {
    bricks[row] = [];

    for (let col = 0; col < NCOLS; col++) {
      let type = "normal",
        hp = 4,
        colorStage = "red";
      const r = Math.random();

      if (r < 0.05 && counts.purple < limits.purple) {
        type = "purple";
        hp = 1;
        colorStage = null;
        counts.purple++;
      } else if (r < 0.09 && counts.chocolate < limits.chocolate) {
        type = "chocolate";
        hp = 2;
        colorStage = null;
        counts.chocolate++;
      } else if (r < 0.12 && counts.bomb < limits.bomb) {
        type = "bomb";
        hp = 1;
        colorStage = null;
        counts.bomb++;
      } else {
        const allowed =
          row === 0 ? normalBrickStages.slice(0, 3) : normalBrickStages;
        ({ hp, colorStage } =
          allowed[Math.floor(Math.random() * allowed.length)]);
      }

      bricks[row][col] = {
        x: LEFT_OFFSET + col * (BRICKWIDTH + PADDING),
        y: TOP_OFFSET + row * (BRICKHEIGHT + PADDING),
        width: BRICKWIDTH,
        height: BRICKHEIGHT,
        visible: true,
        type,
        hp,
        colorStage
      };
    }
  }
}

// -----------------------------
// Timer
// -----------------------------
function startTimer() {
  if (timerInterval) return;

  timerInterval = setInterval(() => {
    if (!gameStarted || gameOver || paused || gameWon) return;
    sekunde++;
    timeEl.textContent = `${String(Math.floor(sekunde / 60)).padStart(
      2,
      "0"
    )}:${String(sekunde % 60).padStart(2, "0")}`;
  }, 1000);
}

function resetTimer() {
  sekunde = 0;
  timeEl.textContent = "00:00";
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

// -----------------------------
// Input
// -----------------------------
document.addEventListener("keydown", (evt) => {
  const k = evt.key,
    c = evt.code;

  if (["ArrowRight", "d", "D"].includes(k)) rightDown = true;
  else if (["ArrowLeft", "a", "A"].includes(k)) leftDown = true;
  else if (c === "Space") {
    if (!gameStarted && !gameOver && !gameWon) {
      gameStarted = true;
      paused = false;
      startTimer();
    } else if (gameOver || gameWon) resetGame();
  } else if (["p", "P"].includes(k) && gameStarted && !gameOver && !gameWon) {
    paused = !paused;
  }
});

document.addEventListener("keyup", (evt) => {
  const k = evt.key;
  if (["ArrowRight", "d", "D"].includes(k)) rightDown = false;
  else if (["ArrowLeft", "a", "A"].includes(k)) leftDown = false;
});

// -----------------------------
// HUD / reset
// -----------------------------
function updateBestScore() {
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem("theBricksBestScore", bestScore);
  }
  bestScoreEl.textContent = bestScore;
}

function updateHud() {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
  bestScoreEl.textContent = bestScore;
}

function resetBallAndPaddle() {
  x = WIDTH / 2;
  y = HEIGHT - 80;
  const speed = getBallSpeedForLevel();
  dx = speed;
  dy = -speed;
  paddlex = WIDTH / 2 - paddlew / 2;
}

function resetGame() {
  score = 0;
  lives = 3;
  level = 1;
  gameStarted = gameOver = paused = gameWon = false;
  resetTimer();
  createBrickLayout();
  resetBallAndPaddle();
  updateBestScore();
  updateHud();
  refreshLevelSelector();
}

function goToNextLevel() {
  if (level < maxLevel) {
    level++;
    gameStarted = paused = false;
    createBrickLayout();
    resetBallAndPaddle();
    updateHud();
    refreshLevelSelector();
  } else {
    gameWon = true;
    gameStarted = false;
    updateBestScore();
  }
}

// -----------------------------
// Drawing
// -----------------------------
const clear = () => ctx.clearRect(0, 0, WIDTH, HEIGHT);

function drawBall() {
  if (assets.ball.complete) {
    ctx.drawImage(
      assets.ball,
      x - ballRadius,
      y - ballRadius,
      ballRadius * 2,
      ballRadius * 2
    );
  } else {
    ctx.beginPath();
    ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#ff66b2";
    ctx.fill();
    ctx.closePath();
  }
}

function drawPaddle() {
  const paddleY = HEIGHT - paddleh - 10;
  if (assets.paddle.complete) {
    ctx.drawImage(assets.paddle, paddlex, paddleY, paddlew, paddleh);
  } else {
    ctx.fillStyle = "#8e44ad";
    ctx.fillRect(paddlex, paddleY, paddlew, paddleh);
  }
}

function getBrickImage(brick) {
  return brick.type === "normal"
    ? assets.blocks[brick.colorStage]
    : assets.special[brick.type];
}

function drawBricks() {
  for (const row of bricks) {
    for (const brick of row) {
      if (!brick.visible) continue;
      const img = getBrickImage(brick);

      if (img?.complete) {
        ctx.drawImage(img, brick.x, brick.y, brick.width, brick.height);
      } else {
        ctx.fillStyle = "#ff99cc";
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      }

      if (brick.type === "chocolate" && brick.hp === 1) {
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      }
    }
  }
}

function drawMessage(text, subtext) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(130, 210, 540, 150);

  ctx.fillStyle = "#6c3483";
  ctx.textAlign = "center";

  ctx.font = "bold 34px Arial";
  ctx.fillText(text, WIDTH / 2, 270);

  ctx.font = "20px Arial";
  ctx.fillText(subtext, WIDTH / 2, 315);
  ctx.restore();
}

// -----------------------------
// Game logic
// -----------------------------
function movePaddle() {
  if (rightDown) paddlex = Math.min(WIDTH - paddlew, paddlex + paddleSpeed);
  else if (leftDown) paddlex = Math.max(0, paddlex - paddleSpeed);
}

function wallCollision() {
  if (x + dx > WIDTH - ballRadius || x + dx < ballRadius) dx = -dx;
  if (y + dy < ballRadius) dy = -dy;
}

function paddleCollision() {
  const paddleTop = HEIGHT - paddleh - 10;
  const paddleBottom = paddleTop + paddleh;

  if (
    y + ballRadius + dy >= paddleTop &&
    y + dy <= paddleBottom &&
    x >= paddlex &&
    x <= paddlex + paddlew
  ) {
    dx = 10 * ((x - (paddlex + paddlew / 2)) / paddlew);
    if (Math.abs(dx) < 0.5) dx = dx < 0 ? -0.5 : 0.5;
    dy = -Math.abs(dy);
  }
}

function loseLifeCheck() {
  if (y + dy <= HEIGHT - ballRadius) return;

  lives--;
  updateHud();

  if (lives <= 0) {
    gameOver = true;
    gameStarted = false;
    updateBestScore();
  } else {
    gameStarted = paused = false;
    resetBallAndPaddle();
  }
}

function updateNormalBrickColor(brick) {
  brick.colorStage = { 3: "blue", 2: "green", 1: "yellow" }[brick.hp];
}

function damageBrick(brick) {
  if (!brick.visible) return;

  brick.hp--;
  if (brick.type === "normal" && brick.hp > 0) updateNormalBrickColor(brick);

  if (brick.hp <= 0) {
    brick.visible = false;
    score += { purple: 10, chocolate: 5, bomb: 7, normal: 1 }[brick.type];
  }
}

function explodeBomb(centerRow, centerCol) {
  for (let row = centerRow - 1; row <= centerRow + 1; row++) {
    for (let col = centerCol - 1; col <= centerCol + 1; col++) {
      if (
        row < 0 ||
        row >= bricks.length ||
        col < 0 ||
        col >= bricks[row].length ||
        (row === centerRow && col === centerCol)
      ) {
        continue;
      }

      const targetBrick = bricks[row][col];
      if (targetBrick.visible) damageBrick(targetBrick);
    }
  }
}

function brickCollision() {
  for (let row = 0; row < bricks.length; row++) {
    for (let col = 0; col < bricks[row].length; col++) {
      const brick = bricks[row][col];
      if (!brick.visible) continue;

      const hit =
        x + ballRadius > brick.x &&
        x - ballRadius < brick.x + brick.width &&
        y + ballRadius > brick.y &&
        y - ballRadius < brick.y + brick.height;

      if (!hit) continue;

      dy = -dy;
      const hitWasBomb = brick.type === "bomb";
      damageBrick(brick);
      if (hitWasBomb && !brick.visible) explodeBomb(row, col);

      updateBestScore();
      updateHud();
      checkLevelComplete();
      return;
    }
  }
}

function checkLevelComplete() {
  if (bricks.every((row) => row.every((brick) => !brick.visible))) {
    goToNextLevel();
  }
}

// -----------------------------
// Main loop
// -----------------------------
function draw() {
  clear();
  movePaddle();
  drawBricks();
  drawPaddle();
  drawBall();

  if (!gameStarted && !gameOver && !paused && !gameWon) {
    drawMessage(
      level === 1 && score === 0 && sekunde === 0 ? "The Bricks" : `Level ${level}`,
      level === 1 && score === 0 && sekunde === 0
        ? "Press Space to start"
        : "Press Space to continue"
    );
  }

  if (paused) drawMessage("Paused", "Press P to continue");

  if (gameStarted && !gameOver && !paused && !gameWon) {
    wallCollision();
    paddleCollision();
    brickCollision();
    loseLifeCheck();
    x += dx;
    y += dy;
  }

  if (gameOver) drawMessage("Game Over", "Press Space to restart");
  if (gameWon) drawMessage("You Win!", "You finished all 3 levels");

  requestAnimationFrame(draw);
}

// -----------------------------
// Init
// -----------------------------
function init() {
  createBrickLayout();
  createLevelSelector();
  updateHud();
  refreshLevelSelector();
  timeEl.textContent = "00:00";
  requestAnimationFrame(draw);
}

init();
