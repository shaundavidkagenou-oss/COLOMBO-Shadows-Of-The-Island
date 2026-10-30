import './node-dom-stub.mjs';
const THREE = await import('three');
const { Character, HEROES } = await import('../src/actors/Character.js');
for (const id of ['dineth', 'shashika', 'david']) { const t0 = Date.now(); const ch = new Character(HEROES[id]); const t1 = Date.now();
  const g = ch.head.geometry; console.log(id, 'build ms', t1 - t0, 'verts', g.attributes.position.count, 'tris', g.index.count / 3, 'groups', g.groups.length, 'mats', ch.head.material.length, 'morphs', g.morphAttributes.position.length, 'eyes', ch.eyes.length, 'glasses', !!ch.glasses);
  let bad = 0; for (const v of g.attributes.position.array) if (!Number.isFinite(v)) bad++; console.log('  nonfinite', bad, 'body groups', ch.mesh.geometry.groups.map((x) => x.count).join(','));
  for (let k = 0; k < 20; k++) { ch.face.blink = 0.06; ch.face.update(1 / 60); } console.log('  infl', Array.from(ch.head.morphTargetInfluences).map((v) => v.toFixed(2)).join(' '));
}
