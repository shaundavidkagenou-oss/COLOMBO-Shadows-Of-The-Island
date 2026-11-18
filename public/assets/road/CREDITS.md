# Road textures

`road007_*.jpg` are derived from the **Road007** 2K PBR set (Color, NormalGL, Roughness, Displacement) supplied for the
63rd request. The file naming (`Road007_2K-JPG_*`) is ambientCG's; ambientCG assets are released under CC0 1.0.

Regenerate from the source maps with `node tools/road007-prep.mjs <folder with the four Road007 maps>`; the script lifts
the painted lane lines out (the game paints its own markings per road class), flattens the lengthwise wear streaks, bakes a
light cavity term from the displacement into the albedo, packs roughness into G and writes 512² JPEGs here. The 2K source
maps are not kept in the repository.
