# Make the best flight game

Entry for the make.fun bounty [Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057) — a complete original flight game for desktop browser, judged pairwise by screenshots and source outline.

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Holladitt/makefun-best-flight-game-20261126-0057-entry/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Holladitt/makefun-best-flight-game-20261126-0057-entry/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

## Entry

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library. The game is a complete original 3D flight game: island ring course, cockpit and chase views, lit instruments, runway takeoff and landing, HUD with altitude, speed and heading — played with keyboard and mouse, static files, no network.

## Run

```sh
node serve.ts
# open http://localhost:8080 and play
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
