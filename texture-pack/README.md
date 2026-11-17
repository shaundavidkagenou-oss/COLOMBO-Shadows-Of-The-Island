# texture-pack/

Saved here by the in-game **Texture Studio** (development builds: `npm run dev`, then pause menu → *Texture Studio*, or the console command `textures`).

| File | What it is |
|---|---|
| `manifest.json` | Versioned manifest (`colombo.texture-manifest`, v1): the texture library (content hashes, names, categories, sizes) and the replacement rules (which material, which slots, tiling / colour / settings). |
| `<hash>.<ext>` | The imported images, byte-for-byte as picked (PNG / JPG / WEBP / GIF / AVIF / BMP / KTX2 / DDS), named by their SHA-256 so the same image is stored once. |
| `backups/` | The previous `manifest.json` from every save (the last 30). |
| `trash/` | Images removed from the library (moved here, never deleted). |

Everything in this folder except this README is ignored by git: large images do not belong in the repository. To share a pack use the Studio's **Export pack (.zip)** and unzip it here (move the files out of its `textures/` folder), or upload the files to a web host and set the Studio's **Asset base URL**.

`npm run build` and `build-exe.bat` copy the manifest and every texture used by an enabled rule into the game (`dist/texture-pack/`), so the replacements apply in the built game and the .exe. The Studio itself is not part of those builds; `npm run build:studio` makes a build that does include it.
