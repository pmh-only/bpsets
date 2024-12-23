const { build } = require("esbuild")

build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  platform: 'node',
  bundle: true,
  minify: true
})
