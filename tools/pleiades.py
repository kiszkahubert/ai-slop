"""GeoTIFF sampling and NoData-aware Pléiades/Copernicus blending.

PixelIsArea tiepoints locate corners; PixelIsPoint tiepoints locate samples.
Heights from ASP are interpreted as WGS84 ellipsoidal and converted using
H = h - N with the NGA EGM2008 grid. This interpretation is recorded explicitly
because the Zenodo raster does not specify its vertical CRS.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt, map_coordinates

from demlib import ll_to_xz, xz_to_ll


def checksum(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def smooth_weight(distance, width):
    t = np.clip(distance / width, 0, 1)
    return t * t * (3 - 2 * t)


class GeoRaster:
    def __init__(self, path, crop_lonlat=None, feather=0):
        with Image.open(path) as im:
            tags = im.tag_v2
            scale, tie = tags[33550], tags[33922]
            keys = tags[34735]
            self.keys = {keys[k]: keys[k + 3] for k in range(4, len(keys), 4)
                         if keys[k + 1] == 0 and keys[k + 2] == 1}
            self.epsg = self.keys.get(3072, self.keys.get(2048))
            if self.epsg not in (4326, 32645):
                raise ValueError(f'Unsupported raster CRS: EPSG:{self.epsg}')
            self.pixel_offset = .5 if self.keys[1025] == 1 else 0.
            self.sx, self.sy = scale[:2]
            self.left = tie[3] - tie[0] * self.sx
            self.top = tie[4] + tie[1] * self.sy
            self.transform = Transformer.from_crs(4326, self.epsg, always_xy=True)
            box = (0, 0, im.width, im.height)
            if crop_lonlat:
                if self.epsg != 4326:
                    raise ValueError('Cropping is supported for the geographic geoid grid only')
                west, south, east, north = crop_lonlat
                box = (max(0, int((west - self.left) / self.sx) - 3),
                       max(0, int((self.top - north) / self.sy) - 3),
                       min(im.width, int((east - self.left) / self.sx) + 5),
                       min(im.height, int((self.top - south) / self.sy) + 5))
            a = np.array(im.crop(box), dtype=np.float32)
            self.left += box[0] * self.sx
            self.top -= box[1] * self.sy
            nodata = tags.get(42113)
        valid = np.isfinite(a)
        if nodata is not None:
            valid &= a != float(nodata)
        self.a = np.where(valid, a, 0)
        self.valid = valid.astype(np.float32)
        self.feather = feather
        if feather:
            # Include the outer raster boundary, so a valid edge still feathers to fallback.
            self.distance = (distance_transform_edt(np.pad(valid, 1))[1:-1, 1:-1]
                             * min(self.sx, self.sy)).astype(np.float32)

    def coordinates(self, lat, lon):
        east, north = self.transform.transform(lon, lat)
        return [(self.top - north) / self.sy - self.pixel_offset,
                (east - self.left) / self.sx - self.pixel_offset]

    def sample(self, lat, lon):
        coords = self.coordinates(lat, lon)
        h = map_coordinates(self.a, coords, order=1, mode='constant', cval=0)
        valid = map_coordinates(self.valid, coords, order=1, mode='constant', cval=0) > .99999
        return np.where(valid, h, np.nan)

    def weight(self, lat, lon):
        if not self.feather:
            return np.isfinite(self.sample(lat, lon)).astype(np.float32)
        coords = self.coordinates(lat, lon)
        valid = map_coordinates(self.valid, coords, order=1, mode='constant', cval=0) > .99999
        d = map_coordinates(self.distance, coords, order=1, mode='constant', cval=0)
        return np.where(valid, smooth_weight(d, self.feather), 0).astype(np.float32)


class Fallback:
    """Frozen legacy assets retain the terrain where the stereo DEM has no data."""
    def __init__(self, folder):
        self.folder = Path(folder)
        self.meta = json.loads((self.folder / 'meta.json').read_text())
        self.grids = {}
        for name in ('core', 'backdrop'):
            rgb = np.array(Image.open(self.folder / f'{name}.png'))
            heights = (rgb[..., 0].astype(np.uint16) * 256 + rgb[..., 1]) / 4.
            self.grids[name] = (heights.astype(np.float32), self.meta[name])
        self.mask = np.array(Image.open(self.folder / 'core.png'))[..., 2]

    def sample(self, lat, lon, name):
        x, z = ll_to_xz(lat, lon)
        h, g = self.grids[name]
        return map_coordinates(h, [(z - g['z0']) / g['cell'], (x - g['x0']) / g['cell']],
                               order=3, mode='nearest')

    def glacier(self, lat, lon):
        x, z = ll_to_xz(lat, lon)
        g = self.meta['core']
        return map_coordinates(self.mask, [(z - g['z0']) / g['cell'], (x - g['x0']) / g['cell']],
                               order=1, mode='nearest')


def orthometric(heights, undulation):
    return heights - undulation


def build_grid(stereo, geoid, fallback, g, name, block_rows=96):
    h = np.empty((g['nz'], g['nx']), np.float32)
    weight = np.empty_like(h)
    mask = np.empty(h.shape, np.uint8) if name == 'core' else None
    xs = g['x0'] + np.arange(g['nx']) * g['cell']
    for start in range(0, g['nz'], block_rows):
        end = min(start + block_rows, g['nz'])
        X, Z = np.meshgrid(xs, g['z0'] + np.arange(start, end) * g['cell'])
        lat, lon = xz_to_ll(X, Z)
        w = stereo.weight(lat, lon)
        raw = stereo.sample(lat, lon)
        active = w > 0
        corrected = raw.copy()
        if np.any(active):
            separation = geoid.sample(lat[active], lon[active])
            if not np.isfinite(separation).all():
                raise ValueError('Geoid does not cover valid Pléiades data')
            corrected[active] = orthometric(raw[active], separation)
        low = fallback.sample(lat, lon, name)
        # np.where also prevents NaN * 0 from contaminating fallback cells.
        h[start:end] = low + w * np.where(active, corrected - low, 0)
        weight[start:end] = w
        if mask is not None:
            mask[start:end] = fallback.glacier(lat, lon)
    if not np.isfinite(h).all() or h.min() < 0 or h.max() >= 16384:
        raise ValueError('Terrain contains invalid or unencodable elevations')
    return h, weight, mask
