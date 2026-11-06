#!/bin/sh
# Compress the built models in place (a third of the size; the game decodes them: js/render/gltf.js). Run after tools/assets/build.py. Packing a packed file is harmless.
#   sh tools/pack-assets.sh [names...]
cd "$(dirname "$0")/.." || exit 1
[ $# -gt 0 ] || set -- craft capital capital-decks props city items common family
for n in "$@"; do
  npx -y @gltf-transform/cli@4 meshopt "assets/$n.glb" "out/$n.packed.glb" --level medium --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14 2>&1 | grep -v "Skipping TEXCOORD" | tail -1 && mv "out/$n.packed.glb" "assets/$n.glb"
done
