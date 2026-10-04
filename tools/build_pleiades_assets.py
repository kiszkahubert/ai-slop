#!/usr/bin/env python3
"""Build native 4 m terrain from the DOI 10.5281/zenodo.6979691 DEM.

python tools/build_pleiades_assets.py --pleiades dem/Khumbu_2017-03-23_DEM_4m.tif
Large input rasters stay untracked in dem/. Frozen Copernicus PNGs fill NoData.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, minimum_filter, map_coordinates, maximum_filter

from build_assets import (BACK, MAIN_WAYPOINTS, LHOTSE_WAYPOINTS, build_route,
                          local_max, sample, trace_crest)
from demlib import encode_png, ll_to_xz
from pleiades import Fallback, GeoRaster, build_grid, checksum

ROOT = Path(__file__).resolve().parent.parent
CORE = dict(x0=-10240, z0=-4608, cell=4, nx=3841, nz=2881)
SOURCE_MD5 = '44802a17c0272233d95e08188ca19488'


def covered_waypoints(waypoints, g, confidence):
    """Keep guides nearby while giving route smoothing clearance from stereo gaps."""
    result = []
    for tag, x, z in waypoints:
        ci, rj = int(round((x-g['x0'])/g['cell'])), int(round((z-g['z0'])/g['cell']))
        if confidence[rj, ci] < .99999:
            jj, ii = np.mgrid[max(0,rj-12):min(g['nz'],rj+13), max(0,ci-12):min(g['nx'],ci+13)]
            d = np.hypot(ii-ci, jj-rj)
            d[confidence[jj, ii] < .99999] = np.inf
            if not np.isfinite(d).any():
                raise ValueError(f'No complete stereo coverage near waypoint {tag or (x,z)}')
            k = np.unravel_index(np.argmin(d), d.shape)
            x, z = g['x0']+ii[k]*g['cell'], g['z0']+jj[k]*g['cell']
        result.append((tag, x, z))
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--pleiades', default=str(ROOT / 'dem/Khumbu_2017-03-23_DEM_4m.tif'))
    ap.add_argument('--geoid', default=str(ROOT / 'dem/us_nga_egm08_25.tif'))
    ap.add_argument('--fallback', default=str(ROOT / 'tools/terrain-fallback'))
    ap.add_argument('--out', default=str(ROOT / 'assets'))
    args = ap.parse_args()
    if checksum(args.pleiades, 'md5') != SOURCE_MD5:
        raise ValueError('The Pléiades raster checksum does not match Zenodo record 6979691')
    stereo = GeoRaster(args.pleiades, feather=40)
    if stereo.epsg != 32645 or stereo.sx != 4 or stereo.sy != 4:
        raise ValueError('Expected the 4 m UTM45N Pléiades raster')
    geoid = GeoRaster(args.geoid, crop_lonlat=(86.6, 27.7, 87.1, 28.2))
    fallback = Fallback(args.fallback)
    print('Sampling native 4 m core, converting h - N to EGM2008…', flush=True)
    core, coverage, glacier = build_grid(stereo, geoid, fallback, CORE, 'core')
    print('Sampling backdrop with the same height reference…', flush=True)
    back, back_coverage, _ = build_grid(stereo, geoid, fallback, BACK, 'backdrop')

    # Route planning uses an 8 m surface to bound A* work, not the rendering grid.
    # Mild smoothing avoids routing around individual ice blocks; terrain itself is unchanged.
    plan = dict(CORE, cell=8, nx=1921, nz=1441)
    planning = gaussian_filter(core[::2, ::2], .7)
    slopes = np.hypot(*np.gradient(planning, plan['cell']))
    confidence = minimum_filter(coverage[::2, ::2], size=5)
    # Match the game's 30 m exposure span. In the unroped Cwm, avoid steep side
    # slopes that the old coarse DEM hid. A clearance filter also protects the
    # resampled path when its corners are smoothed.
    jj, ii = np.indices(planning.shape, dtype=np.float32) * 2
    at = lambda j, i: map_coordinates(core, [j, i], order=1, mode='nearest')
    exposure = np.hypot(at(jj, ii+3.75)-at(jj, ii-3.75),
                        at(jj+3.75, ii)-at(jj-3.75, ii)) / 30
    exposure = maximum_filter(exposure, size=5)
    unroped_cwm = (CORE['x0']+ii*4 > -4850) & (CORE['x0']+ii*4 < -1275) & (planning < 7000)
    penalty = 1 + 100 * (confidence < .99999) + unroped_cwm * 2000 * np.maximum(0, exposure-.5)**2
    top = local_max(core, CORE, 0, 0, 150)
    crest = trace_crest(core, CORE, top, 850)
    crest_height = sample(core, CORE, crest[:, 0], crest[:, 1])
    # Locate the Balcony by its elevation on the measured crest, not its old DEM position.
    balcony_index = int(np.argmin(abs(crest_height - 8400)))
    crest = crest[:balcony_index + 1]
    crest_height = crest_height[:balcony_index + 1]
    crest_s = np.r_[0, np.cumsum(np.hypot(*np.diff(crest, axis=0).T))]
    balcony = tuple(crest[-1])
    main_waypoints = [w if w[0] != 'balcony' else ('balcony', *balcony) for w in MAIN_WAYPOINTS]
    main_waypoints = covered_waypoints(main_waypoints, plan, confidence)
    print('Tracing South Col route over the new slopes…', flush=True)
    main_path, main_tags = build_route(planning, plan, main_waypoints, tail=crest[::-1], slope=slopes, penalty=penalty)
    main_tags['everest'] = len(main_path) - 1
    # South Summit is the secondary crest high point after the intervening saddle.
    south_candidates = np.flatnonzero((crest_s > 300) & (crest_s < 500))
    south_index = int(south_candidates[np.argmax(crest_height[south_candidates])])
    # Hillary Step sits before that secondary summit, near its published 8,790 m level.
    hillary_candidates = np.flatnonzero((crest_s > 100) & (crest_s < crest_s[south_index]))
    hillary_index = int(hillary_candidates[np.argmin(abs(crest_height[hillary_candidates] - 8790))])
    for tag, k in (('southsummit', south_index), ('hillary', hillary_index)):
        p = crest[k]
        main_tags[tag] = int(np.argmin(np.hypot(main_path[:, 0] - p[0], main_path[:, 1] - p[1])))
    lx, lz = ll_to_xz(27.961667, 86.933056)
    ltop = local_max(core, CORE, lx, lz, 300)
    junction = main_path[main_tags['yellowband']]
    lhotse_waypoints = [
        ('yellowband', *junction) if w[0] == 'yellowband' else
        ('lhotse', ltop[0], ltop[1]) if w[0] == 'lhotse' else w
        for w in LHOTSE_WAYPOINTS]
    lhotse_waypoints = covered_waypoints(lhotse_waypoints, plan, confidence)
    lh_path, lh_tags = build_route(planning, plan, lhotse_waypoints, slope=slopes, penalty=penalty)
    # An A* endpoint lies on its coarser planning grid. Use the actual 4 m maximum.
    lh_path[-1] = ltop[:2]
    lh_path[0] = junction
    lh_tags['lhotse'] = len(lh_path) - 1
    out = Path(args.out)
    (out / 'terrain').mkdir(parents=True, exist_ok=True)
    encode_png(core, out / 'terrain/core.png')
    with Image.open(out / 'terrain/core.png') as image:
        rgb = np.array(image)
    rgb[..., 2] = glacier
    Image.fromarray(rgb).save(out / 'terrain/core.png', optimize=True)
    encode_png(back, out / 'terrain/backdrop.png')
    def fraction(w, threshold):
        return round(float(np.mean(w > threshold)), 6)
    meta = dict(
        encoding='height = (R * 256 + G) / 4 metres; B = glacier mask (core only)',
        origin=fallback.meta['origin'],
        source='Pléiades 23 March 2017, 4 m, DOI 10.5281/zenodo.6979691; Copernicus fallback outside valid stereo coverage',
        provenance=dict(
            doi='10.5281/zenodo.6979691', author='Etienne Berthier', license='CC BY 4.0',
            file=Path(args.pleiades).name, md5=SOURCE_MD5, horizontal_crs='EPSG:32645',
            vertical=dict(input='WGS84 ellipsoidal (ASP interpretation; source vertical CRS unspecified)',
                          output='EGM2008 orthometric', formula='H = h - N',
                          geoid='NGA EGM2008, 2.5 arc-minute grid',
                          geoid_url='https://cdn.proj.org/us_nga_egm08_25.tif',
                          geoid_sha256=checksum(args.geoid)),
            fallback=dict(source=fallback.meta['source'],
                          sha256={name: checksum(Path(args.fallback) / name)
                                  for name in ['core.png', 'backdrop.png', 'meta.json']}),
            blending_metres=40,
            core_pleiades_fraction=fraction(coverage, 0),
            core_full_pleiades_fraction=fraction(coverage, .99999),
            backdrop_pleiades_fraction=fraction(back_coverage, 0)),
        runtime=dict(refine=1, proceduralDetail=False,
                     note='Native 4 m grid; boot-track smoothing, camp terraces and local summit caps only'),
        core=CORE, backdrop=BACK)
    (out / 'terrain/meta.json').write_text(json.dumps(meta, indent=2) + '\n')
    route = dict(note='Generated over the Pléiades terrain; measured summit ridge, 8 m route planning, 4 m render grid.',
                 main=dict(points=np.round(main_path, 1).tolist(), tags=main_tags),
                 lhotse=dict(points=np.round(lh_path, 1).tolist(), tags=lh_tags))
    (out / 'route.json').write_text(json.dumps(route) + '\n')
    for name, path, tags in [('main', main_path, main_tags), ('lhotse', lh_path, lh_tags)]:
        print(f'{name}: {len(path)} points, {np.hypot(*np.diff(path, axis=0).T).sum()/1000:.2f} km', flush=True)
        for tag, i in sorted(tags.items(), key=lambda kv: kv[1]):
            height = sample(core, CORE, [path[i, 0]], [path[i, 1]])[0]
            print(f'  {tag:14s}: {height:.1f} m at {path[i].tolist()}', flush=True)
    print(json.dumps(meta['provenance'], indent=2), flush=True)


if __name__ == '__main__':
    main()
