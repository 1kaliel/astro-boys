from astro_fire import storage
from astro_fire.config import REPO_ROOT, get_settings


def test_default_data_root_is_local(monkeypatch):
    monkeypatch.delenv("ASTRO_DATA_ROOT", raising=False)
    s = get_settings(astro_data_root="data")
    assert not s.is_remote
    assert s.data_root == str(REPO_ROOT / "data")


def test_gcs_data_root(monkeypatch):
    s = get_settings(astro_data_root="gs://example-bucket/astro/")
    assert s.is_remote
    assert storage.uri(s, "processed", "hotspots", "v1") == "gs://example-bucket/astro/processed/hotspots/v1"


def test_unknown_layer_rejected(tmp_path):
    s = get_settings(astro_data_root=str(tmp_path))
    try:
        storage.uri(s, "scratch")
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_redacted_settings_have_no_secret_keys(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "not-a-real-key")
    s = get_settings()
    assert "not-a-real-key" not in str(s.redacted())


def test_empty_env_values_fall_back_to_defaults(monkeypatch):
    for k in ("DUCKDB_TEMP_DIR", "DUCKDB_MEMORY_LIMIT", "ASTRO_PROFILE", "DUCKDB_THREADS"):
        monkeypatch.setenv(k, "")
    s = get_settings()
    assert s.duckdb_temp_dir
    assert s.duckdb_memory_limit == "2GB"
    assert s.profile == "local"
    assert s.duckdb_threads is None
