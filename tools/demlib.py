"""Shared helpers for building game assets from the Copernicus GLO-30 DEM.

World space used by the game: metres, origin at the summit of Mount Everest,
x = east, z = south, y = up (true elevation). A local equirectangular projection
is accurate to well under a metre per km across the play area.
"""
import math, os
import numpy as np

LAT0, LON0 = 27.988056, 86.925278            # Mount Everest summit
_phi = math.radians(LAT0)
M_LON = 111412.84 * math.cos(_phi) - 93.5 * math.cos(3 * _phi)   # metres per degree of longitude
M_LAT = 111132.92 - 559.82 * math.cos(2 * _phi) + 1.175 * math.cos(4 * _phi)

def ll_to_xz(lat, lon):
    return (lon - LON0) * M_LON, -(lat - LAT0) * M_LAT

def xz_to_ll(x, z):
    return LAT0 - z / M_LAT, LON0 + x / M_LON

class Mosaic:
    """Copernicus tiles (pixel-is-point, 1 arc-second, first row at the tile's north edge)."""
    def __init__(self, folder, lat_tiles=(27, 28), lon_tiles=(86, 87)):
        import tifffile
        self.lat_top = max(lat_tiles) + 1
        self.lon_left = min(lon_tiles)
        n = 3600
        self.a = np.zeros((n * len(lat_tiles), n * len(lon_tiles)), np.float32)
        for i, la in enumerate(sorted(lat_tiles, reverse=True)):
            for j, lo in enumerate(sorted(lon_tiles)):
                name = f'N{la:02d}_00_E{lo:03d}_00.tif'
                t = tifffile.imread(os.path.join(folder, name))
                self.a[i * n:(i + 1) * n, j * n:(j + 1) * n] = t[:n, :n]
        self.n = n

    def sample(self, lat, lon):
        """Bicubic sample at arrays of lat/lon."""
        from scipy.ndimage import map_coordinates
        r = (self.lat_top - np.asarray(lat)) * self.n
        c = (np.asarray(lon) - self.lon_left) * self.n
        return map_coordinates(self.a, [r, c], order=3, mode='nearest')

def grid(mos, x0, z0, cell, nx, nz):
    xs = x0 + np.arange(nx) * cell
    zs = z0 + np.arange(nz) * cell
    X, Z = np.meshgrid(xs, zs)
    lat, lon = xz_to_ll(X, Z)
    return mos.sample(lat, lon).astype(np.float32)

def encode_png(h, path, scale=4.0):
    """Store heights as RGB: v = round(h * scale) -> R = v >> 8, G = v & 255 (B unused)."""
    from PIL import Image
    v = np.clip(np.round(h * scale), 0, 65535).astype(np.uint32)
    rgb = np.zeros(h.shape + (3,), np.uint8)
    rgb[..., 0] = v >> 8; rgb[..., 1] = v & 255
    Image.fromarray(rgb, 'RGB').save(path, optimize=True)

def hillshade(h, cell, az=315, alt=40):
    gy, gx = np.gradient(h, cell)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    a, b = math.radians(az), math.radians(alt)
    return np.clip(np.sin(b) * np.cos(slope) + np.cos(b) * np.sin(slope) * np.cos(a - aspect), 0, 1)
