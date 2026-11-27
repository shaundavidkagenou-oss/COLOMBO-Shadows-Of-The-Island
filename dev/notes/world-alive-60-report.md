# COLOMBO — Shadows of the Island · "the world alive" overhaul

**What this is:** an upgrade of the existing game, not a new one. Every one of the 60 requested behaviours was audited
first (`dev/notes/world-alive-60-audit.md`), then either left alone (already working), extended in place (partial), or
implemented in the existing architecture (missing). Nothing that worked was rewritten; the map, the player, the vehicles,
the physics, weapons, shops, interiors, police, missions, audio and saves are untouched apart from the additions below.

Baseline: commit `6535a27` ("98th: CPU render optimisation"). Branch: `arena/a2afe0b1-colombo-shadows-of-the-island`.

---

## 1. The 60 features — final status

Legend: **KEEP** = was already implemented and working, deliberately left alone · **IMPROVED** = partially there, extended
in place · **NEW** = missing, implemented here.

### 1–10 · Living pedestrians and NPCs

| # | Feature | Status | Where it lives now / what changed |
|---|---|---|---|
| 1 | Diverse pedestrian population | KEEP | `actors/Appearance.js` — 80+ presets, 8 look-variants each, anti-repeat spawn history, area weighting |
| 2 | Clothing variation | KEEP | `Appearance.js` outfit families; hi-vis cleaner/road-crew/mason looks now worn by the new workers |
| 3 | Modular appearance | KEEP | `makeAppearance`, `lookVariant`, shared body cache |
| 4 | NPC identity | IMPROVED | `Mind.js` (unchanged) + every worker is now a *named role* with a shift: supervisor / mason / labourer / night watchman on a works, sweeper on a beat, loader on a refuse round |
| 5 | Daily routines | IMPROVED | `world/Business.js` day models (trade hours, midday shutter, weekend) drive which errands are chosen; the works and the sweepers keep their own hours |
| 6 | Destinations | KEEP | `Crowd.chooseGoal` + A* `route()` |
| 7 | Pathfinding | KEEP | `Layout.pedNodes/pedEdges`, crossings only at zebras, stuck recovery |
| 8 | Natural walking | KEEP | pace, ease-in, turn damping, jog, umbrella run |
| 9 | Idle activities | KEEP | `Routine.js` KINDS + per-POI acted idles |
| 10 | Social groups | KEEP | couples/friends walking together (`StreetLife`) |

### 11–20 · Social life

| # | Feature | Status | Where |
|---|---|---|---|
| 11 | Ambient conversations | KEEP | chat POIs with turn-taking, `Mind.chatTurn`, `Lines.js` |
| 12 | Phone use | KEEP | phone/text acts standing, waiting, on benches |
| 13 | Shop visits | IMPROVED | `Business.js` opening hours + `isOpen` gating in goal choice and at the counter; shutters down → people peer and move on |
| 14 | Queues | NEW | `Business.queueSlots` + `Crowd.queueJoin/queueFor` (existing `StationLife`/event queues untouched) |
| 15 | Street vendors | IMPROVED | vendor POIs now open/close by trade, serve a line one at a time, `routine('vendor')` |
| 16 | Reactions to the player | KEEP | `Crowd.react`, dodge/flee/cower, Mind emotions |
| 17 | NPC-to-NPC reactions | KEEP | `separate`, greetings, alarm chains |
| 18 | Sitting / resting | KEEP | bench POIs, `Seating.js` |
| 19 | Building entry / exit | KEEP | fade entry + `WalkIn.js` interiors |
| 20 | Contextual animations | KEEP | full `Character` anim vocabulary |

### 21–30 · Traffic

| # | Feature | Status | Where |
|---|---|---|---|
| 21 | Vehicle variety | KEEP | `VehicleCatalog` + `BikeCatalog` |
| 22 | Population variation | KEEP | SpawnHistory, district `MIX`, parked looks |
| 23 | Traffic density by time | IMPROVED | `SimDirector.trafficDemand()` scales `traffic.max` under the density setting's ceiling: rush 1.0×, day 0.85×, small hours 0.30×, rain −12% |
| 24 | Lane behaviour | KEEP | lane pieces, curvature limits, IDM following |
| 25 | Intersections | KEEP | junction reservations, turn curves, yielding |
| 26 | Traffic lights | KEEP | signals, red/amber stops |
| 27 | Braking / acceleration | KEEP | IDM + brake lights |
| 28 | Indicators / lights | KEEP | `v.ind`, `VehicleFx` |
| 29 | Parking | KEEP | `plan.parking`, arrivals, per-day occupancy |
| 30 | Public transport | KEEP | buses, stops, boarding/alighting |

### 31–40 · Sri Lankan city life

