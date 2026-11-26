# Underground fight clubs + street racing — audit and phased plan (92nd)

Target: GTX 1660 Super / 16 GB, steady 60 fps. three r186 WebGL, existing renderer, post chain and light-set
architecture kept. Everything below reuses systems that already exist; nothing new is a second crowd, a second
traffic system or a second model cache.

## 1. Audit — what exists and how the new activities use it

| Need | Existing system (file) | Finding | Use |
|---|---|---|---|
| Event lifecycle / scheduling | `world/CityEvents.js` (+ `events/`) | scheduled → preparation → active → ending → cleanup → completed; build radius 450 m, people 170 m; save field `events`; `prewarm(tick)` on the loading screen | Same lifecycle in a small, separate **ActivityManager** (`activities/`), so fights / races never interfere with the festival calendar. Modular: an activity type is a class with `prepare / start / update / end / cleanup`. |
| Spectators | `actors/Crowd.js` job state, `events/EventPeople.js` `EvAgent` | `p.state='job'`, `p.job={step,post,interrupt,resume}`, `p.keep`, `p.faceYaw`; LOD 1/2/3 by distance; `release` / `returnToGraph`; `makePed` builds a Character (10–30 ms) | Spectators are **crowd pedestrians in the job state**. First borrowed from peds already alive near the venue that are *not visible*, *not kept*, *not in any job / scene / vehicle*; topped up with `makePed` from the crowd's prepared looks, one per frame through the shared `BUILDS` token, before the player arrives. Back to the street with `returnToGraph` (or `remove` out of sight). |
| Combat animation | `actors/Boxing.js`, `Character.anim` | stance, jab / cross / hook / upper with keyframed mechanics + arm IK, block, reactions snap / hook / upper / body / block; non-graphic | Fighters use exactly this layer (`fightOn / strike / takeHit / block`); `kneel / rise / stumble / handsup / clap / point / argue` actions for knock-downs, corners, celebrations. No new clips. |
| NPC fight template | `actors/StreetLife.js` (l.278–345) | weighted move pick, hit at `M.hit`, block 35 %, spacing 1.05 m, knock-back via `vx/vz` | Replaced inside the ring by a personality-driven controller (range management, stamina, balance, guard, combos, recovery); no alarm, no police call (an organised event). |
| Animation time | `Crowd.update` l.616 `p.ch.anim.update(dt*…)` | per-ped dt | **Localised hit-stop:** `p.animK` (default 1) scales only that ped's pose time for ~70 ms. The engine, render loop, crowd and everyone else keep running. |
| Lights | `gfx/LightSets.js`, `world/WalkIn.js` pool | the scene's light count is part of every program key; WalkIn owns a pre-compiled pool of six point lights lent to the hospital via `ext` | The venue **borrows the WalkIn pool** (a second lender slot) — no new light, no new program variant, no compile in play. Bulbs are emissive meshes. |
| Vehicles for rivals | `vehicles/Vehicle.js`, `VehicleModels.modelCached`, `Traffic` | the loading screen builds one look of every type; `new Vehicle(type, seed)` with a cached look clones it | Rivals are built from **cached looks only** (no new model build), one per frame via `BUILDS`, out of sight, before the meet. |
| Rival physics | `Vehicle.drive(dt,{throttle,steer,handbrake},collision,others)` | the player's own physics (Story pursuers already use it) | Rivals drive with `drive()` — same top speed, accel, braking (12 m/s²), grip limit (11.5 m/s² cars), steering rate. AI only produces inputs. |
| Traffic interplay | `Traffic.binBodies` (24 m bins), `bodyGap0`, `all()` | civilians brake for anything in the bins; the player collides with `all()` | Race cars are registered as `traffic.guests`: in the bins (civilians brake for them), in `all()` (player / weapons / crowd see them), never stepped or culled by traffic. Hand-back after the race: `traffic.adoptAI(v, laneNear…)` → ordinary traffic, culled by distance like any car. |
| Engine audio | `Audio.updateEngines`, `Game` l.696, `TrafficAudio` | voices for player + nearest `traffic.vehicles` | guests are offered first (rivals near you get engine voices / pass-bys). |
| Interaction prompts | `Game.updateInteractions` chain, `hud.prompt` | | fight: "watch / predict", race: "join (difficulty)". |
| Phone | `ui/Phone.js` apps | apps are rows `{t,d,at}` | new **After Dark** app: tonight's fight card and race meets, GPS. |
| Save | `Game.save` (l.409), `SaveSystem` | | `activities` field: prediction points (free, non-purchasable, non-transferable), fighter records, race records, rival stats. |
| Benchmark | `gfx/Benchmark.js` | configs A–E, frame stats, GPU timer or "unavailable" | add **F (fight)** and **R (race HARD / EXPERT)** scenarios using the real activity code. |

