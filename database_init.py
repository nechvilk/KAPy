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

    # 2. Tabulka fotek
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

    # 3. UPRAVENÁ Tabulka pro DICOM snímky
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS dicom_snimky (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nazev_souboru TEXT,
        cesta_k_souboru TEXT,
        thumb_cesta TEXT,
        uzivatel_id INTEGER,
        datum_nahrani TEXT,
        kategorie TEXT DEFAULT 'vse', -- NOVÝ SLOUPEC PRO TŘÍDĚNÍ
        
        -- Původní DRL Metadata specifická pro DICOM
        patient_id TEXT,
        study_date TEXT,
        weight TEXT,
        kap TEXT,
        description TEXT,
        sex TEXT,
        
        -- NOVÁ Metadata: Přístroj a pracoviště
        manufacturer TEXT,
        model_name TEXT,
        institution_name TEXT,
        department_name TEXT,
        station_name TEXT,
        
        FOREIGN KEY (uzivatel_id) REFERENCES uzivatele(id)
    )
    ''')

    # ---------------------------------------------------------
    # MIGRACE: Přidání nových sloupců do existující databáze
    # ---------------------------------------------------------
    # Načteme seznam všech existujících sloupců v tabulce dicom_snimky
    cursor.execute("PRAGMA table_info(dicom_snimky)")
    existujici_sloupce = [column[1] for column in cursor.fetchall()]

    # Seznam nových sloupců, které chceme zkontrolovat/přidat
    nove_sloupce = {
        'manufacturer': 'TEXT',
        'model_name': 'TEXT',
        'institution_name': 'TEXT',
        'department_name': 'TEXT',
        'station_name': 'TEXT',
        'kategorie': 'TEXT' # PŘIDÁNO DO MIGRACE
    }

    # Pokud některý nový sloupec chybí, přidáme ho
    for nazev_sloupce, datovy_typ in nove_sloupce.items():
        if nazev_sloupce not in existujici_sloupce:
            cursor.execute(f"ALTER TABLE dicom_snimky ADD COLUMN {nazev_sloupce} {datovy_typ}")
            print(f"Byl přidán nový sloupec: {nazev_sloupce}")

    connection.commit()
    connection.close()
    print(f"Databáze a tabulky byly vytvořeny/aktualizovány v: {path} ✅")

# Pokud byste chtěli skript spouštět i samostatně:
if __name__ == "__main__":
    inicializuj_databazi("moje_data.db") # Změňte na název vaší DB