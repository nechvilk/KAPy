# tests/test_app.py
import sqlite3
from werkzeug.security import generate_password_hash


def _vloz_testovaciho_uzivatele(db_path):
    """Pomocná funkce, která vloží testovacího uživatele do testovací DB."""
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT INTO uzivatele (id, email, heslo_hash, jmeno, role, je_blokovan)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            1,
            "test@example.com",
            generate_password_hash("SpravneHeslo123"),
            "Test User",
            "user",
            0,
        ),
    )
    conn.commit()
    conn.close()
    return "test@example.com", "SpravneHeslo123"


def test_hlavni_stranka_dostupna(client):
    """Ověří, že hlavní stránka vrací HTTP status 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_admin_panel_prikaze_pristup_neprihlasenemu(client):
    """Ověří, že dekorátor nepustí anonymního uživatele."""
    response = client.get("/admin", follow_redirects=False)
    assert response.status_code in (302, 403)


def test_api_prihlaseni_uspesne(client, test_db_path):
    """Ověří přihlášení se správným heslem a vytvoření session."""
    email, heslo = _vloz_testovaciho_uzivatele(test_db_path)

    response = client.post(
        "/api/prihlaseni",
        json={"email": email, "heslo": heslo},
    )

    assert response.status_code == 200
    assert response.json["status"] == "success"

    with client.session_transaction() as session:
        assert session["user_id"] == 1
        assert session["user_jmeno"] == "Test User"


def test_api_prihlaseni_nespravne_heslo(client, test_db_path):
    """Ověří odmítnutí přihlášení s nesprávným heslem."""
    email, _ = _vloz_testovaciho_uzivatele(test_db_path)

    response = client.post(
        "/api/prihlaseni",
        json={"email": email, "heslo": "SpatneHeslo123"},
    )

    assert response.status_code == 401
    assert response.json == {
        "status": "error",
        "zprava": "Nesprávný e-mail nebo heslo.",
    }