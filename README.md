# COLOMBO: SHADOWS OF THE ISLAND

A third-person open-world action-adventure set in a compressed but recognisable Colombo, Sri Lanka, by **Shaun David Studios**.

It runs in the browser on Three.js and Vite. Everything in the world is procedural and original: the city, characters, vehicles, weapons, textures and audio. No third-party game assets are used. The studio logo (`public/assets/brand/sds-logo.jpg`) is the official brand asset and is shown unaltered.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (bound to 0.0.0.0)
npm run build        # production build to dist/
npm run preview      # serve dist/ on :4173
npm run test:smoke   # 12 headless checks (world, roads, places, characters, vehicles, saves, build)
```

**Requirements:** Node 20+ and a WebGL2 browser. Desktop Chrome, Edge or Firefox is recommended.

Pick a preset under Settings → Graphics: Low, Medium, High or Ultra.

**Dev viewers:**
- `/dev/characters.html`: character lineup.
- `/dev/vehicles.html`: all vehicle types, inspectable from any angle.
- `/dev/weapons.html`: all nine weapon models. Use `?only=<id>` for one weapon and `?side=1` for side views.

## The city

**Districts:** Fort, Pettah, Galle Face, Beira Lake / Lotus Tower, Slave Island, Kollupitiya, Cinnamon Gardens, Bambalapitiya, Wellawatte, Borella, Maradana, Kotahena and the port.

**Real anchors:**
- **Roads:** Galle Road, Marine Drive, Main Street, Front Street, York Street, Janadhipathi Mawatha.
- **Waterfront:** Galle Face Green and promenade; Beira Lake with its embankment.
- **Landmarks:**
  - Lotus Tower (green fluted stem, magenta bud, mast, LED night lighting).
  - Old Parliament and colonial Fort blocks.
  - Pettah bazaar streets, the harbour cranes, the railway and stations.
- **Traffic:** left-hand traffic with tuk-tuks, cars, taxis, vans, SUVs, CTB and private buses, lorries and motorbikes.
- **Signage:** shop and street signs in correct Sinhala, Tamil and English.

## Story

Three Sri Lankan protagonists, all original characters:

| | Role | Loadout | Strengths |
|---|---|---|---|
| **Dineth Jayasekara** | Agile · Streetwise | Service Pistol, Carbine | sprints faster, more stamina |
| **Shashika Wijesinghe** | Tactical · Heavy | Heavy Pistol, Assault Rifle, Battle Rifle | plate carrier (takes 30% less damage), steadier aim |
| **David Rodrigo** | Precision · Technical | Compact Pistol, three sniper rifles | steadiest scope |

The opening cinematic, *The Meeting*, shows Dineth back in Colombo after seven years, meeting Ruwan in the rain near Fort. Later in that mission Shashika (Dineth's cousin) and David are waiting at Dineth's old room in Slave Island, and the squad forms. From then on you can switch between the three.

**Missions:**

| # | Mission | Giver | Lead |
|---|---|---|---|
| 0 | The Meeting | Ruwan | Dineth |
| 1 | Galle Face After Dark | Ruwan | Dineth |
| 2 | Paper Trail | Ruwan | Dineth (free switching for the warehouse photo) |
| 3 | The Courier | Ruwan | David (free switching for the sneak and the escape) |
| 4 | Rain Run | Anjali Fernando | Shashika |
| 5 | Lotus Tower | Dilan Wickramaratne | Dineth (free switching on the final run) |

When the mission lead isn't the active character, the start marker says so and switches are limited to the lead until a free-switching section.

Mission 5 has a three-way ending choice. There are also side activities, an economy, enterable interiors, day/night, monsoon weather, and save/load with slots.

## Squad switching

This is not a sky zoom and not a radial wheel. It is a short "tactical seamless transition":

1. **Trigger:** tap **Z** for the next squad-mate, or **F1 / F2 / F3** to pick one directly. Hold **Z** for the selector: time slows to 30% and a three-card strip shows each character's portrait, health and status. Choose with A/D, the mouse or the wheel; **E** toggles hold/follow for the highlighted member; release Z to switch. On a gamepad, tap or hold **LB**.
2. **Departure:** the character you leave reacts to context:
   - on the move: a glance back over the shoulder, then keeps going;
   - under threat (police, guards, pursuers or a drawn weapon): drops into cover and holds that spot;
   - otherwise: a wrist-comms tap, or a brief crouch when next to a wall.
3. **Camera:** within 250 m with a clear line of sight, the camera flies a Bezier arc (0.55–1.15 s) with a FOV punch (60→95→60) plus radial motion blur and chromatic split. When farther or blocked, it does a 0.22 s glitch jump-cut. Settings → Camera → *Squad switch transition* can force either.
4. **Arrival:** the incoming character does a takeover move: Dineth pulls his gloves tight, Shashika tightens his vest straps, David pushes his glasses up, or a crouched character rises. If they were armed or there is a threat, they bring their primary up and check it instead: Dineth and Shashika rack the charging handle; David works the bolt (a press-check with the pistol). Control returns at 70% of the move.

The two inactive characters keep moving with the AI:
- they keep the heading and speed they had when you left them;
- they follow in formation, using your trail when the direct line is blocked;
- they hold position when ordered;
- they ride along in vehicles and get out with you;
- they catch up when left far behind.

Saves (format v3) store each character's position, health, ammo, outfit and orders. Older v2 saves are migrated automatically: Dineth keeps his own loadout's ammo, and the squad counts as formed if *The Meeting* was finished.

## Controls (keyboard + mouse; all rebindable in Settings → Controls; gamepad supported)

| On foot | | Vehicles | |
|---|---|---|---|
| WASD | Move | F | Enter / exit (animated; occupied vehicles: driver reacts) |
| Shift | Sprint | W / S | Accelerate / brake-reverse |
| Space | Jump | A / D | Steer |
| C | Crouch | Space | Handbrake |
| E | Interact / talk | H | Horn |
| Q | Insult | L | Lights |
| G | Shove | R | Radio (in a vehicle only) |
| T | Emote | V | Camera |
| P / M / J | Phone / map / journal | Esc | Pause |

| Weapons (on foot) | |
|---|---|
| Hold Tab | Weapon wheel (nine slots) |
| 1–9 / mouse wheel | Select weapon |
| X | Holster / draw |
| Right mouse | Aim (over the shoulder; snipers zoom into the scope) |
| Left mouse | Fire (the first click draws the selected weapon) |
| R | Reload. If pressed mid bolt-cycle or mid-draw, it is queued. |
| V (cycle to first person) | First-person view, with the real body and hands visible and aiming down the weapon's real sights |

| Squad | |
|---|---|
| Z (tap) / F1–F3 | Switch to the next member / a specific one |
| Z (hold) | Squad selector (slow motion; A/D choose, E hold/follow) |

R is context-separated. Weapons are always holstered in a vehicle, and the radio only works in one, so the two never overlap.

## Weapons (nine, all original procedural models, held with two-hand IK)

| Weapon | Mag / reserve | Mode | Notes |
|---|---|---|---|
| Compact Pistol | 10 / 60 | semi | fast, light recoil |
| Service Pistol | 15 / 90 | semi | balanced |
| Heavy Pistol | 8 / 48 | semi | slow, heavy hitting |
| Carbine Rifle | 30 / 180 | auto | high rate |
| Assault Rifle | 30 / 180 | auto | balanced |
| Battle Rifle | 20 / 120 | auto | heavy, strong recoil |
| Bolt-Action Sniper | 5 / 30 | bolt | 5× scope, bolt cycling |
| Semi-Auto Sniper | 10 / 50 | semi | 4× scope |
| Precision Sniper | 7 / 35 | bolt | 7× scope |

**Weapon handling:**
- Equip and holster animations: pistols go to a hip holster, long guns to a back sling. The safety flicks off once the weapon is up, and on before it is stowed.
- Spring-damper dynamics:
  - each shot kicks the weapon back and the muzzle up;
  - the camera climbs and then recovers about 65% of the kick;
  - the weapon lags fast camera turns;
  - it bobs with the gait;
  - it breathes faster when you are winded;
  - crouching and aiming steady all of the above, and the character's perk scales it.
- ADS moves along a Bezier path with cubic easing: pistols come up and punch out, long guns lift and settle into the shoulder.
- Reloads:
  - **Tactical** (rounds left): the partly used magazine goes into the pouch and a fresh one is seated. The chambered round stays (mag +1), and it is 15% faster.
  - **Empty:** the slide or bolt locks back on the last round. The spent magazine drops free and lands on the ground (stays 30 s). A fresh magazine follows, then a slide-release thumb flick (pistols) or the charging handle (rifles).
- Finger articulation: the index finger rests along the frame until you aim; there is a real trigger pull per shot. The support hand opens to fetch a magazine, grips it, and pinches the charging handle.
- Per-weapon sounds, muzzle flash, tracers, shell ejection and impacts. The HUD weapon card shows ammo and the reload type.

**NPC reactions:** pedestrians react non-graphically. They stumble, go down, cower or flee. Witnesses report to the police, which raises heat stars. There is no gore or injury detail.

## Technical notes

| Area | Files |
|---|---|
| World generation | `src/world/` (`Layout.js` road grid/districts, `CityPlan.js` buildings, `BuildingGen.js`, `GroundBuilder.js`, `Landmarks.js`) |
| Rendering | `src/gfx/` |
| Characters / crowd | `src/actors/` |
| Vehicles | `src/vehicles/` |
| Weapons | `src/combat/` |
| Story / missions | `src/story/` |
| UI | `src/ui/` |

**Rendering details (`src/gfx/`):**
- Physically based materials and an HDR sky with tone mapping.
- Bloom at night only, so daytime has no white veil.
- Interior mapping (`InteriorMapping.js`): every glazed facade pixel ray-casts into a virtual room behind the glass. The room has a floor, ceiling, walls, furniture silhouettes and blinds, and per-room lights at night. Windows therefore show parallax depth with no extra geometry.

**Characters (`src/actors/`):** a procedural skeleton with an animator providing gait blending, two-bone arm IK and a face rig (blinks, gaze, expressions, speech). The crowd has sidewalk routing, crossings, avoidance, stuck recovery, and staged reactions that recover back to the routine.

**Vehicles (`src/vehicles/`):** full bodywork with interiors, lights and door pivots, plus staged entry/exit.

**Weapons (`src/combat/`):** `WeaponModels.js` holds the models; `Weapons.js` handles the logic, aiming, reloads, effects, reactions and heat.

**Coordinates:** metres, with x = east and z = south.

## Known limitations

These were observed during testing.

**Characters:**
- They are procedural meshes rather than scanned or sculpted models. Up close they are stylised: blocky torso, simplified hands and hair.
- Vehicle doors open on pivots, but door apertures are not cut into the body shell.

**Police and combat:**
- Weapons are disabled indoors.
- First-person aim is checked visually: the sights land on screen centre in renders. A numeric sight-to-camera-ray check in the harness disagreed with the rendered frames, so the exact alignment error is unmeasured.

**Squad:**
- You can't switch while in a vehicle, indoors, in dialogue, in a cutscene or in the air.
- Followers use direct steering plus your breadcrumb trail, not a full navmesh. In dense alleys they can fall behind and then catch up off-screen.
- The departure and arrival moves are procedural poses on the same rig, not motion capture.

**World:**
- The camera can clip under shop canopies.
- A few balconies float slightly off the facade.

**Missions:**
- A failed mission restarts automatically after 8 seconds.
- The first objective's rain prompt also shows in clear weather.

**Performance:** frame rate on real GPUs has not been measured. All automated runs used a software (SwiftShader) renderer.
