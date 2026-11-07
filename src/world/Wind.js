// Shared wind clock for swaying vegetation (trees, flower beds). Its own module so foliage code can use it without
// importing Vegetation.js (which pulls in the material/interior-mapping chain and would create an import cycle via Parks).
export const windUniform = { value: 0 };
// Sun direction (world, towards the sun) and colour×intensity for leaf translucency; written by Atmosphere every frame.
export const leafLight = { dir: { value: [0, 1, 0] }, col: { value: [0, 0, 0] } };
