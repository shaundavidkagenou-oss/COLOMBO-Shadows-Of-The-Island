#!/bin/bash
# Downloads the source car models that tools/cars/build.mjs converts (into $CARSRC, default ~/carsrc), with their licence files.
# All CC BY 4.0 — credits in public/assets/vehicles/CREDITS.md. Needs an authenticated `gh` (GitHub blobs API: raw URLs of
# large files are not reachable from every sandbox).
#   bash tools/cars/fetch-sources.sh            fetch whatever is missing
set -e
DIR=${CARSRC:-$HOME/carsrc}; mkdir -p "$DIR"; cd "$DIR"
get() { # repo path out
  [ -s "$3" ] && return 0
  local sha; sha=$(gh api "repos/$1/contents/$2" --jq .sha) && gh api "repos/$1/git/blobs/$sha" -H "Accept: application/vnd.github.raw" > "$3.part" && mv "$3.part" "$3" && echo "$3 $(stat -c %s "$3") bytes"
}
# Toyota Corolla by Nieve5677 (sketchfab 723da379…) → ventra
get jaby12/DEALER-FLOW COROLLA-web.glb corolla.glb
get jaby12/DEALER-FLOW license.txt corolla.LICENSE.txt
# de-identified (badges / plates / baked logos removed) by ZTARK tint visualizer
Z=windowfilmresources-prog/ztark-tint-visualizer
get $Z web/assets/models/supra/supra.glb z_supra.glb            # Toyota Supra by Mpgs.studio3DModels (41b83cfb…) → raiden
get $Z web/assets/models/supra/LICENSE.txt z_supra.LICENSE.txt
get $Z web/assets/models/corvette/car.glb z_corvette.glb        # Chevrolet Corvette C7 by Martin Trafas (2b509d1b…) → vanta
get $Z web/assets/models/corvette/license.txt z_corvette.LICENSE.txt
ls -la "$DIR"
