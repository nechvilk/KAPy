import sqlite3

def inicializuj_databazi(path):
    # Připojí se k databázi na cestě, kterou mu pošle app.py
    connection = sqlite3.connect(path)
    cursor = connection.cursor()

    # 1. Tabulka uživatelů (s rolí a blokováním)
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

    # 2. Tabulka fotek (původní část, pokud ji ještě využíváš)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS fotky (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nazev_souboru TEXT,
        cesta_k_souboru TEXT,
        uzivatel_id INTEGER,
        datum_nahrani TEXT,
        FOREIGN KEY (uzivatel_id) REFERENCES uzivatele(id)
    )
    ''')

    # 3. Tabulka pro DICOM snímky (včetně všech nových metadat)
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
        
        FOREIGN KEY (uzivatel_id) REFERENCES uzivatele(id)
    )
    ''')

    # ---------------------------------------------------------
    # MIGRACE DICOM SNÍMKŮ: Přidání nových sloupců do DB
    # ---------------------------------------------------------
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
            print(f"Byl přidán nový sloupec do dicom_snimky: {nazev_sloupce}")

    # MIGRACE DAT: Převod starých kategorií na nové standardní názvy
    cursor.execute("UPDATE dicom_snimky SET kategorie = 'hrudnik_ap' WHERE kategorie = 'hrudnik'")
    cursor.execute("UPDATE dicom_snimky SET kategorie = 'c_pater_ap' WHERE kategorie = 'pater_c'")
    cursor.execute("UPDATE dicom_snimky SET kategorie = 'th_pater_ap' WHERE kategorie = 'pater_th'")
    cursor.execute("UPDATE dicom_snimky SET kategorie = 'ls_pater_ap' WHERE kategorie = 'pater_ls'")


    # 4. TABULKA PRO TYPICKÉ HODNOTY (Kompletní definice s novými sloupci)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS typicke_hodnoty (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uzivatel_id INTEGER,
        kategorie TEXT,
        prumerny_kap REAL,
        pocet_snimku INTEGER,
        min_hmotnost REAL,
        max_hmotnost REAL,
        prumerna_hmotnost REAL,
        pocet_zen INTEGER,
        pocet_muzu INTEGER,
        nejstarsi_vysetreni TEXT,
        nejnovejsi_vysetreni TEXT,
        datum_aktualizace TEXT,
        UNIQUE(uzivatel_id, kategorie),
        FOREIGN KEY (uzivatel_id) REFERENCES uzivatele(id)
    )
    ''')

    # ---------------------------------------------------------
    # MIGRACE TYPICKÝCH HODNOT: Přidání sloupců pro existující DB
    # ---------------------------------------------------------
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
            print(f"Byl přidán nový sloupec do typicke_hodnoty: {nazev_sloupce}")

    connection.commit()
    connection.close()
    print(f"✅ Databáze a tabulky byly úspěšně vytvořeny/aktualizovány v: {path}")

# Pokud spouštíš skript samostatně (např. z terminálu přes `python database_init.py`)
if __name__ == "__main__":
    # Ujisti se, že tady je správný název tvého databázového souboru!
    inicializuj_databazi("moje_data.db")