// Extension points for the development tools' runtime (68th, src/debug/ModelRuntime.js — loaded only when the model pack has
// edits). Each is null / empty unless that runtime is loaded, so the game pays one null check per built object.
//   weapon(group, def)     every weapon model built (player, squad, police, shop previews, loot)
//   vehicle(group, type)   every vehicle mesh built
//   character(ch)          every Character built (heroes, crowd, police, staff, previews)
//   preRender(dt)          after the frame's matrices are updated, right before drawing (replacement rigs follow the final pose)
export const HOOKS = { weapon: null, vehicle: null, character: null, preRender: new Set() };
