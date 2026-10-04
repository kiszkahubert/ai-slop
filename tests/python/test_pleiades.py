"""Regression checks with tiny synthetic GeoTIFFs; no network or large DEM needed."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image, TiffImagePlugin
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from pleiades import GeoRaster, orthometric, smooth_weight, build_grid, checksum


def tiff(path, values, pixel_type=1, epsg=32645, left=500000, top=3100000, cell=4, nodata=-9999):
    tags = TiffImagePlugin.ImageFileDirectory_v2()
    for key, kind in [(33550, 12), (33922, 12), (34735, 3), (42113, 2)]:
        tags.tagtype[key] = kind
    tags[33550] = (cell, cell, 0.)
    tags[33922] = (0., 0., 0., left, top, 0.)
    tags[34735] = (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, pixel_type,
                   3072 if epsg == 32645 else 2048, 0, 1, epsg)
    tags[42113] = str(nodata)
    Image.fromarray(values.astype(np.float32)).save(path, tiffinfo=tags)


class RasterTests(unittest.TestCase):
    def test_pixel_centres_and_utm_transform(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'grid.tif'
            a = np.arange(9, dtype=np.float32).reshape(3, 3)
            inverse = Transformer.from_crs(32645, 4326, always_xy=True)
            for pixel_type, offset in [(1, .5), (2, 0)]:
                tiff(p, a, pixel_type=pixel_type)
                raster = GeoRaster(p)
                lon, lat = inverse.transform(500000 + (1 + offset)*4, 3100000 - (1 + offset)*4)
                self.assertAlmostEqual(float(raster.sample(np.array([lat]), np.array([lon]))[0]), 4, places=5)

    def test_nodata_and_raster_edges_feather_without_height_spikes(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'grid.tif'
            a = np.full((7, 7), 8000, np.float32)
            a[3, 3] = -9999
            tiff(p, a)
            raster = GeoRaster(p, feather=12)
            inverse = Transformer.from_crs(32645, 4326, always_xy=True)
            lon, lat = inverse.transform(np.array([500014, 500002, 500006, 500001]),
                                         np.array([3099986, 3099998, 3099994, 3100001]))
            sampled = raster.sample(lat, lon)
            self.assertTrue(np.isnan(sampled[0]))
            self.assertTrue(np.isnan(sampled[-1]))
            weight = raster.weight(lat, lon)
            self.assertEqual(weight[0], 0)
            self.assertEqual(weight[-1], 0)
            self.assertGreater(weight[2], weight[1])
            self.assertTrue(np.all(weight >= 0) and np.all(weight <= 1))

    def test_egm2008_conversion_sign(self):
        np.testing.assert_allclose(orthometric(np.array([8818., 6000.]), np.array([-28., -30.])), [8846., 6030.])
        np.testing.assert_allclose(smooth_weight(np.array([-1., 0., 20., 40., 100.]), 40), [0, 0, .5, 1, 1])

    def test_invalid_stereo_cells_preserve_fallback(self):
        class Stereo:
            def weight(self, lat, lon):
                return np.zeros_like(lat, dtype=np.float32)
            def sample(self, lat, lon):
                return np.full_like(lat, np.nan)
        class Geoid:
            def sample(self, lat, lon):
                raise AssertionError('Must not sample geoid outside valid stereo coverage')
        class Fallback:
            def sample(self, lat, lon, name):
                return np.full_like(lat, 6000.)
            def glacier(self, lat, lon):
                return np.full_like(lat, 255.)
        g = dict(x0=0, z0=0, cell=4, nx=3, nz=3)
        h, w, mask = build_grid(Stereo(), Geoid(), Fallback(), g, 'core', block_rows=2)
        np.testing.assert_array_equal(h, np.full((3, 3), 6000.))
        np.testing.assert_array_equal(w, np.zeros((3, 3)))
        np.testing.assert_array_equal(mask, np.full((3, 3), 255))

    def test_shipped_assets_declare_native_grid_and_aligned_junction(self):
        meta = json.loads((ROOT / 'assets/terrain/meta.json').read_text())
        route = json.loads((ROOT / 'assets/route.json').read_text())
        self.assertEqual(meta['core']['cell'], 4)
        self.assertEqual(meta['runtime']['refine'], 1)
        self.assertFalse(meta['runtime']['proceduralDetail'])
        for name, expected in meta['provenance']['fallback']['sha256'].items():
            self.assertEqual(checksum(ROOT / 'tools/terrain-fallback' / name), expected,
                             'frozen source bytes must match on every platform')
        with Image.open(ROOT / 'assets/terrain/core.png') as im:
            self.assertEqual(im.size, (meta['core']['nx'], meta['core']['nz']))
        main, lh = route['main'], route['lhotse']
        self.assertEqual(main['points'][main['tags']['yellowband']], lh['points'][lh['tags']['yellowband']])
        for r in [main, lh]:
            self.assertTrue(np.isfinite(r['points']).all())


if __name__ == '__main__':
    unittest.main()
