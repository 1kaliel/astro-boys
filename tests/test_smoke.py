import json
from pathlib import Path

from astro_fire import smoke
from astro_fire.config import get_settings


def test_smoke_local_roundtrip(tmp_path):
    settings = get_settings(astro_data_root=str(tmp_path), duckdb_temp_dir=str(tmp_path / "tmp"))
    result = smoke.run(settings)

    assert result["status"] == "ok"
    assert result["row_count_matches"]
    assert result["rows_in"] == 30
    assert result["sensors"] == ["MODIS", "VIIRS"]
    assert any(p.startswith("sensor=MODIS/year=2024/month=1") for p in result["partitions"])

    manifest = json.loads(Path(result["manifest"]).read_text())
    assert manifest["status"] == "ok"
    assert len(manifest["inputs"]) == 2
    assert all(i["sha256"] for i in manifest["inputs"])
    parquet = list((tmp_path / "interim" / "smoke").rglob("*.parquet"))
    assert parquet, "expected partitioned parquet output"
