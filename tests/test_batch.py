import json
from pathlib import Path
from zipfile import ZipFile

import duckdb

from astro_fire import batch
from astro_fire.config import get_settings

MODIS_HEADER = (
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,"
    "instrument,confidence,version,bright_t31,frp,daynight,type\n"
)


def test_near_midnight_deduplication_and_filtering(tmp_path, monkeypatch):
    monkeypatch.setenv("ASTRO_DATASET_VERSION", "v1")
    settings = get_settings(astro_data_root=str(tmp_path), duckdb_temp_dir=str(tmp_path / "tmp"))
    archive_dir = tmp_path / "raw/firms/global/modis"
    archive_dir.mkdir(parents=True)
    covered = "-9,-44,305,1,1,2012-12-31,2000,Aqua,MODIS,30,6.2,295,7,D,0\n"
    low = covered.replace(",30,", ",29,")
    nonvegetation = covered.removesuffix("0\n") + "2\n"
    adjacent_year = covered.replace("2012-12-31,2000", "2013-01-01,0200")
    dropped = covered.replace("2012-12-31,2000", "2012-01-01,0200")
    outside = covered.replace("-9,-44", "-9,-55")
    terra = covered.replace("Aqua", "Terra")
    valid_other_cell_only_low = low.replace("-9,-44", "-9,-43.75")

    raw_2012 = covered + covered + low + nonvegetation + dropped + outside + terra + valid_other_cell_only_low
    for year, rows in ((2012, raw_2012), (2013, adjacent_year)):
        with ZipFile(archive_dir / f"modis_{year}_all_countries.zip", "w") as archive:
            archive.writestr(f"modis/{year}/modis_{year}_Brazil.csv", MODIS_HEADER + rows)

    ingest = batch.ingest(settings, (2012, 2012), ["Aqua"])
    assert ingest["rows"] == 5
    assert ingest["exact_duplicate_rows_dropped"] == 1
    assert ingest["exact_duplicate_rows_by_file"] == {
        "modis_2012_Brazil.csv": 1,
        "modis_2013_Brazil.csv": 0,
    }
    manifest = json.loads(Path(ingest["manifest"]).read_text(encoding="utf-8"))
    assert [source["rows"] for source in manifest["inputs"]] == [8, 1]
    assert manifest["checks"]["exact_duplicate_rows_dropped"] == 1
    assert manifest["checks"]["raw_input_rows"] == 9
    assert manifest["checks"]["rows_outside_bbox_dropped"] == 1
    assert manifest["checks"]["other_rows_dropped"] == 2
    result = batch.aggregate(settings)
    assert result["rows"] == 1
    with duckdb.connect() as con:
        counts = con.read_parquet(result["output"] + "/**/*.parquet", hive_partitioning=True)
        assert counts.select(
            "cell_l2, year, month, daynight, satellite, n_hotspots, "
            "n_active_days, frp_sum_mw, n_all_confidence"
        ).fetchall() == [("G081136.01", 2012, 12, "D", "Aqua", 2, 1, 14.0, 3)]


def test_ingest_api_prefers_standard_files_and_treats_nrt_as_type_zero(tmp_path, monkeypatch):
    import duckdb

    from astro_fire import batch
    from astro_fire.config import get_settings

    monkeypatch.setenv("ASTRO_DATASET_VERSION", "v1")
    box = "-48.8_-18.4_-34.7_-1.0"
    head = ("latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,"
            "version,bright_ti5,frp,daynight")
    files = {
        f"VIIRS_SNPP_SP/{box}/2026-01-01_5d.csv": head + ",type\n"
            "-9.37,-45.62,330,0.4,0.4,2026-01-05,1630,N,VIIRS,n,2,290,5.0,D,0\n"
            "-9.37,-45.62,330,0.4,0.4,2026-01-05,1631,N,VIIRS,h,2,290,6.0,D,2\n",   # static source: filtered
        f"VIIRS_SNPP_NRT/{box}/2026-01-04_5d.csv": head + "\n"
            "-9.37,-45.62,330,0.4,0.4,2026-01-05,1632,N,VIIRS,n,2.0NRT,290,5.0,D\n"   # covered by SP: dropped
            "-9.37,-45.62,330,0.4,0.4,2026-01-08,1632,N,VIIRS,n,2.0NRT,290,7.0,D\n"
            "-9.37,-45.62,330,0.4,0.4,2026-01-08,1633,N,VIIRS,l,2.0NRT,290,1.0,D\n",  # low confidence
        f"VIIRS_NOAA20_NRT/{box}/2026-01-04_5d.csv": head + "\n"
            "-9.37,-45.62,330,0.4,0.4,2026-01-08,1540,N20,VIIRS,h,2.0NRT,290,9.0,D\n"
            "10.0,10.0,330,0.4,0.4,2026-01-08,1540,N20,VIIRS,h,2.0NRT,290,9.0,D\n",    # outside the extent
    }
    for name, text in files.items():
        path = tmp_path / "raw" / "firms" / "api" / name
        path.parent.mkdir(parents=True)
        path.write_text(text)
    result = batch.ingest_api(get_settings(astro_data_root=str(tmp_path)), 2026)
    assert result["status"] == "ok" and result["hotspot_rows"] == 5 and result["passing_main_filter"] == 3
    snpp = result["sources"]["VIIRS_SNPP"]
    assert snpp["raw_rows"] == 4 and snpp["raw_rows_nrt"] == 2
    con = duckdb.connect()
    hot = f"read_parquet('{tmp_path}/processed/hotspots/v1/**/*.parquet', hive_partitioning = true)"
    assert con.execute(
        f"SELECT satellite, version, type, passes_main_filter, cell_l2 FROM {hot} ORDER BY acq_ts_utc"
    ).fetchall() == [
        ("SNPP", "2", 0, True, "G080134.10"),
        ("SNPP", "2", 2, False, "G080134.10"),
        ("N20", "2.0NRT", 0, True, "G080134.10"),
        ("SNPP", "2.0NRT", 0, True, "G080134.10"),
        ("SNPP", "2.0NRT", 0, False, "G080134.10"),
    ]
    counts_glob = f"{tmp_path}/processed/cell_month_counts/v1/**/*.parquet"
    counts = f"read_parquet('{counts_glob}', hive_partitioning = true)"
    assert con.execute(
        f"SELECT year, month, daynight, satellite, n_hotspots FROM {counts} ORDER BY satellite"
    ).fetchall() == [(2026, 1, "D", "N20", 1), (2026, 1, "D", "SNPP", 2)]
