# 93rd: multi-core CPU upgrade (audit, design, status, measurements)

Target PC: Ryzen 5 5600X (6 cores / 12 threads), 16 GB, GTX 1660 Super, the existing Three.js WebGL renderer (unchanged).

## 1 · Audit (before)

| System | Thread before | Main-thread cost (profile*) | Decision |
|---|---|---|---|
| BankTex (bank 2K surfaces) | own ad-hoc Worker pool, loading screen only | none in play | **moved onto the shared pool class + thread budget** (same worker code, same results) |
| District streaming: building detail + window joinery generation (BuildingGen) | main thread, budgeted slices | **9.75 ms/frame** (`stepJob` 8.3) while driving | **moved to geometry workers** |
| Streaming merge (BatchedMesh / per-building batches) | main thread | most of what was left | per-building data precomputed in the worker; the main thread *adopts* the buffers (no second copy) |
| Traffic (`step`, `bodyGap`, lane logic) | main | 2.7 ms/frame | kept: tightly coupled to per-frame physics, collision and the player; a worker would add a frame of latency / snapshot drift |
| Traffic `updateParked` / `spawn` (vehicle model builds) | main | spikes 300–600 ms in `?test` runs | kept: scene-graph objects (meshes, materials, real-car GLB assets, door rigs with functions); the real game already pre-builds every shape on the loading screen (`warmModels`) |
| Crowd A* (`route`) | main | **0.065 ms/frame** | not moved: messaging + async latency would cost more than it saves |
| Crowd update / animation | main | 4.2 ms (anim 2.4) | kept: skinning/bones are scene-graph state |
| Vehicle physics | main | 0.27 ms (`Vehicle.drive`) | investigated, not moved: input → physics → camera must stay in one frame (a worker = +1 frame input latency or prediction/rollback); collision world would have to be duplicated |
| atmos.update | main | large in SwiftShader | GPU work (PMREM) under SwiftShader, not a CPU-worker target |

\* SwiftShader sandbox, 2 CPU threads, `dev/tmp/cpuprof.mjs` (relative numbers only).

## 2 · Design

* `src/core/WorkerPool.js` — the one pool class + thread budget. `auto` = `hardwareConcurrency − 3`, capped at 4 (12 → 4, 8 → 4, 6 → 3, 4 → 1, ≤ 3 → 0 = original main-thread paths). `hardwareConcurrency` is only an input. Loading-time pools (BankTex) `claimThreads()` from the same budget; `releaseThreads()` grows the long-lived pools back. Settings → Graphics → *CPU worker threads* (Auto / Off / 1–5) overrides it live.
* Protocol: `{id, kind, data}` → `{id, res, ms}`; one job per worker; the queue stays on the main thread so priority (distance to the player, windows +40 m) is re-evaluated whenever a worker frees up. Results are typed arrays **transferred** (never copied); building records go by structured clone without the fields the job never reads.
* SharedArrayBuffer: not used (no COOP/COEP headers in the dev server / desktop build). Transfer is the only path, so there is nothing to fall back from.
* Geometry workers (`src/world/GeoWorker.js`, `GeoJobs.js`): the same `BuildingGen` code on the same per-building seeds → **bit-identical** buffers, records, anchors and counters (`tools/cpu-workers-test.mjs` §2 hashes every buffer, BatchedMesh geometry table, bounds, cull ids). Up to `size + 1` chunks of each kind in flight. The main thread merges one detail and one window chunk at a time in the existing 2.5 ms slices, then staged reveal. Worker error → that chunk falls back to the main-thread job; 2 failures → main thread for good. Stale answers (edited / rebuilt / far behind) are dropped.
* `RangeBatch.adopt()` (three r186 only; other versions use the copying path): the worker returns the batch index (`vertexStart + rebased`, coarse-first), per-building boxes, spheres and occlusion boxes; the main thread fills the BatchedMesh geometry table directly instead of `addGeometry` copying tens of MB and computing bounds.
* No scene graph, WebGL or DOM in any worker.

## 3 · Diagnostics + benchmark