| # | Feature | Status | Where |
|---|---|---|---|
| 31 | Tuk-tuk activity | IMPROVED (partial) | tuks are the commonest vehicle everywhere and carry 1–2 fares; **no hire-stand / hail choreography** (see §6) |
| 32 | Taxis and deliveries | IMPROVED (partial) | taxis weighted in every mix, fares alight; vans/lorries stand in for deliveries, `m_courier` look exists; **no scripted parcel run** (see §6) |
| 33 | Emergency vehicles | KEEP | `police/EMS.js`, `ai.emergency` overtaking, civilians pulling over |
| 34 | Working businesses | NEW | `world/Business.js` — per-trade hours, opening days, midday closure, rain effect, `isOpen`/`footfall`/`queueCap` |
| 35 | Dynamic business activity | NEW | footfall curves per trade (market morning, office lunch, café evening) feed crowd goal weights, queue caps and bin fill |
| 36 | Construction sites | NEW | `world/Construction.js` — 3–5 hoarded plots, merged geometry (20 meshes / 13.2k tris total), tight colliders, tipper lorry, crane, materials, 3–5 day crew + night watchman, crates fetched and carried, site noise |
| 37 | Street maintenance | NEW | `world/StreetServices.js` — sweepers in municipal hi-vis with a hand cart and broom, walking a sidewalk beat, sweeping, with real shift hours |
| 38 | Waste and cleanliness | NEW | the city's 70+ litter bins now have fill levels fed by the footfall around them; an evening refuse lorry pulls in, the loader walks the bins empty, the lorry rejoins the traffic |
| 39 | Roadside life | IMPROVED | stalls/carts/benches (existing) + queues, serving vendors, works lorries, refuse stops |
| 40 | Location-specific activity | KEEP | `DistrictStyle`, area mixes, per-district sounds |

### 41–50 · Environment

| # | Feature | Status | Where |
|---|---|---|---|
| 41 | Dynamic weather | KEEP | `Atmosphere` weather state machine |
| 42 | Rain interaction | KEEP | sheltering, umbrellas, wet skin, traffic grip |
| 43 | Wet roads / puddles | KEEP | `Atmosphere.wet`, wet glints, spray |
| 44 | Wind | KEEP | `Wind.js` gusts, cloth + vegetation shaders |
| 45 | Birds / wildlife | KEEP | `Birds.js` species, perching, flocks |
| 46 | Dynamic vegetation | KEEP | veg wind + `GrassGPU` |
| 47 | Day/night activity | IMPROVED | shops shut, sweepers go home, the works go quiet at 17:30, traffic thins, the refuse round runs at 21:00 — the hour now changes *what is happening*, not just the light |
| 48 | Building / street lighting | KEEP | `LightSets`, signs, `PowerGrid` |
| 49 | Soundscape | KEEP | `EnvSoundDefs`, `PlaceSoundDefs`, traffic audio |
| 50 | Positional audio | KEEP | `PlaceAudio`/`Audio.spatial`; the new works loop and sweeper brushes are positional |

### 51–60 · World intelligence

| # | Feature | Status | Where |
|---|---|---|---|
| 51 | Random ambient events | KEEP | `CityEvents` schedule, `StreetLife` scenes, breakdowns, fights |
| 52 | Contextual world reactions | KEEP | alarm propagation, events pausing, witnesses |
| 53 | Dynamic population management | IMPROVED | `SimDirector.factor()` is now `Game.hourFactor()`: hour curve × the shops open around the player × weather, never above the density setting |
| 54 | NPC memory | KEEP | `Mind.js` memories/relationships, saved |
| 55 | Persistent world state | IMPROVED | save v5 block `world`: works seed + day, bin fill, business day, director history (`SaveSystem` unchanged version; the block is additive and older saves load fine) |
| 56 | Simulation independent of visibility | KEEP | `ViewSkip`, LOD tiers, one-Character-build-per-frame budgets (the works obey it too) |
| 57 | Ambient decision-making | IMPROVED | goal choice weights trade hours, footfall and line length instead of a flat pick |
| 58 | Dynamic crowd behaviour | KEEP | separation, POI caps, chats that form and disperse |
| 59 | Dynamic traffic/pedestrian events | IMPROVED | refuse lorry holding the kerb, works lorries in their plots, queues at peak, and the director's near-field arbitration |
| 60 | World simulation director | NEW | `world/SimDirector.js` |

**Tally:** 40 KEEP · 13 IMPROVED (31 and 32 only partly) · 7 NEW.

---

## 2. Files

**Created**

