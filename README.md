# Battleship

Multiplayer Battleship you can play online against a friend or an AI opponent.

🔗 **Live:** [battleship.hackatoa.com](https://battleship.hackatoa.com)   ·   ☕ **Support:** [Buy Me a Coffee](https://buymeacoffee.com/hackatoa)

## Overview

Classic Battleship in the browser. Play real-time multiplayer over WebSockets or take on an AI with three difficulty levels (random, hunt & target, probability-based). Includes a global leaderboard.

## Features

- Real-time online multiplayer + single-player vs AI (Easy / Medium / Hard)
- Drag-free ship placement with keyboard `R` and touch double-tap to rotate
- Global leaderboard (Postgres)
- 6-language localization

## Tech Stack

HTML · vanilla JS · Node.js (Express + Socket.IO) · PostgreSQL · Docker

## Development

```bash
npm install
npm start   # serves public/ + Socket.IO on PORT (default 3025)
```
The leaderboard is optional — without `DATABASE_URL` set, the game runs with the leaderboard disabled.

## Deployment

Docker on the homelab games host; auto-deployed via GHCR + Watchtower.

## Support

If this project is useful to you, consider supporting development:

☕ **[Buy Me a Coffee](https://buymeacoffee.com/hackatoa)**

---

Part of the **[Hackatoa](https://hackatoa.com)** ecosystem — self-hosted apps, browser games, and bots. · [All repositories »](https://github.com/Hackatoan)
