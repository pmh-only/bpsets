#!/bin/sh

cp $(which node) dist/bpsets
node script/build.js
node --experimental-sea-config sea-config.json
pnpx postject dist/bpsets NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2  --overwrite
