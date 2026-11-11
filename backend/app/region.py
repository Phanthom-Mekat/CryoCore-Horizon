# Deliberately a broad discovery envelope, NOT an official administrative polygon.
REGION = {
    "id": "chattogram-division",
    "name": "Chattogram Division",
    "country": "Bangladesh",
    "bbox": [90.5, 20.5, 92.7, 24.3],
    "crs": "EPSG:4326",
    "boundary_type": "approximate_search_envelope",
    "boundary_note": (
        "Includes areas outside the division and offshore waters. Scene intersection "
        "does not prove full coverage. Use a verified administrative polygon before "
        "clipping rasters or reporting division-wide statistics."
    ),
    "research_themes": [
        "Floodplain and seasonal surface-water change",
        "Coastal and estuarine surface change",
        "Hill forest and vegetation change",
    ],
    "primary_mission": "NASA-ISRO NISAR",
}

PRODUCTS = {
    "GCOV": "Geocoded radar covariance/backscatter: starting point for surface-change research.",
    "GUNW": "Geocoded unwrapped interferograms: future deformation research requiring quality controls.",
    "GOFF": "Geocoded offsets: future surface-displacement research.",
}
