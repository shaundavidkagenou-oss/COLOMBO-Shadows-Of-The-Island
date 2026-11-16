# COLOMBO: SHADOWS OF THE ISLAND

A third-person open-world action-adventure set in a compressed but recognisable Colombo, Sri Lanka, by **Shaun David Studios**.

It runs in the browser on Three.js and Vite. Everything in the world is procedural and original: the city, characters, vehicles, weapons, textures and audio. No third-party game assets are used. The three protagonists' head meshes (shape, eyelids, lips, ears, teeth, expression morphs) are baked from the [MakeHuman / MPFB2](https://github.com/makehumancommunity/mpfb2) base mesh and targets, which are released under CC0 1.0. Only the CC0 data is used, not MPFB's GPL code: see `tools/mh/` (`npm run`-free scripts: `node tools/mh/fetch-makehuman.mjs` then `node tools/mh/bake-hero-heads.mjs` regenerate `src/actors/heroHeadData.js`). The studio logo (`public/assets/brand/sds-logo.jpg`) is the official brand asset and is shown unaltered.

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

## Windows .exe (desktop build)
Double-click **`build-exe.bat`** in the project folder (Windows 10/11 x64, [Node.js 18+](https://nodejs.org), internet the first time). It installs the packages, builds the game, wraps it in Electron and writes:

- `desktop/release/COLOMBO-Shadows-of-the-Island-1.0.0-portable.exe`: a single file you can run directly.
- `desktop/release/COLOMBO-Shadows-of-the-Island-1.0.0-setup.exe`: an installer with Start-menu and desktop shortcuts.

The desktop build is the same game as the browser version. It is served from a private `app://` origin, so save games are kept between launches. F11 toggles fullscreen. The first run downloads roughly 250 MB (Vite, Electron, electron-builder). The `.exe` is not code-signed, so Windows SmartScreen may ask you to confirm with *More info → Run anyway*.

**If the build stops with `getaddrinfo ENOTFOUND github.com`:** your network could not resolve github.com, where Electron's packaging tools are downloaded from. The script handles this by itself:
1. It packages with the Electron that npm already installed (`desktop/node_modules/electron/dist`), so Electron is not downloaded a second time.
2. If github.com still cannot be reached, it retries the downloads through the npmmirror.com mirror (`ELECTRON_MIRROR`, `ELECTRON_BUILDER_BINARIES_MIRROR`).
3. If that also fails, it builds `desktop/release/win-unpacked/COLOMBO Shadows of the Island.exe` with no download at all, plus a zip of that folder. Keep the folder together; this version uses the default Electron icon.

Switching the PC's DNS to 1.1.1.1 or 8.8.8.8, or using another connection, then running the script again gives the single-file and installer versions.

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

1. **Trigger:** tap **Z** for the next squad-mate, or **F1 / F2 / F3** to pick one directly. Hold **Z** for the selector: time slows to 30% and a three-card strip shows each character's portrait, health and status. Choose with A/D, the mouse or the wheel; release Z to switch. Squad-mates take no orders. On a gamepad, tap or hold **LB**.
2. **Departure:** the character you leave reacts to context:
   - on the move: a glance back over the shoulder, then keeps going;
   - under threat (police, guards, pursuers or a drawn weapon): drops into cover and holds that spot;
   - otherwise: a wrist-comms tap, or a brief crouch when next to a wall.
3. **Camera:** within 250 m with a clear line of sight, the camera flies a Bezier arc (0.55–1.15 s) with a FOV punch (60→95→60) plus radial motion blur and chromatic split. When farther or blocked, it does a 0.22 s glitch jump-cut. Settings → Camera → *Squad switch transition* can force either.
4. **Arrival:** the incoming character does a takeover move: Dineth pulls his gloves tight, Shashika tightens his vest straps, David pushes his glasses up, or a crouched character rises. If they were armed or there is a threat, they bring their primary up and check it instead: Dineth and Shashika rack the charging handle; David works the bolt (a press-check with the pistol). Control returns at 70% of the move.

The two inactive characters never tag along on their own. Each gets on with his own life: Dineth drives his three-wheeler, Shashika works at Lanka Auto Care in Maradana, David runs his phone-repair stall in Pettah.

**Calling a friend (phone → Contacts):**
- Call Shashika, David or Dineth (whoever you are not playing) and ask him to come along. He names a pickup spot: the kerb outside his work, or, for Dineth out in his tuk, the landmark nearest to him. The spot gets a pickup marker on the map and a GPS route.
- He waits there at the kerb, facing the road. Pull up beside him in a car, tuk or van with a free seat and stop. He walks to the passenger side and steps in (the same step-in as the player and police crews; rear seats still use the simpler slide).
- On foot he won't come ("Where's the car?"), and on a motorbike he says there's no room. Nobody comes while the police are after you.
- Once picked up, he rides along, gets out with you and follows you on foot (formation, using your trail when the direct line is blocked).
- Call him again to send him off: he goes back to his own day, getting out of the car at the next stop. If he's still waiting, "Never mind" cancels the pickup.
- Switching to a mate who is with you keeps the one you leave in the group. Switching to anyone else sends everyone home. After loading a save, everybody is back at work.

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
| Z (hold) | Squad selector (slow motion; A/D choose) |

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

## Boats and Fort Harbour Marina

**The marina** sits in the north-west corner of the harbour, below the Fort quay. A gangway runs down from the quay onto floating pontoons: a head walkway, a spine with finger berths on both sides (W1–7 and E1–7), two big alongside berths for yachts (Q1/Q2) and a T-head at the end. The marina office is at the top of the gangway. Other people's boats are moored there. Now and then an owner walks down, boards, takes his boat out of the harbour and later brings it back and ties it up.

**Your berth:** buy Berth T-1 at the office counter, or on fortharbourmarina.lk (Rs. 3,500,000). Boats are delivered only to your berth.

**Buying boats:** three shops on the phone's Global app:
- **Ceylon Blue Yacht Brokers** (ceylonblueyachts.lk): 5 luxury yachts.
- **Lanka Marine Mart** (lankamarinemart.lk): 10 boats (a centre-console, a bowrider, a RIB, an offshore powerboat, a wakeboard boat, a daysailer, a fibreglass fishing boat, an oruwa outrigger sailing canoe, a cabin cruiser and a sport-fishing yacht).
- **Wave Rider Lanka** (waveriderlanka.lk): 4 jet skis.

After you order, the shop texts you to say thanks for the purchase and that delivery is coming. After you sleep, or on the next day, a second text says the boat has been delivered to your berth. If you own more than one, use the service pedestal on the T-head to switch which boat is alongside. The same pedestal brings your boat back if you left it somewhere.

**Riding:** walk to the boarding point and press Enter. W/S is throttle and reverse, A/D steers, E raises or furls the sails (sailing yachts only), the lights key toggles the navigation lights, and Enter gets off when you are slow. Near a pontoon you step onto it; at sea you go over the side into the water. Boats ride the waves, heel, plane and slam, and leave a wake that spreads and fades. Hitting the quay, pontoons or another boat is a collision.

**Damage:** bullets hit the hull, cabin and engine on the same scale as a car body, and engine hits count for more. Enough hits and the boat catches fire, burns and sinks. Bullets go through sails and leave holes, and the holes rip into tears. Shooting at a harbour police boat raises your wanted level.

**Harbour police:** with no wanted level, one or two police boats (two officers each) patrol the harbour and the Fort / Galle Face coast in the morning (06:00–11:00) and at night (19:00–04:30). At night their navigation lights and blue/red beacons are on. When you become wanted, the patrol heads off.

**Lights:** sidelights, a stern light, a masthead/steaming light, anchor lights, deck floodlights, lit cabin windows, underwater lights on yachts and police beacons. Each sits at its real place on its model, and all the lamps are drawn together in one draw call. The marina has its own pontoon lights.

**Global app:** the start page is now a search bar plus bookmarks. Search finds sites, articles and every boat for sale. Black Orchid is not on the start page: you find it only by searching (for example "hitman", "bodyguard", "black orchid") or by typing blackorchid.lk.

**Debug menu → Boats & marina:** spawn any yacht, boat, jet ski or the police boat; marina teleports; a free berth and free orders; deliver now; give every boat; switch the boat at the berth; damage, wreck or holes in the sails of the nearest boat; force the police patrol; make an owner take a boat out or bring one back.

## Export the cinematic trailer as an MP4
Double-click **`export-trailer-mp4.bat`** (Windows 10/11, [Node.js 18+](https://nodejs.org), Google Chrome or Microsoft Edge installed, internet the first time). It builds the game, then renders the OFFICIAL CINEMATIC TRAILER **offline, frame by frame**, and writes `COLOMBO-Official-Cinematic-Trailer-1080p60.mp4` in the project folder (Explorer opens on it when done).

- **Smooth whatever the PC's speed:** the game clock is stepped exactly 1/60 s per frame and every frame is captured, so there are no dropped or doubled frames even when a frame takes seconds to render. A full export takes much longer than 146 s — every one of the 8,760 frames is rendered and encoded one by one, so expect tens of minutes (this export time has not been measured on a GTX 1660 Super; it depends on the GPU, the CPU and the quality preset).
- **Sound in sync:** the trailer's music, dialogue and effects are rendered by an offline audio context that is advanced in step with the picture, then muxed as 320 kbit/s AAC.
- **Default output:** 1920×1080, 60 fps, H.264 (x264 `slow`, CRF 16), using the game's Ultra preset. The length is exactly 146 s.
- **Options** (add after the script name, or run `node tools/trailer-export/export.mjs …` directly): `--width 2560 --height 1440`, `--fps 30`, `--crf 12` (lower = higher quality, bigger file), `--lossless`, `--quality high`, `--out my.mp4`, `--nobuild` (reuse the last build), `--show` (watch the browser render).
- ffmpeg comes from the `@ffmpeg-installer/ffmpeg` npm package (no separate download). Set `CHROME_PATH` to use a specific browser, or `FFMPEG_PATH` for your own ffmpeg.
- Exports run the real game in a hidden browser window with the trailer's own cameras. They do not touch your save games or settings.

## Credits
- **Motion capture:** the idle, talk, argue, point, shrug and stand-up layers on the characters are retargeted from the CMU Graphics Lab Motion Capture Database (BVH conversion by Bruce Hahne). *The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.*
- **Vehicle models:** Sketchfab and ztark-tint-visualizer models under CC BY 4.0 (logos removed), as listed in `public/assets/vehicles/CREDITS.md`.

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
- **Driver door (cars, taxis, sedans, SUVs, vans, police cars/jeeps):** the body side is cut open around the door (`sideBody` `cut`). The cap is clipped around the door rectangles, notched around the front arch on vans, and the shoulder over the door is removed. Painted jamb walls line the opening.
- The door's outer skin is the exact piece of body surface that was removed (same taper and rounded shoulder, smooth normals), with 5 mm shut lines. It has edge faces, a belt weatherstrip, an inner door card with armrest, pull handle and speaker, its own handle and key cylinder, window glass and rain visor, and the police bands or taxi stripe.
- Nothing of the door is left on the body when it swings open. `tools/door-test.mjs` (part of `npm test`) checks this, along with flushness, swing clearance and a clear doorway, for every type and colour.
- **Door motion:** a damped spring. Opening pops off the latch, swings out and bounces lightly on the check strap. Closing accelerates into the latch and slams, with a thump and latch sound scaled by closing speed. A resisting driver produces a smooth tug-of-war, not a jitter.
- **Suspension:** the body sits on under-damped springs (`Vehicle.settle`, about 1.6 Hz). The driver's side settles about 1 cm when someone sits in and rises back on exit. A door slam rocks the body. The wheels counter-move so the tyres stay on the road.

**Weapons (`src/combat/`):** `WeaponModels.js` holds the models; `Weapons.js` handles the logic, aiming, reloads, effects, reactions and heat.

**Coordinates:** metres, with x = east and z = south.

## Known limitations

These were observed during testing.

**Characters:**
- They are procedural meshes rather than scanned or sculpted models. Up close they are stylised: blocky torso, simplified hands and hair.
- Only the driver's door is a real opening door. The passenger and rear doors (and the van's sliding door) are still shut lines and handles on the body, and occupants on those sides get in and out without opening them.

**Police and combat:**
- Weapons are disabled indoors.
- First-person aim is checked visually: the sights land on screen centre in renders. A numeric sight-to-camera-ray check in the harness disagreed with the rendered frames, so the exact alignment error is unmeasured.

**Squad:**
- You can't switch while wanted, indoors, in dialogue, in a cutscene or in the air (switching in a vehicle is allowed).
- A picked-up mate uses direct steering plus your breadcrumb trail, not a full navmesh. In dense alleys they can fall behind and then catch up off-screen.
- The departure and arrival moves are procedural poses on the same rig, not motion capture.

**World:**
- The camera can clip under shop canopies.
- A few balconies float slightly off the facade.

**Missions:**
- A failed mission restarts automatically after 8 seconds.
- The first objective's rain prompt also shows in clear weather.

**Boats and marina:**
- Marina skippers steer by waypoints with a simple pivot/thruster model, not a planner. Big catamarans (trinco44) can take 3–4 minutes to come into an E berth, and a boat that stays boxed in for 25 s gives up its departure or is moved to the start of its route out of sight.
- The automated ride test drives in open harbour. Leaving the marina is covered by the AI departure checks, not by a player-driven run.
- Bullet holes in sails are small; past about 50 m they are hard to see.
- Wakes, bow waves and lamp reflections are lit with the scene's sun, sky and lamp colour. They have only been checked in software-rendered screenshots.

**Performance:** frame rate on real GPUs has not been measured. All automated runs used a software (SwiftShader) renderer.
