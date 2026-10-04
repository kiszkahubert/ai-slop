# Frozen Copernicus fallback

These PNGs and metadata preserve the original `dev` terrain assets before the
Pléiades replacement. The new builder samples them only outside valid stereo
coverage and through a 40 m transition at its boundaries. Do not replace them
with newly generated Pléiades output: that would make rebuilds cumulative.

`core.png` is the former 15 m game grid; `backdrop.png` is the 160 m horizon grid.
Their elevation source is Copernicus GLO-30, with the original game's summit
corrections already included. Height encoding and grid coordinates are in
`meta.json`. The blue channel of the core supplies the authored glacier mask.

Copernicus GLO-30 DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH
2014–2018, provided under COPERNICUS by the European Union and ESA, distributed
via AWS Open Data.
