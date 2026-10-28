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

The opening cinematic, *The Meeting*, shows Kavindu meeting Ruwan near Fort in the rain. He receives a folder, the title card appears, and control passes seamlessly to the player.

**Missions:**

| # | Mission | Giver |
|---|---|---|
| 0 | The Meeting | Ruwan |
| 1 | Galle Face After Dark | Ruwan |
| 2 | Paper Trail | Ruwan |
| 3 | The Courier | Ruwan |
| 4 | Rain Run | Anjali Fernando |
| 5 | Lotus Tower | Dilan Wickramaratne |

Mission 5 has a three-way ending choice. There are also side activities, an economy, enterable interiors, day/night, monsoon weather, and save/load with slots.

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
- Equip and holster animations: pistols go to a hip holster, long guns to a back sling.
- Staged reloads with the magazine out and back in.
- Per-weapon sounds, muzzle flash, tracers, shell ejection and impacts.
- Recoil and spread; a HUD weapon card shows ammo.

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
- The police react with heat stars and alerts only. There is no police pursuit AI yet.
- Aim pitch is approximated.
- Weapons are disabled indoors.

**World:**
- There are no trains running on the railway.
- The camera can clip under shop canopies.
- A few balconies float slightly off the facade.

**Missions:**
- A failed mission restarts automatically after 8 seconds.
- The first objective's rain prompt also shows in clear weather.

**Performance:** frame rate on real GPUs has not been measured. All automated runs used a software (SwiftShader) renderer.
