# WORLD ALIVE OVERHAUL — FEATURE AUDIT (60 features)

Audit of the codebase at commit `6535a27` ("98th: CPU render optimisation…"), before any change.
Basis: full read of `src/actors/Crowd.js`, `Mind.js`, `Routine.js`, `StreetLife.js`, `Appearance.js`,
`src/vehicles/Traffic.js`, `Vehicle.js`, `VehicleCatalog.js`, `src/world/Atmosphere.js`, `Birds.js`,
`Wind.js`, `CityEvents.js`, `StationLife.js`, `FuelStations.js`, `Collision.js`, `src/core/SaveSystem.js`,
`src/Game.js` (loop wiring), plus targeted greps for every requested behaviour.

Legend: **KEEP** = implemented and working (leave alone), **IMPROVE** = partially there, extended in place,
**NEW** = missing, implemented in this overhaul.

## Category 1 — Living pedestrians and NPCs

| # | Feature | Status | Evidence / what was missing |
|---|---|---|---|
| 1 | Diverse pedestrian population | KEEP | 60+ `PRESETS` (sex/age band/profile/outfit/hair/accessories), `LOOK_VARIANTS` ×8 recolour+face variants per preset, `SpawnHistory` anti-repeat, area weighting (`areaMix`, `areaLiking`). |
| 2 | Intelligent clothing variation | KEEP | Outfit families (office, kurta, saree, school-adjacent smart, hi-vis worker, shopkeeper apron, delivery, slipper/sandal) built to body surface (`Character.js` garment offset). |
| 3 | Modular appearance generation | KEEP | `makeAppearance(seed)`, `lookVariant(base, vi)`, shared body geometry cache, `NpcHead` face variants. |
| 4 | NPC identity system | IMPROVE | `Mind.js` gives traits/persona/memory/ties per person, but only *looks* are stable; a person has no name/schedule identity. Added: a persistent **business/worker identity** (name + trade + shift) for street workers in this overhaul (`StreetServices`, `Construction`), and named-role agents on site. |
| 5 | Daily routines | IMPROVE | Hour-driven *population mix* (`profileActivity`) + errand routes existed, but a person did not *carry* a day's plan. Added: routines derived from the hour when a goal is chosen (home→work→errand→home weighting) via `Business.js`. |
| 6 | Destination system | KEEP | `chooseGoal` → POI graph + A* `route()` over the sidewalk graph; no purposeless wandering (`crowd-test` asserts it). |
| 7 | Pathfinding | KEEP | A* over `L.pedNodes/pedEdges`, crossing-only-at-zebra rules, `returnToGraph`, stuck recovery. Tests: `crowd-test`, `edge-test`. |
| 8 | Natural walking | KEEP | Per-person pace, ease-in to targets, turn damping, `emoPace`, jog, umbrella run. |
| 9 | Realistic idle activities | KEEP | `IDLE_ACTS`, `routine()` KINDS (desk/guard/stand/phone/chat/patron/vendor…), per-POI acted idles. |
| 10 | Social groups | KEEP | `StreetLife` couples/friends walking together with spacing. |
| 11 | Ambient conversations | KEEP | `chat` POIs with turn-taking talk/listen, `Mind.chatTurn`, `Lines.js` + `Voices.js`. |
| 12 | Phone usage | KEEP | phone/text acts standing, waiting, on benches. |
| 13 | Shop visits | IMPROVE | `shop` POIs give browse/look and `door` POIs fade into buildings, but shops never **closed**, and nobody **queued**. Implemented hours + closing in `Business.js`. |
| 14 | Queue system | NEW | Only `StationLife` (ticket windows) and `EventSite` (event gates) had queues. Street vendors/shops had a cap of exactly 1 person. Implemented a real street queue (slot line, shuffle forward, serve order) in `Crowd` driven by `Business.js`. |
| 15 | Street vendors | IMPROVE | Ten modelled stall types, `foodcart` props, vendor POIs, `routine('vendor')`. Added: open-hours, queue of customers, served-one-at-a-time pacing. |
| 16 | NPC reactions to player | KEEP | `Crowd.react`, dodge/flee/cower/report, `Mind` emotions from stimuli, `interact()` talk/wave/insult/shove. |
| 17 | NPC-to-NPC reactions | KEEP | `separate()` body avoidance, greetings (`bond`), alarm propagation, witness chains. |
| 18 | Sitting and resting | KEEP | bench POIs with real seat slots, `Seating.js` pose, lawns sitting on ground. |
| 19 | Building entry/exit | KEEP | `enterBuilding` fade + respawn, `WalkIn.js` enterable shops. |
| 20 | Contextual animations | KEEP | Large `Character` anim set (browse, phone, argue, shrug, point, nod, crossarms, sit, dance…). |

