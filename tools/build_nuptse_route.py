"""Add the game's authored Nuptse north-face branch to existing terrain assets.

The Western Cwm approach and north rib are inspired by published ascent accounts;
waypoints and fixed camps are gameplay guides, not a surveyed climbing itinerary.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, minimum_filter

from build_assets import build_route, local_max, sample
from demlib import ll_to_xz, xz_to_ll

ROOT = Path(__file__).resolve().parent.parent


def build_nuptse_route(core, grid, main_path, main_tags, confidence=None):
    # Use the same encoded heights for a full rebuild and a route-only rebuild.
    core = np.round(core * 4).astype(np.float64) / 4
    # Plan at 8 m on the native terrain; keep the summit on its actual DEM node.
    stride = max(1, round(8 / grid['cell']))
    planning = gaussian_filter(core[::stride, ::stride], .7)
    plan = dict(grid, cell=grid['cell'] * stride,
                nz=planning.shape[0], nx=planning.shape[1])
    slopes = np.hypot(*np.gradient(planning, plan['cell']))
    penalty = np.ones_like(planning)
    if confidence is not None:
        penalty += 1e6 * (confidence < .99999)
    # Favour gentle ground across the Cwm before the north-face climb.
    penalty += (planning < 6400) * 2000 * np.maximum(0, slopes - .5)**2
    x, z = ll_to_xz(27.967, 86.886)
    summit = local_max(core, grid, x, z, 350)
    junction = np.round(main_path[main_tags['c2']], 1)
    # A continuous least-cost line avoids forcing dead-end detours at intermediate
    # guides. Place camps and landmarks by elevation on that measured line.
    waypoints = [('c2', *junction), ('nuptse', *summit[:2])]
    path, tags = build_route(planning, plan, waypoints, slope=slopes, penalty=penalty)
    path[0], path[-1] = junction, summit[:2]
    tags['c2'], tags['nuptse'] = 0, len(path) - 1
    height = sample(core, grid, path[:, 0], path[:, 1])
    distance = np.r_[0, np.cumsum(np.hypot(*np.diff(path, axis=0).T))]
    start = int(np.searchsorted(distance, 400))
    for tag, elevation in [('nuptse_bergschrund', 6500), ('nuptse_c3', 6800), ('nuptse_rib', 7400)]:
        index = start + int(np.argmin(abs(height[start:-1] - elevation)))
        tags[tag] = index
        start = index + 1
    return path, tags


def main():
    from pleiades import GeoRaster, checksum
    meta = json.loads((ROOT / 'assets/terrain/meta.json').read_text())
    route = json.loads((ROOT / 'assets/route.json').read_text())
    grid = meta['core']
    rgb = np.array(Image.open(ROOT / 'assets/terrain/core.png'))
    core = (rgb[..., 0].astype(np.uint16) * 256 + rgb[..., 1]) / 4.
    source = ROOT / 'dem' / meta['provenance']['file']
    if checksum(source, 'md5') != meta['provenance']['md5']:
        raise ValueError('Source checksum does not match terrain provenance')
    stereo = GeoRaster(source, feather=40)
    xs = grid['x0'] + np.arange(0, grid['nx'], 2) * grid['cell']
    zs = grid['z0'] + np.arange(0, grid['nz'], 2) * grid['cell']
    X, Z = np.meshgrid(xs, zs)
    lat, lon = xz_to_ll(X, Z)
    confidence = minimum_filter(stereo.weight(lat, lon), size=5)
    path, tags = build_nuptse_route(core, grid, np.array(route['main']['points']),
                                  route['main']['tags'], confidence)
    points = np.round(path, 1)
    lat, lon = xz_to_ll(*points.T)
    if stereo.weight(lat, lon).min() < .99999:
        raise ValueError('Nuptse route crosses incomplete stereo coverage')
    route['nuptse'] = dict(points=points.tolist(), tags=tags,
                           note='Authored north-face branch from Camp 2; not a surveyed climbing itinerary.')
    (ROOT / 'assets/route.json').write_text(json.dumps(route) + '\n')
    print(f'Nuptse: {len(path)} points, {np.hypot(*np.diff(path, axis=0).T).sum()/1000:.2f} km')
    for tag, i in tags.items():
        print(f'  {tag}: {sample(core, grid, [path[i, 0]], [path[i, 1]])[0]:.1f} m at {path[i].tolist()}')


if __name__ == '__main__':
    main()
