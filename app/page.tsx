"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GameStatus = "ready" | "running" | "over";

type Obstacle = {
  x: number;
  width: number;
  height: number;
  passed: boolean;
};

const WORLD_WIDTH = 360;
const WORLD_HEIGHT = 640;
const GROUND_HEIGHT = 72;
const PLAYER_SIZE = 42;
const GRAVITY = 1100;
const JUMP_VELOCITY = -420;

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
};

const Game = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameApiRef = useRef({
    start: () => {},
    jump: () => {},
    reset: () => {}
  });
  const statusRef = useRef<GameStatus>("ready");
  const scoreRef = useRef(0);
  const bestRef = useRef(0);

  const [status, setStatus] = useState<GameStatus>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = Number.parseInt(window.localStorage.getItem("sky-sprint-best") ?? "0", 10);
    if (!Number.isNaN(saved) && saved > 0) {
      bestRef.current = saved;
      setBest(saved);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationId: number | null = null;
    let lastTime = performance.now();
    let obstacles: Obstacle[] = [];
    let spawnTimer = 1;
    let speed = 190;
    let starDrift = 0;

    const groundY = WORLD_HEIGHT - GROUND_HEIGHT;
    const player = {
      x: 74,
      y: groundY - PLAYER_SIZE,
      vy: 0,
      onGround: true
    };

    const stars = Array.from({ length: 28 }, () => ({
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * (WORLD_HEIGHT - 200),
      radius: 1 + Math.random() * 1.4,
      glow: 0.4 + Math.random() * 0.6
    }));

    const setStatusSafe = (next: GameStatus) => {
      statusRef.current = next;
      setStatus(next);
    };

    const setScoreSafe = (value: number) => {
      scoreRef.current = value;
      setScore(value);
    };

    const updateBest = (value: number) => {
      if (value <= bestRef.current) return;
      bestRef.current = value;
      setBest(value);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("sky-sprint-best", `${value}`);
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const clampedWidth = Math.min(window.innerWidth - 32, 420);
      const cssWidth = Math.max(260, Math.min(WORLD_WIDTH, clampedWidth));
      canvas.width = Math.floor(WORLD_WIDTH * dpr);
      canvas.height = Math.floor(WORLD_HEIGHT * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = "auto";
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = true;
    };

    const drawBackground = () => {
      const sky = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
      sky.addColorStop(0, "#020817");
      sky.addColorStop(0.5, "#0b1f3a");
      sky.addColorStop(1, "#020617");
      context.fillStyle = sky;
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      starDrift = (starDrift + 0.6) % WORLD_WIDTH;
      context.fillStyle = "#38bdf8";
      stars.forEach((star) => {
        const x = (star.x + starDrift) % WORLD_WIDTH;
        context.globalAlpha = 0.6 + Math.sin((starDrift + star.x) * 0.02) * star.glow * 0.2;
        context.beginPath();
        context.arc(x, star.y, star.radius, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;

      const horizon = context.createLinearGradient(0, groundY - 120, 0, groundY + 20);
      horizon.addColorStop(0, "rgba(56, 189, 248, 0.2)");
      horizon.addColorStop(1, "rgba(2, 6, 23, 0)");
      context.fillStyle = horizon;
      context.fillRect(0, groundY - 120, WORLD_WIDTH, 140);

      context.fillStyle = "#082f49";
      for (let i = 0; i < 3; i += 1) {
        context.globalAlpha = 0.12 + i * 0.04;
        context.beginPath();
        context.arc(WORLD_WIDTH * (i / 2), groundY + 60, 200 + i * 140, Math.PI, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;

      context.fillStyle = "#0f172a";
      context.fillRect(0, groundY, WORLD_WIDTH, GROUND_HEIGHT);

      context.save();
      context.fillStyle = "#0ea5e9";
      context.globalAlpha = 0.18;
      for (let i = 0; i < WORLD_WIDTH; i += 32) {
        context.fillRect(i, groundY, 16, GROUND_HEIGHT);
      }
      context.restore();
    };

    const drawPlayer = () => {
      context.save();
      context.translate(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);
      const tilt = Math.min(Math.max(-10, player.vy * 0.05), 10);
      context.rotate((tilt * Math.PI) / 180);
      const gradient = context.createLinearGradient(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE / 2, PLAYER_SIZE / 2);
      gradient.addColorStop(0, "#38bdf8");
      gradient.addColorStop(1, "#0ea5e9");
      context.fillStyle = gradient;
      roundedRect(context, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 12);
      context.fill();
      context.fillStyle = "rgba(15, 182, 255, 0.8)";
      roundedRect(
        context,
        -PLAYER_SIZE / 2 + 8,
        -PLAYER_SIZE / 2 + 6,
        PLAYER_SIZE - 16,
        PLAYER_SIZE - 18,
        10
      );
      context.fill();
      context.restore();

      context.save();
      context.globalAlpha = 0.25;
      context.fillStyle = "#0284c7";
      context.beginPath();
      context.ellipse(player.x + PLAYER_SIZE / 2, groundY + 8, PLAYER_SIZE / 2.5, 12, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const drawObstacles = () => {
      context.fillStyle = "#1d4ed8";
      obstacles.forEach((obstacle) => {
        const gradient = context.createLinearGradient(obstacle.x, 0, obstacle.x + obstacle.width, 0);
        gradient.addColorStop(0, "#1e293b");
        gradient.addColorStop(1, "#1d4ed8");
        context.fillStyle = gradient;
        roundedRect(
          context,
          obstacle.x,
          groundY - obstacle.height,
          obstacle.width,
          obstacle.height,
          Math.min(16, obstacle.height / 2)
        );
        context.fill();
      });
    };

    const render = () => {
      context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawBackground();
      drawObstacles();
      drawPlayer();
    };

    const endGame = () => {
      if (statusRef.current !== "running") return;
      setStatusSafe("over");
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      updateBest(scoreRef.current);
      render();
    };

    const updateGame = (delta: number) => {
      player.vy += GRAVITY * delta;
      player.y += player.vy * delta;

      if (player.y >= groundY - PLAYER_SIZE) {
        player.y = groundY - PLAYER_SIZE;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.onGround = false;
      }

      spawnTimer -= delta;
      if (spawnTimer <= 0) {
        const width = 44 + Math.random() * 32;
        const height = 60 + Math.random() * 90;
        obstacles.push({
          x: WORLD_WIDTH + width,
          width,
          height,
          passed: false
        });
        const difficultyBoost = Math.min(1.2 + scoreRef.current * 0.015, 1.7);
        spawnTimer = 0.8 / difficultyBoost + Math.random() * 0.4;
        speed = Math.min(360, speed + 3);
      }

      obstacles.forEach((obstacle) => {
        obstacle.x -= speed * delta;
        if (!obstacle.passed && obstacle.x + obstacle.width < player.x) {
          obstacle.passed = true;
          const newScore = scoreRef.current + 1;
          setScoreSafe(newScore);
          updateBest(newScore);
        }
      });

      obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -20);

      const hit = obstacles.some((obstacle) => {
        const withinX = player.x + PLAYER_SIZE - 6 > obstacle.x && player.x + 6 < obstacle.x + obstacle.width;
        const withinY = player.y + PLAYER_SIZE > groundY - obstacle.height;
        return withinX && withinY;
      });

      if (hit) {
        endGame();
      }
    };

    const loop = (time: number) => {
      const delta = Math.min(0.035, (time - lastTime) / 1000);
      lastTime = time;
      if (statusRef.current === "running") {
        updateGame(delta);
        render();
        animationId = requestAnimationFrame(loop);
      }
    };

    const prepareGame = () => {
      obstacles = [];
      spawnTimer = 1;
      speed = 190;
      starDrift = Math.random() * WORLD_WIDTH;
      player.x = 74;
      player.y = groundY - PLAYER_SIZE;
      player.vy = 0;
      player.onGround = true;
      setScoreSafe(0);
      setStatusSafe("ready");
      render();
    };

    const startGame = () => {
      if (statusRef.current === "running") return;
      lastTime = performance.now();
      setStatusSafe("running");
      render();
      animationId = requestAnimationFrame(loop);
    };

    const jump = () => {
      if (statusRef.current !== "running") return;
      if (!player.onGround) return;
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      if (statusRef.current === "ready") {
        startGame();
        requestAnimationFrame(() => jump());
        return;
      }
      if (statusRef.current === "over") {
        prepareGame();
        startGame();
        return;
      }
      jump();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      handlePointerDown(new PointerEvent("pointerdown"));
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    prepareGame();

    gameApiRef.current = {
      start: startGame,
      jump,
      reset: prepareGame
    };

    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handlePrimaryAction = useCallback(() => {
    if (statusRef.current === "ready") {
      gameApiRef.current.start();
      requestAnimationFrame(() => {
        gameApiRef.current.jump();
      });
      return;
    }
    if (statusRef.current === "over") {
      gameApiRef.current.reset();
      gameApiRef.current.start();
      return;
    }
    gameApiRef.current.jump();
  }, []);

  return (
    <div className="game-wrapper">
      <canvas ref={canvasRef} aria-label="Sky Sprint arcade run" role="img" />

      <div className="hud">
        <div className="score">Score {score}</div>
        <div className="best">Best {best}</div>
      </div>

      {status !== "running" && (
        <div className="overlay" role="presentation">
          <div className="overlay-card">
            <h1>Sky Sprint</h1>
            <p>{status === "ready" ? "Tap to jump and dodge neon towers." : "You crashed into a tower!"}</p>
            {status === "over" && <p className="overlay-score">Score {score}</p>}
            <button type="button" className="primary-button" onClick={handlePrimaryAction}>
              {status === "ready" ? "Start Run" : "Play Again"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const HomePage = () => (
  <main className="app">
    <Game />
    <section className="info-card">
      <h2>How to Play</h2>
      <p>Tap anywhere on the game to leap over the neon towers and keep sprinting through the skyline.</p>
      <ul>
        <li>Simple one-touch controls made for phones.</li>
        <li>Run faster the longer you survive.</li>
        <li>Beat your best streak with every run.</li>
      </ul>
    </section>
  </main>
);

export default HomePage;
