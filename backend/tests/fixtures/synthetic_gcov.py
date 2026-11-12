"""Small synthetic GCOV-like HDF5 files, generated at test time only. Never real data; never committed as files."""

from pathlib import Path

import h5py
import numpy as np
from pyproj import Transformer

GRID = "/science/LSAR/GCOV/grids/frequencyA"
EPSG = 32646  # UTM 46N, the zone NISAR uses over Chattogram
CENTER = (91.82, 22.29)


def utm(lon, lat):
    return Transformer.from_crs("EPSG:4326", f"EPSG:{EPSG}", always_xy=True).transform(lon, lat)


def make_gcov(path: Path, *, size=(300, 300), posting=20.0, shift=(0.0, 0.0), terms=("HHHH", "HVHV"),
              base_db=-12.0, plants=(), invalid_boxes=(), seed=0, looks=5, mask=True,
              start="2026-01-10T23:41:07.000000000", center=CENTER) -> Path:
    """plants: [(lon, lat, half_size_m, delta_db)] squares added in dB; invalid_boxes: [(lon, lat, half_m)] set to mask 0.

    The left 10 columns are outside the acquisition (mask 255, NaN); the rest is valid sub-swath 1 or 2.
    """
    h, w = size
    cx, cy = utm(*center)
    x0 = np.round(cx / posting) * posting - posting * (w // 2) + shift[0]
    y0 = np.round(cy / posting) * posting + posting * (h // 2) + shift[1]
    x = x0 + posting * np.arange(w)
    y = y0 - posting * np.arange(h)
    xx, yy = np.meshgrid(x, y)

    db = np.full((h, w), base_db)
    for lon, lat, half, delta in plants:
        px, py = utm(lon, lat)
        db[(np.abs(xx - px) <= half) & (np.abs(yy - py) <= half)] += delta
    m = np.where(np.arange(w) < w // 2, 1, 2)[None, :].repeat(h, 0).astype(np.uint8)
    for lon, lat, half in invalid_boxes:
        px, py = utm(lon, lat)
        m[(np.abs(xx - px) <= half) & (np.abs(yy - py) <= half)] = 0
    m[:, :10] = 255

    rng = np.random.default_rng(seed)
    with h5py.File(path, "w") as f:
        f.attrs["synthetic_fixture"] = True  # app.processing flags any bundle made from these as synthetic
        g = f.create_group(GRID)
        for t in terms:
            speckle = rng.gamma(looks, 1 / looks, (h, w))
            power = (10 ** (db / 10) * speckle).astype(np.float32)
            power[m == 255] = np.nan
            ds = g.create_dataset(t, data=power)
            ds.attrs["_FillValue"] = np.float32(np.nan)
            ds.attrs["isReceiveOnlyChannel1"] = "False"
        if mask:
            g.create_dataset("mask", data=m).attrs["_FillValue"] = np.uint8(255)
        g.create_dataset("xCoordinates", data=x)
        g.create_dataset("yCoordinates", data=y)
        g.create_dataset("xCoordinateSpacing", data=posting)
        g.create_dataset("yCoordinateSpacing", data=-posting)
        g.create_dataset("projection", data=np.uint32(EPSG)).attrs["epsg_code"] = EPSG
        g.create_dataset("listOfPolarizations", data=np.array([t[:2].encode() for t in terms]))
        f.create_dataset("/science/LSAR/identification/zeroDopplerStartTime", data=start.encode())
        f.create_dataset("/science/LSAR/GCOV/metadata/processingInformation/parameters/rtc/"
                         "outputBackscatterNormalizationConvention", data=b"gamma0")
    return path
