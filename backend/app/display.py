"""Fixed-scale, transparent Web Mercator previews; original GeoTIFFs remain authoritative."""
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import calculate_default_transform, reproject, Resampling, transform_bounds


def preview(path, change=False):
    with rasterio.open(path) as src:
        affine, width, height = calculate_default_transform(src.crs, "EPSG:3857", src.width, src.height, *src.bounds)
        pixels = np.full((height, width), np.nan, dtype="float32")
        reproject(src.read(1), pixels, src_transform=src.transform, src_crs=src.crs,
                  dst_transform=affine, dst_crs="EPSG:3857", src_nodata=np.nan,
                  dst_nodata=np.nan, resampling=Resampling.nearest)
    valid = np.isfinite(pixels)
    if change:
        # Magenta/neutral/green, matching the application's signed-change palette.
        stops = np.array([[194, 80, 154], [138, 143, 152], [79, 154, 74]], dtype=float)
        t = np.clip(np.nan_to_num(pixels / 6), -1, 1)
        rgba = np.empty((4, height, width), dtype="uint8")
        for band in range(3): rgba[band] = np.interp(t, [-1,0,1], stops[:,band]).astype("uint8")
    else:
        t = np.clip(np.nan_to_num((pixels + 25) / 25), 0, 1)
        rgba = np.stack([t*255,t*255,t*255,np.zeros_like(t)]).astype("uint8")
    rgba[3] = valid.astype("uint8") * 255
    bounds = rasterio.transform.array_bounds(height, width, affine)
    west, south, east, north = transform_bounds("EPSG:3857", "EPSG:4326", *bounds)
    with MemoryFile() as memory:
        with memory.open(driver="PNG", width=width, height=height, count=4, dtype="uint8") as dst:
            dst.write(rgba)
        png = memory.read()
    return png, [[west,north],[east,north],[east,south],[west,south]]
