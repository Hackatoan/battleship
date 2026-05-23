# Battleship Online

![Battleship Online](https://battleship.hackatoa.com/og.svg)

Classic naval strategy in your browser — place your fleet and hunt the enemy. Play solo vs AI or challenge a friend in real-time multiplayer.

**▶ Play at [battleship.hackatoa.com](https://battleship.hackatoa.com)**

## Features

- **vs AI** — three difficulty levels (Easy, Medium, Hard)
  - Easy: random shots
  - Medium: hunt/target mode — pursues hits
  - Hard: probability-density map (finds high-value targets)
- **Real-time multiplayer** — share a room link
- Standard 10×10 board, 5 ships (Carrier, Battleship, Cruiser, Submarine, Destroyer)
- No account or download required

## How to play

1. Place your ships on the board
2. Take turns calling shots — first to sink the enemy fleet wins!

## Tech stack

- Node.js + Express + Socket.io
- Vanilla HTML/CSS/JS
- Docker + GitHub Actions CI/CD (auto-deploys via Watchtower)

## Self-hosting

```bash
docker run -p 3025:3025 ghcr.io/hackatoan/battleship:latest
```

---

Part of [Hackatoa Games](https://games.hackatoa.com) · [Buy me a coffee](https://buymeacoffee.com/hackatoa)
