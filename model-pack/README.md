# model-pack/

Saved here by the in-game **model tools** and the **Map editor**. These tools only exist in development builds (`npm run dev`).

Console commands (open the console with `` ` ``):

- `models-weapons`
- `model-player`
- `model-vehicles`
- `model-npc`
- `map`, then *Add → Model*

| File | What it is |
|---|---|
| `manifest.json` | Versioned manifest (`colombo.model-manifest`, v1). It holds every edit: replacement models, part textures, materials and visibility for weapons, the three heroes, vehicles, trains and NPCs; imported animations; models placed on the map; and the Map editor's edits. |
| `<sha256>.<ext>` | Uploaded files, byte-for-byte as picked. Each file is named by its SHA-256 hash, so the same file is stored only once. Supported: models (GLB / GLTF + BIN / FBX / OBJ + MTL / DAE / STL / PLY / 3MF / USDZ), animations (BVH / FBX / GLB) and images (PNG / JPG / WEBP / …). |
| `backups/` | The previous `manifest.json` from every save (the last 40). |
| `trash/` | Files removed with the tools. They are moved here and never deleted. |

## Saving your work into the game

Press **💾 Save** in a model tool's title bar, or **Save** in the Map editor. The dev server writes the manifest atomically into this folder; the old manifest goes to `backups/`.

When you build, `npm run build` and `build-exe.bat` copy `manifest.json` into the game (`dist/model-pack/`), together with every file it references. The edits then apply in the built game and the .exe. The tools themselves are not part of those builds.

Everything in this folder except this README is ignored by git, because large model files do not belong in the repository. To share your work, copy the whole folder.

## Developer lock

The console command `DoneShaun$123$` writes `dev-lock.json` (`{"locked":true}`) into the project folder.

While that file says locked:

- The console and the Texture Studio are gone in this copy.
- They are also gone in every build made from it.

Typing the secret code during gameplay unlocks them again (it is not typed into the console; the console is gone).
