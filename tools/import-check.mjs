// verifies every named import in the touched files exists in its module (eslint no-undef does not check this)
import fs from 'fs'; import path from 'path';
const files = process.argv.slice(2); let bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    if (!m[2].startsWith('.')) continue; const tgt = path.resolve(path.dirname(f), m[2]); if (!fs.existsSync(tgt)) { console.log('missing file', f, m[2]); bad++; continue; }
    const t = fs.readFileSync(tgt, 'utf8');
    for (let n of m[1].split(',')) { n = n.trim().split(/\s+as\s+/)[0]; if (!n) continue;
      const re = new RegExp(`export\\s+(?:const|let|var|function\\*?|class|async function)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`); if (!re.test(t)) { console.log('NOT EXPORTED', n, 'from', m[2], 'in', f); bad++; } }
  }
}
console.log(bad ? `bad ${bad}` : 'imports ok');
