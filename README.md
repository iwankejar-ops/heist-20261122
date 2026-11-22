[![make.fun](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/iwankejar-ops/heist-20261122/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/iwankejar-ops/heist-20261122/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)

# The Meridian Job

An original top-down 2D heist game, made for [make.fun's best heist game bounty](https://make.fun/bounty/best-heist-game-20261122-0559).

You are **Wren**, a thief with one night to lift the **Star of Meridian** from the
Marlow Gallery — past three patrolling guards with sweeping vision cones, two
security cameras, and a four-minute countdown to dawn. Grab the paintings, the
gem cases and the coin pouch on the way out if you dare, hack the camera panel
to buy yourself darkness, and toss coins to pull guards off your route. Get
caught, or let the sun come up, and the job is over.

## How to play

- **WASD / arrows** — move
- **Shift** — sneak (slower, harder to spot, kicks up dust)
- **E (hold)** — grab loot, or hack the camera panel
- **Click** — toss a coin to distract a guard (3 coins)
- **P** — pause · **M** — mute · **R** — play again after a win or a loss

Steal the Star, then reach the green **EXIT** service door before dawn. Your
grade depends on how loud you were: **GHOST** (no alarms, everything taken),
**SILENT**, **SLICK**, or **LOUD**.

## Running it

No build step, no network: serve the `game/` folder with any static server and
open `game/index.html` in desktop Chrome, or run `node serve.ts` and open
http://localhost:8080. All art is drawn in code and all sound is synthesised
live with WebAudio.

## License

MIT — see [LICENSE](LICENSE).
