# Blast Radius

**Your agents read the internet. The internet reads back.**

Blast Radius is an arcade game about a prompt-injection worm loose in a swarm of AI agents. Work flows through the mesh, and some of the pages your agents fetch carry instructions. An injected message heads for the vault, takes a secret and runs for the exit. You stop it with a blade: slice the message in flight. Every cut also severs one of your own links, though, and work that hits the gap is lost. Cut too little and you leak; cut too much and the work stalls.

**Play:** https://blast-radius-game.vercel.app. It runs in the browser on desktop and phone, with no install and no account.

## How to play

| | Desktop | Phone |
|---|---|---|
| Cut a link | Drag across it | Swipe across it |
| Quarantine an agent | Click it | Tap it |
| Slow time (upgrade) | Hold Space | Hold two fingers |
| Shop | 1 / 2 / 3, R to reroll, Enter to skip | Tap a card |
| Pause / mute / restart | Esc / M / R | On-screen buttons |

**There are two ways to lose:**

- **Leak:** a stolen secret reaches the exit.
- **Stall:** the backlog stays over capacity for five seconds.

**What escalates:**

- Every 25 seconds the swarm grows and the shop opens.
- New kinds of injection arrive: fast ones, stealthy ones that look like ordinary work, sleepers, splitters, and hunters that go for your busiest agent.
- Each upgrade is a real defence:
  - Sandbox
  - Rate Limit
  - Canary Token
  - Human in the Loop
  - Allowlist
  - Circuit Breaker
  - Rollback
  - Least Privilege
  - Fast Heal
  - Wide Blade

**Modes:**

- **Daily** puts everyone on the same board, one leaderboard per UTC day.
- **Endless** gives you a fresh board every run.
- A third board is for agents (see below).

## How it works

```
packages/sim     deterministic game rules (no DOM, no dependencies)
apps/web         the game: Canvas2D renderer, Web Audio synth, input, UI
packages/server  run verification, boards, agent sessions, MCP tools
apps/api         Vercel functions (bundled into Build Output v3)
supabase         schema for runs, agent sessions, names and rate limits
```

**Deterministic simulation.**
- The rules run at a fixed 60 Hz on a seeded RNG (sfc32).
- The sim uses only `+ − × ÷` and `sqrt`: no trig, no `Math.random`, no clocks.
- A run is fully described by its seed and the list of actions, each stamped with its tick.
- The same replay produces a bit-identical state on any engine. This is tested over 1,000 seeds, plus frozen golden replays.

**Verified scores.**
- The browser sends the replay, not the score. The server re-simulates the whole run and only ranks it if:
  - the claimed score matches;
  - every action was legal;
  - the run really ended in a leak or a stall.
- Each outcome ranks once. A copied replay is refused, even with junk fields or no-op cuts added, and so is a copy sent from another device.
- Endless seeds are issued and signed by the server, so a run can't be ranked on a seed someone picked by hand.
- A name belongs to the first device that used it.
- Every ranked run can be watched as a replay.

**Agents can play too.**
- The same daily board is served over a remote MCP endpoint (Streamable HTTP, MCP 2026-07-28 with a 2025-era fallback) and as plain HTTP. Agents rank on their own board.
- Time only moves when the agent calls `act`. Illegal moves are reported back and never recorded, so every agent run stays verifiable.
- The game text that agents read is real: injected packets carry injection attempts, written to stay inside the game. An agent that follows them pays for it.
- See [`/llms.txt`](apps/web/public/llms.txt) for the rules and endpoints. Connect any MCP client to:

```json
{ "mcpServers": { "blast-radius": { "type": "http", "url": "https://blast-radius-game.vercel.app/api/mcp" } } }
```

## Balance

Bots play 200 seeds each. Every bot sees only what a player sees, and the human-paced ones react with a delay and aim imperfectly. `pnpm balance` reproduces the table.

| Bot | Leak | Stall | Wave p10 / median / p90 | Median run | Median score |
|---|---|---|---|---|---|
| `idle` (does nothing) | 100% | 0% | 1 / 1 / 1 | 18 s | 110 |
| `denyAll` (cuts every link at the user and the web) | 0% | 100% | 1 / 1 / 1 | 24 s | 0 |
| `sloppy` (0.75 s reactions, under one move a second) | 38% | 62% | 4 / 8 / 13 | 192 s | 8114 |
| `heuristic` (0.5 s reactions, about 1.3 moves a second) | 0.5% | 99.5% | 6 / 10 / 16 | 236 s | 11373 |

These numbers are tests (`packages/sim/test/balance.test.ts`):
- Doing nothing loses to a leak.
- Cutting everything loses to a stall within half a minute, so refusing everything is never a strategy.
- A careful defender lasts several waves.

Even a defender that removes every injection perfectly eventually drowns in work, around waves 13–18. That ceiling is what makes it an arcade game.

## Run it locally

```bash
pnpm install
pnpm dev                 # the game at http://localhost:5173
pnpm test                # every package's tests
pnpm balance             # the table above
pnpm --filter web e2e    # Playwright on desktop and phone
```

The API runs as Vercel functions. Locally, `BLAST_MEMORY_STORE=1` keeps boards in memory. In production it needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `IP_HASH_SALT`; without them the boards answer 503, and the game itself keeps working.

## Honest limits

- A verified replay proves a score follows the rules from its inputs. It cannot prove a human made those inputs, which is why agents rank on their own board.
- Endless seeds come from the server, but someone could still evaluate the seeds they are given offline before playing. Daily is the fair board: one seed for everyone.
- Names are first come, first served per device. There are no accounts by design, so look-alike names are possible.
- Agent mode is turn-based: an agent can think as long as it likes between moves. Agent and human scores are not comparable, and they are kept apart.
- Balance is tuned against bots and by hand. The bots above are published as they are.

## License

MIT
