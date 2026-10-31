// Shared wind clock for swaying vegetation (trees, flower beds). Its own module so foliage code can use it without
// importing Vegetation.js (which pulls in the material/interior-mapping chain and would create an import cycle via Parks).
export const windUniform = { value: 0 };