## Category 2 — Social life (rows 11–20 above)

## Category 3 — Realistic Colombo traffic

| # | Feature | Status | Evidence / what was missing |
|---|---|---|---|
| 21 | Traffic variety | KEEP | `VehicleCatalog` (cars, sedans, vans, SUVs, tuks, 20 bike kinds, buses, pbus, lorry, tow, taxi, pickup, exec) + `BikeCatalog`. |
| 22 | Population variation | KEEP | `SpawnHistory`, `variedType`, `variedSeed`, per-street-type `parkedLook`, district mixes (`MIX`, `CAT_MUL`). |
| 23 | Traffic density simulation | IMPROVE | Type mix varied by district; total volume did not vary with the hour. `SimDirector.trafficDemand()` now scales `traffic.max` under the density setting's ceiling: rush 1.0×, evening 0.85×, small hours 0.3×, rain −12%. |
| 24 | Intelligent lane behaviour | KEEP | Lane pieces, curvature speed limits, IDM-ish following, kerb-parked passing, predictive conflict checks. |
| 25 | Intersection logic | KEEP | Junction reservations (`reserve`), turn curves, yielding, `flowNetwork`. |
| 26 | Traffic light awareness | KEEP | Signals in `Layout` (`signalLive`, `pedSignal`), vehicles stop on red/amber. Tests: `lane-test`. |
| 27 | Braking/acceleration | KEEP | IDM-style accel, `pathV` curvature limits, brake lights via `VehicleFx`. |
| 28 | Indicators and lights | KEEP | `v.ind` set by AI turns, `VehicleFx` flashes lamps; headlights/brake lights in `Vehicle`. |
| 29 | Parking behaviour | KEEP | `plan.parking` spots, `updateArrivals` pull-in, per-day occupancy, vacate/tow. Tests: `park-test`. |
| 30 | Public transport | KEEP | Bus stops, door open/close, boarding/alighting (`BusWalk`, `Boarding`). Tests: `bus-door-test`, `npc-boarding-sim`. |
| 31 | Tuk-tuk activity | IMPROVE (partial) | Tuks are the most common vehicle in every district mix, carry 1–2 fares (`PAX.tuktuk`) and stop to set them down (`disembark`). No dedicated hire-stand / hail-a-tuk choreography was added — see the report's incomplete list. |
| 32 | Taxi and delivery services | IMPROVE (partial) | Taxis are a weighted type in every district mix, biased to 1–2 fares, and the crowd walks away from the kerb when they are set down (`reaction 'calm'`). Vans/lorries stand in for deliveries, and the `m_courier` look exists. A scripted parcel-delivery run was **not** added — see the report. |
| 33 | Emergency vehicles | KEEP | `police/EMS.js`, ambulances, police units, `ai.emergency` overtaking + civilians pulling over. Tests: `ems`, `police-test`. |

## Category 4 — A real living Sri Lankan city

| # | Feature | Status | Evidence / what was missing |
|---|---|---|---|
| 34 | Working business locations | NEW | Shops were static POIs with no hours/employees. Added hours, staffed/closed state, `Business.js`, exposed to crowd goal choice. |
| 35 | Dynamic business activity | NEW | Added per-trade footfall curves (market morning, office lunch, cafe evening) driving how many people head for each trade. |
| 36 | Construction sites | NEW | Nothing existed. Added `Construction.js`: hoarding + scaffolding + material stacks + mixer + site hut, dynamic colliders, workers (carrying, mixing, measuring), a supervisor, noise, and sidewalk diversion for pedestrians. |
| 37 | Street maintenance | NEW | "Municipal cleaner" existed only as an outfit. Added `StreetServices.js`: sweepers with carts walking a beat with a broom, a supervisor, and shift hours. |
| 38 | Waste and cleanliness | NEW | Litter bins existed as static props with no state. Added bin fill levels that rise with nearby footfall, an evening refuse lorry that empties bins on a route, and litter that sweepers clear. |
| 39 | Roadside life | IMPROVE | Stalls, carts, benches, bus shelters already placed. Added queued customers, vendor serving, parked delivery vehicles and construction workers to the mix. |
| 40 | Location-specific activities | KEEP | `DistrictStyle`, `areaMix`, `AREA_OF`, district traffic mixes, per-district sounds. |