| File | Lines | What |
|---|---|---|
| `src/world/Business.js` | ~210 | `BusinessDay` (hours, days, footfall, queue caps), `TRADES`, `VENDOR` |
| `src/world/Construction.js` | ~370 | works: site picking, geometry, colliders, crew (`Worker`), lorry, shifts, sound, save |
| `src/world/StreetServices.js` | ~300 | sweepers (`Sweeper`), bins, refuse round (`RefuseRun`) |
| `src/world/SimDirector.js` | ~200 | activity, population factor, traffic demand, near-field budget, weather, persistence |
| `tools/business-test.mjs` | 23 checks | hours/footfall/queues |
| `tools/construction-test.mjs` | 19 checks | plots, colliders, crew, carrying, night, dispose |
| `tools/streetservices-test.mjs` | 19 checks | beats, sweepers, bin fill, refuse round, release, save |
| `tools/sim-director-test.mjs` | 13 checks | activity curve, budget, traffic demand, save, tick cost |
| `tools/world-alive-test.mjs` | 10 checks | all of it running together + per-frame cost |
| `dev/notes/world-alive-60-audit.md` | — | the audit (before) |
| `dev/notes/world-alive-60-report.md` | — | this report |

**Modified**

| File | Change |
|---|---|
| `src/Game.js` | imports the three new systems; builds them on the loading screen (`progress 0.868`); calls `construction.update` / `streetSvc.update` / `simD.update` beside `StationLife` in `updatePlay`; `hourFactor()` delegates to the director; `applyDensity()` hands the director its traffic ceiling; `saveTo`/`startLoaded` persist and restore the `world` block; new `worldInfo()` for the debug console |
| `src/actors/Crowd.js` | (earlier in this branch) `BusinessDay` wiring: `biz`, `queueJoin/queueFor/leavePoi`, open-hours in goal choice, queue slots |
| `src/actors/StreetLife.js` | fight start now leaves a POI through `crowd.leavePoi()` (a queue slot is given up too, not just `poi.used`) |
| `package.json` | `npm test` now runs `business-test`, `construction-test`, `streetservices-test`, `sim-director-test` |
| `dev/notes/world-alive-60-audit.md` | statuses corrected to the final state |

---

## 3. How the new systems fit together

```
                         ┌──────────────────────────────┐
   Atmos (hour, day,     │        SimDirector           │  every 0.25 s
   rain, night) ────────►│  activity  = hour × shops    │
   Business (hours,      │              open × rain     │
   footfall) ───────────►│  population= activity        │──► Game.hourFactor() ─► Crowd spawn want
                         │  traffic   = hour demand     │──► traffic.max  (under the density setting)
   Construction ────────►│  budget    = heavy works     │──► stands down the quietest of
   StreetServices ──────►│              near player     │     {works, refuse round, event} > 2 near you
   CityEvents ──────────►│  weather   = rain → sweepers │──► StreetServices.wantRelease
                         │  saves     = {day, bins, …}  │──► SaveSystem `world` block
                         └──────────────────────────────┘
```

* **Business → Crowd**: hours decide whether a shop is a destination at all; footfall decides how attractive it is; the
  queue length discounts it. The same footfall number fills the bins beside it.
* **Business → SimDirector**: the fraction of open shops around the player is most of the activity level, so the crowd is
  dense outside a market at 11:00 and thin in a shut office district at 15:00 in the rain.
* **SimDirector → Crowd/Traffic**: one number each, both *under* the player's density settings. The old per-hour curve is
  kept as a floor, so no setting can starve the street.
* **Construction / StreetServices → Crowd**: their people are ordinary crowd peds in the `job` state — they are shoved,
  frightened, run over and arrested like anyone else, they use the crowd's collision and personal space, and they reserve
  head-count through `crowd.extra` so the street total stays the same as before.
* **SimDirector → Construction / StreetServices / CityEvents**: the near-field budget. Three "heavy" street works within
  110 m is too much for one corner (and for the frame budget); the farthest one stands down — a crew is released to the
  street, a refuse round aborts, so the player never sees three spectacles stacked on one another.
* **SaveSystem ← everything**: `world = { works seed/day, bins[], business day, director history }`, additive.

---

## 4. Performance

Measured in Node (`tools/world-alive-test.mjs`, 2400 frames = 80 s of game time at 30 Hz, one busy corner with the works,
sweepers, bins and 52 pedestrians + traffic). Node is CPU-only: it measures the JS side of the frame, which is the part
these systems live in.

