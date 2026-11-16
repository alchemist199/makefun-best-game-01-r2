# LUXWARD — keep the light flowing

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/alchemist199/makefun-best-game-01-r2/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/alchemist199/makefun-best-game-01-r2/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A light-network tower defence. Your lamps only burn while they are joined to
the Beacon — the Dawnheart — by a living chain of light. The Gloom sends
Shades that cut the beams with shadow discs and Snuffers that extinguish
lamps, darkening whole branches at once. Chain lamps back to the Beacon,
kill Shades first, rekindle what gets snuffed, and hold 12 waves — through
the mini-boss Snuffler on wave 6 and the three-phase Gloomwarden on wave 12.

- **6 lamps × 3 tiers** — Hearth, Prism, Pulse, Glimmer, Sunlance, Dawn Relay
- **6 enemies + 2 bosses** — Crawlers, Swifts, Bulwarks, Snuffers, Shades,
  Spitters, the Snuffler, and the Gloomwarden
- **The light network** — lamps fire only while lit; beams are cut by shadow
  discs; snuffed lamps break the chain until rekindled
- **Pick 1 of 3 boons** after every cleared wave, from a pool of 10
- **2 difficulties** (Kindled / Smothered), 1–3 star victories, and Endless
  Night after the win
- Seeded simulation, fixed 1/60 s step, WebAudio synth sound, no network,
  no libraries

## How to play

- **Place a lamp** — pick one with keys 1–6 or the bottom bar, then click the
  grass. Green link = it will be lit; red/dim = it will be dark.
- **Begin a wave** — Space or the Begin Wave button. Calling the wave early
  (within the rest window) pays +10% glow on the clear bonus.
- **Manage lamps** — click a placed lamp to upgrade it (Mk I → II → III),
  sell it for a 70% refund, or rekindle it for 10 glow when snuffed.
- **Win** — survive wave 12 and kill the Gloomwarden. **Lose** — the Beacon
  reaches 0 HP.
- **Pause** — P or Esc · **Speed** — F (1×/2×) · **Mute** — M ·
  **Restart** — R on end screens

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080.

No build step, no network, no libraries: plain static files and a seeded
simulation, so the same seed always replays the same night.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
