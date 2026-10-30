# Headless scenario runner (dev only)

Renders the real game in headless Chromium (SwiftShader, no GPU) and runs scripted steps against `window.__game`
(available with `?test`). Used to verify gameplay visually and numerically during development.

```sh
mkdir -p ~/testenv && cd ~/testenv && npm init -y && npm i puppeteer-core@23 @sparticuz/chromium@131
node -e "const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023
cp <repo>/dev/headless/play.mjs . && LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp node play.mjs "http://localhost:5173/?test&quick=play" scenario.json 960 540
```

Software rendering is slow (1–5 min per scenario). Use `await g.stepSim(n, dt)` to advance the simulation
deterministically, `g.paused = true` + `g.player.camOverride = true` to frame screenshots.
