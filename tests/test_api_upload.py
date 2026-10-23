# tests/test_api_upload.py
import io
import sqlite3
from tests.test_dicom_logic import _vytvor_testovaci_dicom


def test_nahrat_dicom_neprihlaseny(client):
    """Ověří, že nepřihlášený uživatel dostane HTTP 401."""
    response = client.post("/api/nahrat-dicom")
    assert response.status_code == 401
    assert response.get_json()["zprava"] == "Nepřihlášený uživatel."


def test_nahrat_dicom_zadny_soubor(client):
    """Ověří, že požadavek bez přiložených souborů vrátí HTTP 400."""
    with client.session_transaction() as sess:
        sess["user_id"] = 1

    response = client.post("/api/nahrat-dicom")
    assert response.status_code == 400
    assert response.get_json()["zprava"] == "Žádné soubory k nahrání."


def test_nahrat_dicom_uspesne(client, test_db_path, tmp_path):
    """Ověří úspěšné nahrání DICOMu, vytvoření náhledu a uložení dat do SQLite."""
    # 1. Příprava testovacího DICOM souboru (včetně pixelů)
    dicom_path = tmp_path / "test_upload.dcm"
    _vytvor_testovaci_dicom(
        dicom_path,
        patient_id="PACIENT-99",
        kap_hodnota="0.25",
        obsahuje_obrazek=True,  # Nutné pro funkci generate_thumb
    )

    with open(dicom_path, "rb") as f:
        dicom_bytes = f.read()

    form_data = {
        "dicom_files": (io.BytesIO(dicom_bytes), "test_upload.dcm"),
        "kategorie": "skiagrafie",
    }

    # Přihlášení uživatele přes session
    with client.session_transaction() as sess:
        sess["user_id"] = 1

    # 2. Odeslání požadavku
    response = client.post(
        "/api/nahrat-dicom", data=form_data, content_type="multipart/form-data"
    )

    # 3. Kontrola výsledků
    assert response.status_code == 200

    resp_json = response.get_json()
    assert resp_json["status"] == "success"
    assert "Nahráno a analyzováno 1 souborů." in resp_json["zprava"]

    # Ověření zápisu v databázi
    conn = sqlite3.connect(test_db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT patient_id, kap, kategorie FROM dicom_snimky")
    row = cursor.fetchone()
    conn.close()

    assert row is not None
    assert row[0] == "PACIENT-99"
    assert row[1] == 25.0  # 0.25 * 100.0
    assert row[2] == "skiagrafie"


def test_nahrat_dicom_neplatny_soubor(client, test_db_path):
    """Ověří, že nahraný obyčejný textový soubor API odmítne a neuloží do DB."""
    with client.session_transaction() as sess:
        sess["user_id"] = 1

    falesny_obsah = b"Toto neni DICOM soubor..."
    form_data = {
        "dicom_files": (io.BytesIO(falesny_obsah), "falesny.dcm"),
    }

    response = client.post(
        "/api/nahrat-dicom", data=form_data, content_type="multipart/form-data"
    )

    assert response.status_code == 200

    resp_json = response.get_json()
    assert resp_json["status"] == "success"
    assert "1 souborů vyřazeno - neplatný formát DICOM" in resp_json["zprava"]

    # Ověření, že se do DB nic nezapsalo
    conn = sqlite3.connect(test_db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM dicom_snimky")
    count = cursor.fetchone()[0]
    conn.close()

    assert count == 0