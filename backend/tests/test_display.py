import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from app.display import preview


def test_preview_preserves_transparency_scale_and_geography(tmp_path):
    path = tmp_path / "power.tif"
    with rasterio.open(path, "w", driver="GTiff", width=4, height=4, count=1,
                       dtype="float32", crs="EPSG:3857", transform=from_origin(0, 80, 20, 20), nodata=np.nan) as dst:
        dst.write(np.array([[-25,0,np.nan,-12.5]]*4,dtype="float32"),1)
    png, corners = preview(path)
    with MemoryFile(png) as memory, memory.open() as src:
        rgba = src.read()
        assert rgba.shape == (4,4,4)
        assert rgba[0,0,0] == 0 and rgba[0,0,1] == 255
        assert rgba[3,0,2] == 0 and rgba[3,0,1] == 255
    assert corners[0][0] < corners[1][0] and corners[0][1] > corners[3][1]
    assert path.exists()
