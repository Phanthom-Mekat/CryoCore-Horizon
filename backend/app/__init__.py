"""CryoCore's Chattogram backend."""

import os

from rasterio.env import GDALDataFinder, PROJDataFinder

# A rasterio wheel bundles PROJ/GDAL data matching its own libraries. A machine-wide PROJ_LIB/GDAL_DATA from another
# install (e.g. PostGIS) can point at an incompatible proj.db and break every CRS lookup. rasterio re-reads these
# variables each time an Env starts, so point them at the bundled data (pyproj already prefers its own).
if _proj := PROJDataFinder().search_wheel():
    os.environ["PROJ_DATA"] = os.environ["PROJ_LIB"] = _proj
if _gdal := GDALDataFinder().search_wheel():
    os.environ["GDAL_DATA"] = _gdal
