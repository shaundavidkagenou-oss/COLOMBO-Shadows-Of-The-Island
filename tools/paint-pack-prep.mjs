// Run by build-exe.bat before the game build: validates and compiles the environment editor's saved scene (console `paint`,
// paint-pack/project.json) exactly like the editor's COMPILE button, writes paint-pack/compiled/, and prints what the build
// will put into the game / the .exe. Exit code 1 (stops the .exe build) when the scene has errors — a model or texture file
// missing from paint-pack/assets, a damaged file, a glTF whose .bin / textures were not imported with it. No project = 0.
// `node tools/paint-pack-prep.mjs [dir]`
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDir, writeCompiled } from './vite/paintPack.mjs';

const D = path.resolve(process.argv[2] || fileURLToPath(new URL('../paint-pack/', import.meta.url)));
const say = (s) => console.log('      ' + s);
const r = compileDir(D);
if (!r) { say('No environment editor scene in paint-pack\\ - nothing to add.'); process.exit(0); }
const { report: R } = r; const C = R.counts;
for (const w of R.warnings) say('[paint] warning: ' + w);
if (!R.ok) { for (const e of R.errors) say('[paint] ERROR: ' + e); say(`[paint] ${R.errors.length} error(s) - the scene was NOT compiled.`); process.exit(1); }
writeCompiled(D, r);
say(`Environment editor scene: ${C.instances} placed / painted instance(s), ${C.assets} asset(s), ${C.materials} material(s), ${C.files} file(s) (${(R.bytes / 1048576).toFixed(1)} MB) - compiled into the game.`);
process.exit(0);
