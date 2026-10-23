import sqlite3
import pytest
import app as flask_app_module
from app import app as flask_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    """
    Příprava kompletního testovacího prostředí:
    1. Vytvoří dočasné složky pro DICOMy a náhledy.
    2. Vytvoří dočasnou SQLite databázi se všemi tabulkami.
    3. Přesměruje cesty v aplikaci na toto dočasné prostředí.
    """
    raw_folder = tmp_path / "raw"
    thumb_folder = tmp_path / "thumbs"
    db_file = tmp_path / "test_kapy.db"

    raw_folder.mkdir()
    thumb_folder.mkdir()

    # Přesměrování proměnných v modulu app.py na testovací složky
    monkeypatch.setattr(flask_app_module, "db_path", str(db_file))
    monkeypatch.setattr(flask_app_module, "DICOM_RAW_FOLDER", str(raw_folder))
    monkeypatch.setattr(flask_app_module, "DICOM_THUMB_FOLDER", str(thumb_folder))

    # Inicializace struktury SQLite databáze
    conn = sqlite3.connect(db_file)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS uzivatele (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            heslo_hash TEXT NOT NULL,
            jmeno TEXT NOT NULL,
            role TEXT NOT NULL,
            je_blokovan INTEGER NOT NULL
        )
    """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dicom_snimky (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nazev_souboru TEXT, cesta_k_souboru TEXT, thumb_cesta TEXT,
            uzivatel_id INTEGER, datum_nahrani TEXT, kategorie TEXT,
            patient_id TEXT, study_date TEXT, weight TEXT, kap REAL,
            description TEXT, sex TEXT, manufacturer TEXT, model_name TEXT,
            institution_name TEXT, department_name TEXT, station_name TEXT
        )
    """
    )
    conn.commit()
    conn.close()

    # Nastavení Flask konfigurace pro testování
    flask_app.config.update(
        {
            "TESTING": True,
            "WTF_CSRF_ENABLED": False,
        }
    )

    yield flask_app


@pytest.fixture
def client(app):
    """Vytvoří virtuálního testovacího klienta napojeného na připravené prostředí."""
    return app.test_client()


@pytest.fixture
def test_db_path(app):
    """Pomocná fixture, která do testu předá cestu k testovací DB pro finální kontrolu zápisů."""
    return flask_app_module.db_path