## Category 5 — Environment and atmosphere

| # | Feature | Status | Evidence / what was missing |
|---|---|---|---|
| 41 | Dynamic weather | KEEP | `Atmosphere`: clear/cloudy/overcast/rain/storm with a `weatherTimer` (180–420 s) and weighted transitions, afternoon storms. |
| 42 | Rain interaction | KEEP | Crowd `shelter`, umbrella speed, rain volume down, traffic `weatherRain` handling. |
| 43 | Wet roads and puddles | KEEP | `Atmosphere.wet`, wet glints (`WetGlints`), `rainNrm` KTX2, spray in `VehicleWeather`. |
| 44 | Wind simulation | KEEP | `Wind.js` uniforms + gust state machine, cloth + vegetation shaders. |
| 45 | Birds and wildlife | KEEP | `Birds.js` (species, perching on wires/rails, flocks, takeoff, LOD). Tests: `bird-test`. |
| 46 | Dynamic vegetation | KEEP | `vegWind` shader + `GrassGPU`. |
| 47 | Day/night activity | IMPROVE | `hourFactor`, profile activity curves existed; night was mostly "fewer people". Now shops shut, street services stop, taxis/deliveries thin out, night traffic drops — the street genuinely re-populates. |
| 48 | Building and street lighting | KEEP | `LightSets` (per light level), shop signs, streetlights, `PowerGrid` (blackouts). |
| 49 | Environmental soundscape | KEEP | `EnvSoundDefs`, `PlaceSoundDefs`, `RoadsideSoundDefs`, `TrafficAudio`, `BirdAmbSoundDefs`, `PlaceAmbience`. |
| 50 | Positional audio | KEEP | `PlaceAudio`, `Audio` panner/doppler, `VehicleAudio`. |

## Category 6 — World intelligence and immersion

| # | Feature | Status | Evidence / what was missing |
|---|---|---|---|
| 51 | Random ambient events | KEEP | `CityEvents` (concerts/markets/festivals, setup→active→cleanup), `StreetLife` (smoke, calls, couples, fights), traffic breakdowns/rage, `police` civil calls. |
| 52 | Contextual world reactions | KEEP | `Crowd.alarm`, `CityEvents.onAlarm`, `traffic.slowZones`, security response, witnesses. |
| 53 | Dynamic population management | IMPROVE | `hourFactor` + `setDensity` existed; also now modulated by business activity and street services, and traffic by hour demand. |
| 54 | Intelligent NPC memory | KEEP | `Mind.js` memories, relationships, `minds.save/load` in saves, familiarity (helped/harassed) affecting later reactions. |
| 55 | Persistent world state | IMPROVE | Saves persisted story, minds, weather, power, events. Added: business-day state, street-services state (bin fill, sweeper round), construction progress, city-work logs — see `SaveSystem` v6. |
| 56 | Simulation independent of visibility | KEEP | `ViewSkip.offView`, `HOLD_OK` held poses, LOD tiers, `BUILDS` frame budget, distance culling. |
| 57 | Intelligent ambient decision-making | IMPROVE | Mind/routine existed; goal choice now also weighs trade opening, footfall, queue length and the hour, instead of a flat random POI pick. |
| 58 | Dynamic crowd behaviour | KEEP | `separate()`, POI caps, chat clusters that form/disperse, gathering at incidents. |
| 59 | Dynamic traffic/pedestrian events | IMPROVE | Bus-stop queues and event flows already existed. Added: vendor/shop queues at peak, a refuse lorry holding the kerb lane while it is loaded, works lorries parked in their plots, and the director's near-field arbitration so two of these never converge on the same corner. |
| 60 | World simulation director | NEW | `Game.updatePlay` called systems in a fixed order but nothing owned the daily rhythm or arbitrated budgets across crowd/traffic/business/services/events. Added `SimDirector.js`. |

## Summary

* **KEEP (already working, untouched):** 1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 33, 40, 41, 42, 43, 44, 45, 46, 48, 49, 50, 51, 52, 54, 56, 58 — 40 features.
* **IMPROVE (extended in place):** 4, 5, 13, 15, 23, 31, 32, 39, 47, 53, 55, 57, 59 — 13 features (31 and 32 only partly: see the report).
* **NEW (implemented here):** 14, 34, 35, 36, 37, 38, 60 — 7 features.

Final status of each feature, the files touched, the measured cost and what is still open: `dev/notes/world-alive-60-report.md`.
