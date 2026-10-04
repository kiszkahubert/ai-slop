"""Verify shipped terrain against the downloaded source files; no network.

Use after npm run build-assets. The raw DEM and geoid must exist in dem/.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from demlib import xz_to_ll
from pleiades import Fallback, GeoRaster, checksum, orthometric

ROOT = Path(__file__).resolve().parent.parent


def main():
    meta = json.loads((ROOT / 'assets/terrain/meta.json').read_text())
    provenance = meta['provenance']
    source = ROOT / 'dem' / provenance['file']
    geoid_path = ROOT / 'dem/us_nga_egm08_25.tif'
    assert checksum(source, 'md5') == provenance['md5']
    assert checksum(geoid_path) == provenance['vertical']['geoid_sha256']
    for name, expected in provenance['fallback']['sha256'].items():
        assert checksum(ROOT / 'tools/terrain-fallback' / name) == expected
    stereo = GeoRaster(source, feather=provenance['blending_metres'])
    geoid = GeoRaster(geoid_path, crop_lonlat=(86.6, 27.7, 87.1, 28.2))
    fallback = Fallback(ROOT / 'tools/terrain-fallback')
    result = {}
    rng = np.random.default_rng(6979691)
    for name in ['core', 'backdrop']:
        g = meta[name]
        rgb = np.array(Image.open(ROOT / f'assets/terrain/{name}.png'))
        assert rgb.shape == (g['nz'], g['nx'], 3)
        h = (rgb[..., 0].astype(np.uint16)*256 + rgb[..., 1])/4.
        assert np.isfinite(h).all() and h.min() > 0 and h.max() < 9000
        # Independent sparse reconstruction includes full stereo, seams and fallback.
        i = rng.integers(0, g['nx'], 10000)
        j = rng.integers(0, g['nz'], 10000)
        lat, lon = xz_to_ll(g['x0']+i*g['cell'], g['z0']+j*g['cell'])
        w = stereo.weight(lat, lon)
        raw = stereo.sample(lat, lon)
        low = fallback.sample(lat, lon, name)
        active = w > 0
        correction = np.zeros_like(raw)
        correction[active] = orthometric(raw[active], geoid.sample(lat[active], lon[active])) - low[active]
        expected = low + w*correction
        error = np.abs(h[j, i] - expected)
        assert error.max() <= .1255, f'{name} exceeds height-encoding quantisation: {error.max()}'
        result[name] = dict(samples=len(i), max_encoding_error_m=float(error.max()),
                            stereo_samples=int(np.sum(w > 0)), native_samples=int(np.sum(w >= .99999)))
    route = json.loads((ROOT / 'assets/route.json').read_text())
    for name in ['main', 'lhotse']:
        points = np.array(route[name]['points'])
        lat, lon = xz_to_ll(*points.T)
        w = stereo.weight(lat, lon)
        assert w.min() >= .99999, f'{name} crosses a stereo gap or blended boundary'
        result[name+'_route'] = dict(points=len(points), minimum_stereo_weight=float(w.min()))
    target = ROOT / 'tests/out/terrain-verification.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
