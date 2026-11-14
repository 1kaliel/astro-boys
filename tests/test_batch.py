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

    assert batch.ingest(settings, (2012, 2012), ["Aqua"])["rows"] == 5
    result = batch.aggregate(settings)
    assert result["rows"] == 1
    with duckdb.connect() as con:
        counts = con.read_parquet(result["output"] + "/**/*.parquet", hive_partitioning=True)
        assert counts.select(
            "cell_l2, year, month, daynight, satellite, n_hotspots, "
            "n_active_days, frp_sum_mw, n_all_confidence"
        ).fetchall() == [("G081136.01", 2012, 12, "D", "Aqua", 2, 1, 14.0, 3)]
