import sqlite3

def inicializuj_databazi(path):
    # Připojí se k databázi na cestě, kterou mu pošle app.py
    connection = sqlite3.connect(path)
    cursor = connection.cursor()

    # Tabulka uživatelů (s rolí a blokováním)
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

    # Tabulka fotek
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

    connection.commit()
    connection.close()
    print(f"Databáze a tabulky byly vytvořeny v: {path} ✅")