### Venues
Buildings are shells (no walkable warehouse interiors) and roofs are not reachable on foot. Venues are therefore real
outdoor spots in the districts the brief names: a back lot off Maradana Road (Maradana), the loading yard of the port
warehouses (Fort), a Kompanna Veediya backstreet lot (Slave Island) and an industrial lot by St. Lucia's (Kotahena).
(Probed while testing: the blocks right around the auto garage and Union Place are built solid — no 14 × 14 m clear
patch within 96 m — so those two anchors were moved to the nearest real lots the search finds.) A finder (same rules as `EventSites.rectClear`) measures a clear rectangle; the venue is a lightweight
dressing (rope ring on posts, crates, oil drums, work lamps, tarpaulin) built once on approach and freed when far.
**Rooftop fights are not implemented** (no roof access / no crowd ground on roofs) — said plainly rather than faked.

### Race routes
Precomputed loops on level-0/1 roads of the existing graph (`L.vseg / L.hseg`), checked segment by segment:
Marine Drive circuit (Marine Drive ↔ Galle Road via Dharmapala / W.A. Silva), Cinnamon Gardens run (Duplication Rd,
Bauddhaloka, Darley Rd, Dharmapala), Fort–Maradana sprint. Centre-line → corner arcs → racing line by a constrained
minimum-curvature relaxation inside the road width → per-point speed limit `sqrt(aLat·R)` → backwards / forwards
braking / acceleration passes. All computed once at prepare time (a few ms), never per frame.

## 2. Phases (each with a puppeteer test)
1. **ActivityManager** (schedule, lifecycle, save, phone, blips, prompts) — `tools/activities-test.mjs`.
2. **Fight club** — venue finder + dressing, spectator agents, fighter controller, presentation (hit-stop,
   shake, pooled dust / sweat, impact audio, crowd reactions, camera views), predictions UI — `tools/fight-test.mjs`.
3. **Street race** — routes, rival AI (difficulty EASY → EXPERT), meet, grid, countdown, lights, checkpoints, results,
   hand-back — `tools/race-test.mjs`.
4. **Integration** — rumours (crowd lines), gatherings, rival meet-ups, return-to-world checks.
5. **Preload / prewarm** — looks, spectator bodies, fighter bodies, audio, effect pools, shader warm of the dressing
   with the pool light set, before the event goes active.
6. **Benchmarks** — F / R scenarios, multi-run, CSV / JSON, phases (startup, gameplay, completion, return, streaming).

## 3. Honest limits
* SwiftShader in the sandbox is a CPU rasteriser (~0.3 fps): its numbers are only relative. The real figures come
  from running `bench` / the Graphics page on the GTX 1660 Super in Chrome with hardware acceleration.
* GPU time needs `EXT_disjoint_timer_query_webgl2`; when missing the report says "unavailable".

## 4. Status (92nd, as built)
| Phase | State | Test |
|---|---|---|
| 1 ActivityManager | done: deterministic nightly schedule (fight 21:30–01:30, race 22:30–02:30), prepare ≤ 320 m / drop > 480 m, blips, After Dark phone app, save `activities`, prompts | `tools/activities-test.mjs` §1 |
| 2 Fight club | done: venue finder + dressing, 8-fighter roster with styles, `FightAI` bout (rounds, judges' cards, KO / TKO / UD / SD / MD / Draw — a winner needs two cards), localised hit-stop on heavy hits, dust / sweat pool, crowd reactions, ringside / overhead camera, predictions with free points (house refills to 20 a night), lamps via the WalkIn pool, gunfire scatters the crowd | §2 |
| 3 Street race | done: 3 routes, RaceDriver EASY → EXPERT on the player's physics, meet, difficulty at the meet, grid, 3-2-1, checkpoints, laps, positions, DNF rules, results (unfinished rivals classified on their pace, marked ~), records, hand-back to traffic | §3 |
| 4 Integration | partial: scatter on gunfire, return-to-world. **Not done:** rumour lines in the crowd, rival meet-ups outside events | — |
| 5 Prewarm | routes on the loading screen; rivals from cached looks, people one per frame via `BUILDS` | §2 / §3 |
| 6 Benchmarks | done: scenario **F** (fight night, ringside orbit) and **R** (street race HARD / EXPERT, chase cam) in `Benchmark.js` + `BenchScenes.js`; console `bench [s] [warm] [ACE] fight|race|race-expert`; Settings → Graphics → Benchmark scenario; JSON / CSV gain a `scenario` column | §4 |

Not implemented: the player fighting in the ring (watch / predict only), rooftop fights (no roof access).
