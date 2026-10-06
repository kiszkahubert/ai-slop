# Bundled rock material

Marble Cliff 01 by Amal Kumar, Poly Haven:
https://polyhaven.com/a/marble_cliff_01

License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/
Provider license: https://polyhaven.com/license

Retrieved 6 October 2026. Source 1k JPG diffuse, OpenGL normal, roughness and
ambient-occlusion maps were downloaded from the URLs returned by
https://api.polyhaven.com/files/marble_cliff_01 and checked against its MD5 hashes.

| Source map | Original file MD5 |
| --- | --- |
| Diffuse | `1ab41940ad90d0b543730e4fba0bb01e` |
| OpenGL normal | `4e7f6ffcd7839f0e33256f572d040692` |
| Roughness | `91ed90d7ef9c5e91c2075da802bc84f0` |
| AO | `08bc5e308c4843547ca7befe38cd7949` |

`marble-cliff/albedo.jpg` is the diffuse map recompressed at quality 90.
`marble-cliff/surface.png` packs normal X/Y into R/G and roughness into B.
`marble-cliff/ao.png` holds AO separately. Both data images are opaque to prevent
canvas alpha premultiplication from altering the normal channels during resize.
Runtime preparation packs AO into the texture array's alpha channel.
Runtime array preparation reverses image rows to preserve the OpenGL UV basis,
resizes to the graphics preset, and darkens the albedo to 62% for the rock layer.
The source is a photographed material, not a survey of Everest's rock. The Yellow
Band and face-scale strata remain authored terrain layers. Missing files retain
the deterministic procedural fallback.
