import os
import sqlite3

def inicializuj_databazi(path):
    # Ujistíme se, že složka pro DB existuje
    slozka = os.path.dirname(path)
    if slozka:
        os.makedirs(slozka, exist_ok=True)

    with sqlite3.connect(path) as connection:
        cursor = connection.cursor()
        
        # Explicitní zapnutí cizích klíčů pro toto spojení
        cursor.execute("PRAGMA foreign_keys = ON;")

        # 1. Tabulka uživatelů
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS uzivatele (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jmeno TEXT,
            email TEXT UNIQUE,
            heslo_hash TEXT,
            datum_registrace TEXT,
            role TEXT DEFAULT 'user',
            je_blokovan INTEGER DEFAULT 0
        )
        ''')

        # 2. Tabulka fotek
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS fotky (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nazev_souboru TEXT,
            cesta_k_souboru TEXT,
            uzivatel_id INTEGER,
            datum_nahrani TEXT,
            FOREIGN KEY (uzivatel_id) REFERENCES uzivatele(id) ON DELETE CASCADE
        )
        ''')

        # 3. Tabulka pro DICOM snímky
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS dicom_snimky (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nazev_souboru TEXT,
            cesta_k_souboru TEXT,
            thumb_cesta TEXT,
            uzivatel_id INTEGER,
            datum_nahrani TEXT,
            kategorie TEXT DEFAULT 'vse',
            
            patient_id TEXT,
            study_date TEXT,
            weight TEXT,
            kap TEXT,
            description TEXT,
            sex TEXT,
            
            manufacturer TEXT,
            model_name TEXT,
            institution_name TEXT,
            department_name TEXT,
            station_name TEXT,
            
            FOREIGN KEY (uzivatel_id) REFERENCES uzivatele(id) ON DELETE CASCADE
        )
        ''')

        # MIGRACE DICOM SNÍMKŮ: Přidání chybějících sloupců
        cursor.execute("PRAGMA table_info(dicom_snimky)")
        existujici_sloupce = [column[1] for column in cursor.fetchall()]

        nove_sloupce = {
            'manufacturer': 'TEXT',
            'model_name': 'TEXT',
            'institution_name': 'TEXT',
            'department_name': 'TEXT',
            'station_name': 'TEXT',
            'kategorie': 'TEXT'
        }

        for nazev_sloupce, datovy_typ in nove_sloupce.items():
            if nazev_sloupce not in existujici_sloupce:
                cursor.execute(f"ALTER TABLE dicom_snimky ADD COLUMN {nazev_sloupce} {datovy_typ}")

        # Převod starých kategorií na nové standardní názvy
        cursor.execute("UPDATE dicom_snimky SET kategorie = 'hrudnik_ap' WHERE kategorie = 'hrudnik'")
        cursor.execute("UPDATE dicom_snimky SET kategorie = 'c_pater_ap' WHERE kategorie = 'pater_c'")
        cursor.execute("UPDATE dicom_snimky SET kategorie = 'th_pater_ap' WHERE kategorie = 'pater_th'")
        cursor.execute("UPDATE dicom_snimky SET kategorie = 'ls_pater_ap' WHERE kategorie = 'pater_ls'")

        # 4. TABULKA PRO TYPICKÉ HODNOTY (DRL)
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS typicke_hodnoty (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uzivatel_id INTEGER,
            kategorie TEXT,
            prumerny_kap REAL,
            pocet_snimku INTEGER DEFAULT 0,
            min_hmotnost REAL,
            max_hmotnost REAL,
            prumerna_hmotnost REAL,
            pocet_zen INTEGER DEFAULT 0,
            pocet_muzu INTEGER DEFAULT 0,
            nejstarsi_vysetreni TEXT,
            nejnovejsi_vysetreni TEXT,
            datum_aktualizace TEXT,
            UNIQUE(uzivatel_id, kategorie),
            FOREIGN KEY (uzivatel_id) REFERENCES uzivatele(id) ON DELETE CASCADE
        )
        ''')

        # MIGRACE TYPICKÝCH HODNOT
        cursor.execute("PRAGMA table_info(typicke_hodnoty)")
        existujici_sloupce_th = [column[1] for column in cursor.fetchall()]
        
        nove_sloupce_th = {
            'pocet_snimku': 'INTEGER DEFAULT 0',
            'min_hmotnost': 'REAL',
            'max_hmotnost': 'REAL',
            'prumerna_hmotnost': 'REAL',
            'pocet_zen': 'INTEGER DEFAULT 0',
            'pocet_muzu': 'INTEGER DEFAULT 0',
            'nejstarsi_vysetreni': 'TEXT',
            'nejnovejsi_vysetreni': 'TEXT'
        }
        
        for nazev_sloupce, datovy_typ in nove_sloupce_th.items():
            if nazev_sloupce not in existujici_sloupce_th:
                cursor.execute(f"ALTER TABLE typicke_hodnoty ADD COLUMN {nazev_sloupce} {datovy_typ}")

        # 5. INDEXY PRO ZRYCHLENÍ DOTAZŮ IN PRODUKCI
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dicom_uzivatel ON dicom_snimky(uzivatel_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dicom_kategorie ON dicom_snimky(kategorie);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dicom_patient ON dicom_snimky(patient_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_th_uzivatel ON typicke_hodnoty(uzivatel_id);")

    print(f"✅ Databáze a tabulky byly úspěšně vytvořeny/aktualizovány v: {path}")

if __name__ == "__main__":
    # Testovací spuštění do složky instance/
    inicializuj_databazi(os.path.join("instance", "moje_data.db"))