| | before this branch | after |
|---|---|---|
| crowd update | 1.56 ms/frame | 1.56 ms/frame (untouched) |
| traffic update | 0.52 ms/frame | 0.52 ms/frame (untouched) |
| construction update | — | **0.12 ms/frame** |
| street services + director update | — | **0.02 ms/frame** |
| first frame after arriving at a works | — | ≤ 55 ms once (one Character build; the engine's existing 1-build-per-frame rule), 0 ms after |
| loading screen | — | **+317 ms** measured in the integration harness (5 sites built + 4 crew bodies + 70 bins + 4 beats, all before the first frame; 590 ms of that is the sites alone in the coldest run) |
| new geometry in the world | — | 20 meshes, **13 225 triangles**, 281 colliders over 5 sites (cell/frustum culled like the rest of the city; ~4 draws per site in view) |
| new draw calls when a works is on screen | — | ≈ 4–6 per site (merged per material); bins add **0** in the real game (the city's own bins are reused — one instanced mesh only in the fallback path) |
| new memory | — | 5 site records + 20 small geometries; 70 bin records; the director's maps — well under 1 MB |
| workers on site | — | 3–5 + watchman, but they are *crowd peds*: the total street population is unchanged (`crowd.extra` reserves their slots) |
| per-frame allocations | — | none added: the director reuses its maps and numbers, the works sort a ≤ 5 element array, the services iterate fixed lists |

No shadow/light/shader work was added. Nothing new runs in workers because nothing new is heavy enough to justify the
message-passing cost; the geometry building that *was* heavy now happens on the loading screen instead of mid-street.

---

## 5. Tests

Nothing was accepted on inspection — every system has a headless test, all of them run from `npm test`:

| Test | Result |
|---|---|
| `crowd-test` | 5/5 |
| `business-test` | 23/23 |
| `construction-test` | 19/19 |
| `streetservices-test` | 19/19 |
| `sim-director-test` | 13/13 |
| `world-alive-test` (integration + perf) | 10/10 |
| `streetlife-test` | 23/23 |
| `routine-test` | 19/19 |
| `lane-test` | 9 279 lane/turn paths, 0 dead ends |
| `park-test` | 10/10 |
| `smoke-test` (whole world + production build) | 17/17 |
| `npm run build` | ok |

---

## 6. What is not finished, and why

1. **#31 Tuk-tuk hire behaviour** (hire stand, hail, "where to?"): not implemented. A correct version needs a fare state
   machine shared between `Traffic` (the tuk has to pull to the kerb, wait with the meter off and rejoin), `Crowd` (a person
   has to *want* a tuk, walk to it, board — `Boarding.js` already does vehicle entry for buses) and the player's own
   interaction (hailing one for a ride). That is a gameplay feature in its own right, not a simulation touch, and doing it
   half-way would have been exactly the "fake system" this task forbids. What exists: tuks are the commonest vehicle in
   every district, carry 1–2 fares and set them down at the kerb.
2. **#32 Delivery parcel run** (a courier carrying a parcel from a van to a shop door and back): the same reason at smaller
   scale — it needs a parcel prop lifecycle, a door hand-off and a return trip that the shop's `WalkIn` interior agrees to.
   What exists: delivery vans and lorries in the mix, the `m_courier` look, and the loader on the refuse round who *does*
   walk vehicle → bin → vehicle, which is the same pattern.
3. **#59** is limited to what the roster and the bins can produce (refuse lorry holding a lane, works lorries, queues). A
   traffic *accident* that blocks a road and draws a crowd exists only in the police/EMS incident path, which I did not
   extend — `Mind.js` incidents and `EMS.js` already cover the "something happened and people gathered" case.
4. **Persistent world across sessions** is limited to the additive `world` save block. Time that passes while the game is
   *closed* is not simulated (bins do not fill overnight in real life); on load the day, the works, the bins and the
   business day resume exactly where they were.
5. The `hourFactor()` handover means the crowd's population now depends on the shops around the player. In districts with
   none within 55 m the factor falls back to the plain hour curve — intended, but it does mean a walk from Pettah to a
   residential lane is a visible change in density (that is the feature, not a bug; it is called out here because it is a
   behavioural change to an existing curve).

---

## 7. How to see it in game

* Walk past a hoarded plot (the gate faces the pavement) between 07:00 and 17:30 — the crew is working, labourers carry
  crates from the store to the frame, the tipper is parked inside, there is site noise. At night only the watchman is there.
* Follow a municipal sweeper in hi-vis with a hand cart at ~06:00 or ~16:00: he walks the pavement, stops, sweeps, walks on.
* Look in a litter bin in a busy street at midday, then come back at 21:00 — the refuse lorry pulls in, the loader empties
  the bins one by one and it drives off.
* Stand in a busy street at 11:00 and then at 03:00, then in the rain: the crowd thins three different ways.
* Sit still for a minute at a busy corner and watch the corner: a works, a refuse round and an event will not all arrive at
  once — the director stands the farthest one down.
* `worldInfo()` on the debug console prints all of it (`game.worldInfo()`).
