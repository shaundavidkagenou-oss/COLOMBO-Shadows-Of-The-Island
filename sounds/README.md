# Custom sounds

Put your own recordings here to replace any sound in COLOMBO: Shadows of the Island. The easiest way is the in-game
**`sounds`** console command (press the backtick key and type `sounds`): pick a file for a sound, preview it, press **Save**.

* Running the game with `npm run dev`, the window saves straight into this folder.
* In a built copy (browser build or the .exe) it saves on that machine; **Export pack (.zip)** in the window gives you a zip
  to unzip in the project folder (it fills this folder).
* `npm run build` and `build-exe.bat` build every recording in this folder into the game, so the .exe ships with them.

File names are the sound id plus `.mp3`, `.wav` or `.ogg` (e.g. `gun.assault.mp3`, `siren.police.wav`). `sounds.json` (written
by the window) keeps each recording's display name and volume. Loops (engines, sirens, rotor, ambience, music) should be
seamless loops; engine recordings are pitched with the revs (record them at a fast idle).

| id | sound | type |
|---|---|---|
| `gun.compact` | Compact Pistol — gunshot | one-shot |
| `gun.service` | Service Pistol — gunshot | one-shot |
| `gun.heavy` | Heavy Pistol — gunshot | one-shot |
| `gun.carbine` | Carbine Rifle — gunshot | one-shot |
| `gun.assault` | Assault Rifle — gunshot | one-shot |
| `gun.battle` | Battle Rifle — gunshot | one-shot |
| `gun.bolt` | Bolt-Action Sniper — gunshot | one-shot |
| `gun.semi` | Semi-Auto Sniper — gunshot | one-shot |
| `gun.precision` | Precision Sniper — gunshot | one-shot |
| `gun.t56` | Police T-56 rifle — gunshot | one-shot |
| `reload.pistol` | Reload — pistol | one-shot |
| `reload.rifle` | Reload — rifle | one-shot |
| `reload.sniper` | Reload — sniper rifle | one-shot |
| `gun.cycle` | Bolt / slide cycling | one-shot |
| `gun.dry` | Dry fire (empty click) | one-shot |
| `gun.equip` | Weapon drawn / holstered | one-shot |
| `gun.scope` | Scope / aim in | one-shot |
| `gun.shell` | Shell casing on the ground | one-shot |
| `gun.hitmarker` | Hit marker | one-shot |
| `gun.ricochet` | Bullet ricochet | one-shot |
| `impact.metal` | Bullet hitting metal | one-shot |
| `punch.swing` | Punch — swing | one-shot |
| `punch.hit` | Punch — landed | one-shot |
| `punch.taken` | Punch — taken / blocked | one-shot |
| `grenade.pin` | Grenade — pin pulled | one-shot |
| `grenade.throw` | Grenade — throw | one-shot |
| `grenade.bounce` | Grenade — bounce | one-shot |
| `explosion` | Explosion | one-shot |
| `engine.car` | Engine — petrol car (loop) | loop |
| `engine.diesel` | Engine — diesel SUV / van / jeep (loop) | loop |
| `engine.heavy` | Engine — bus / lorry (loop) | loop |
| `engine.tuktuk` | Engine — three-wheeler (loop) | loop |
| `engine.bike` | Engine — small motorcycle / scooter (loop) | loop |
| `engine.bike250` | Engine — 250–750 cc motorcycle (loop) | loop |
| `engine.superbike` | Engine — superbike (loop) | loop |
| `turbo.bov` | Turbo blow-off | one-shot |
| `horn.car` | Horn — car | one-shot |
| `horn.small` | Horn — three-wheeler / motorcycle | one-shot |
| `horn.heavy` | Horn — bus / lorry | one-shot |
| `horn.dual` | Horn — Customs dual tone | one-shot |
| `horn.sport` | Horn — Customs sport | one-shot |
| `horn.air` | Horn — Customs air horn | one-shot |
| `horn.tune` | Horn — Customs musical | one-shot |
| `veh.crash` | Vehicle crash | one-shot |
| `veh.glass` | Window shattering | one-shot |
| `veh.glassCrack` | Window cracking | one-shot |
| `veh.tyreBurst` | Tyre burst | one-shot |
| `veh.doorOpen` | Car door — open | one-shot |
| `veh.doorSlam` | Car door — slam | one-shot |
| `siren.police` | Police siren (loop) | loop |
| `siren.ambulance` | Ambulance siren (loop) | loop |
| `heli.rotor` | Police helicopter — rotor & turbines (loop) | loop |
| `police.radio` | Police radio squelch | one-shot |
| `train.horn` | Train horn | one-shot |
| `train.bell` | Level-crossing bell | one-shot |
| `train.clack` | Wheels over rail joints | one-shot |
| `amb.city` | City traffic hum (loop) | loop |
| `amb.rain` | Rain (loop) | loop |
| `amb.sea` | Sea waves (loop) | loop |
| `amb.wind` | Wind (loop) | loop |
| `thunder` | Thunder | one-shot |
| `bird.crow` | House crow | one-shot |
| `bird.song` | Songbird | one-shot |
| `cricket` | Crickets (night) | one-shot |
| `fire` | Fire crackling | one-shot |
| `debris` | Debris landing | one-shot |
| `bread.tuk` | Bakery three-wheeler chime | one-shot |
| `footstep` | Footstep | one-shot |
| `phone.ring` | Phone ringing | one-shot |
| `ui.click` | Menu click | one-shot |
| `ui.hover` | Menu hover | one-shot |
| `ui.notify` | Notification | one-shot |
| `ui.success` | Success | one-shot |
| `ui.fail` | Failure | one-shot |
| `ui.collect` | Pick-up | one-shot |
| `ui.camera` | Camera shutter | one-shot |
| `music.explore` | Music — Free roam (day) (loop) | loop |
| `music.night` | Music — Free roam (night) (loop) | loop |
| `music.tension` | Music — Wanted (loop) | loop |
| `music.chase` | Music — Police chase (loop) | loop |
| `music.menu` | Music — Main menu (loop) | loop |
| `music.intro` | Music — Intro (loop) | loop |
| `music.radio1` | Music — Car radio — station 1 (loop) | loop |
| `music.radio2` | Music — Car radio — station 2 (loop) | loop |
| `music.club` | Music — Night club PA (loop) | loop |
