"""Self-check for nisar_pipeline helpers that need no downloads. Run: python scripts/test_pipeline.py"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from nisar_pipeline import pair_times  # noqa: E402


class NoLayers:  # stands in for an h5py.File without identification metadata
    def visititems(self, fn):
        return None


# real GOFF name from ASF (track 131 A, frame 37): reference 9 Oct, secondary 21 Oct 2026
name = "NISAR_L2_PR_GOFF_032_131_A_037_033_7700_SH_20261009T064731_20261009T064808_20261021T064731_20261021T064808_P05023_N_P_J_001.h5"
t0, t1 = pair_times(NoLayers(), name)
assert t0 == datetime(2026, 10, 9, 6, 47, 31), t0
assert t1 == datetime(2026, 10, 21, 6, 47, 31), t1
assert (t1 - t0).days == 12
print("pipeline helpers ok")
