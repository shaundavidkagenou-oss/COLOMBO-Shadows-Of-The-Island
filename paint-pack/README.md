# paint-pack/

The **Environment editor** saves its project here. Open the editor from the in-game console (`` ` ``) with `paint`. Like the other editors, it only runs with the dev server (`npm run dev`).

| File | What it is |
|---|---|
| `project.json` | The project document (`colombo.paint-project`, v1). It holds the imported assets, every material slot's PBR settings and maps, the layers (with visible and locked state), every placed and painted instance, brush presets and the editor settings. All paths in it are relative. |
| `assets/<sha256>.<ext>` | Imported files, byte-for-byte: models (GLB, GLTF + BIN, OBJ, FBX) and textures (PNG, JPG, WEBP, …). Each file is named by its SHA-256 hash, so a file is stored only once. |
| `backups/` | The previous `project.json` from every save (the last 40). |
| `trash/` | Files removed from the library. They are moved here and never deleted. |
| `compiled/scene.json`, `compiled/report.json` | The output and report of the last **COMPILE**. |

## Getting the scene into the game and the .exe

1. **Save** (Ctrl+S) in the editor. It writes `project.json` atomically. The game started with `npm run dev` loads the saved scene.
2. **COMPILE** in the editor. It saves, validates every model, texture and material reference, and writes `compiled/`. Any missing or damaged file is reported. Optionally it also runs `npm run build` and checks `dist/paint-pack/`.
3. Run `build-exe.bat`. Step 2/5 runs `tools/paint-pack-prep.mjs`, which does the same validation and compile, and stops with a report if something is missing. `npm run build` then copies `scene.json` and every file it references into `dist/paint-pack/`, which goes into the .exe.

Everything in this folder except this README is ignored by git. To share a scene, use **Export** in the editor: it makes a portable `.zip` with the models, textures, materials, layers and instances. **Import** in another copy restores it.
