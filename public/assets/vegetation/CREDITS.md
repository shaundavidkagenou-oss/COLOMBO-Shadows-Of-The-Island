# Vegetation assets

| File | Source | Used for |
|---|---|---|
| `T_Ironwood_Leaves_BaseColor.jpg` | Supplied by the project owner (base colour only) | All tree / shrub / vine leaf cards (`MAT.leaves`, "Tree leaves" in Texture Studio) |

## How the leaf sheet is used

The image is a 4 × 2 sheet of single leaves on black:

* top row: healthy · scuffed · yellow-green · yellow spotted
* bottom row: torn · holed · brown dry · skeleton

`src/world/LeafAtlas.js` loads it once, resamples it to 768², turns the black background into alpha, and
uses it as the base colour of the single shared leaf material. The shader picks leaf cells per card, scatters
2 × 2 leaves inside each card (texture bombing), and tints them per species and per instance. Aged cells
(bottom row and the yellow ones) are picked rarely, so a crown reads healthy with the odd damaged leaf.

No roughness, normal or other maps are shipped. Add them in Texture Studio → **Tree leaves**; the
shader samples every map slot with the same per-leaf UVs as the base colour, so a sheet with the same
4 × 2 layout lines up automatically.