* CPU panel (`src/ui/CpuPanel.js`; Settings → Graphics → CPU diagnostics panel, console `cpu`): frame fps / avg / p99 / 1 % low / max, frames > 16.7 and > 33.3 ms, main-thread ms per frame (avg / p99 / max / > 8 ms), each pool's size, running / queued / done / failed / cancelled jobs, avg / max job ms, queue wait, jobs/s, messages, and each worker thread's busy share of the last 2 s **as timed inside the worker** (not OS per-core load — a browser cannot read that).
* CPU benchmark: Settings → Graphics → *Run CPU benchmark (A–E)* or console `bench [s] [warm] [ABCDE] cpu`. A = original main thread (0 workers), B–E = 2, 3, 4, 5 workers; scenario S drives a street-level chase camera round the Fort & Pettah circuit at 30 m/s; all streamed detail is dropped and the start area rebuilt before each configuration. Adds `workers, poolSize, over16, over33, mainMs, mainP99Ms, mainMaxMs, workerJobs, workerJobMs, workerJobMaxMs` to the JSON / CSV. The headless SwiftShader sandbox cannot give meaningful numbers for it (0.2 fps); it has to be run on the real PC.

## 4 · Measurements (sandbox: 2 CPU threads, 4 GB, SwiftShader; relative only)

Streaming main-thread time per step while driving at 30 m/s (`tools/cpu-workers-test.mjs`, 900 steps): **13.19 ms → 1.11 ms (1 worker) / 1.00 ms (2 workers)**; 33/33 chunks merged, 0 dropped, 0 failed, nothing missing.

Stutter scenarios (`tools/cpu-stutter.mjs`, 600 steps each, `Game.updatePlay` CPU time with rendering off, 0 vs 2 workers):

| Scenario | mean ms | p50 | p99 | max | > 16.7 ms | > 33.3 ms | sim fps | 1 % low fps |
|---|---|---|---|---|---|---|---|---|
| fast drive (Fort, 30 m/s) | 26.8 → 26.2 | 18.4 → 14.4 | 117 → 171 | 1183 → 2192 | 362 → 258 | 82 → 79 | 37.3 → 38.2 | 2.3 → 1.6 |
| unloaded sectors (Marine, all dropped) | 26.7 → 21.1 | 16.3 → 10.6 | 199 → 302 | 1068 → 723 | 293 → 173 | 76 → 50 | 37.5 → 47.3 | 2.5 → 2.1 |
| busy street (density 150 %, on foot) | 17.0 → 14.5 | 13.1 → 11.4 | 88 → 53 | 610 → 414 | 203 → 147 | 31 → 15 | 58.7 → 69.1 | 5.1 → 5.9 |
| rapid camera while driving | 26.8 → 22.6 | 18.7 → 12.4 | 144 → 210 | 221 → 818 | 358 → 206 | 100 → 62 | 37.3 → 44.2 | 5.8 → 2.2 |
| heavy vegetation (park) | 21.3 → 11.8 | 13.5 → 8.9 | 167 → 39 | 267 → 359 | 217 → 116 | 60 → 13 | 47.1 → 84.5 | 4.5 → 10.0 |
| fight night | 17.2 → 14.1 | 12.9 → 10.7 | 107 → 42 | 191 → 385 | 168 → 125 | 37 → 19 | 58.1 → 71.2 | 6.8 → 5.9 |
| race, 6 EXPERT rivals | 19.5 → 31.9 | 13.7 → 12.0 | 164 → 371 | 374 → 5813 | 205 → 185 | 50 → 57 | 51.2 → 31.3 | 4.0 → 0.7 |

Mean, p50 and frames over 16.7 ms improve in every scenario. The worst frames do not: they are SwiftShader `atmos.update` (the 5.8 s race frame), V8 major GC pauses (main isolate, 400-step drive: 114 mark-compacts / 3.9 s with 0 workers vs 117 / 4.7 s with 2) and swapping (the sandbox has 4 GB and the game uses ~3.4 GB; two runs were OOM-killed with workers). Here the 2 workers also share the only 2 cores with the main thread. On a 12-thread CPU they have cores of their own.

Memory: RSS stays flat over repeated drive / unloaded / camera passes with 2 workers (2.97–3.44 GB vs 3.34–3.48 GB with 0), so no leak. Each geometry worker holds its own copy of the city plan plus a ≤ 64 MB builder pool.
