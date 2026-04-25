from flask import Flask, jsonify, render_template, request, redirect, url_for, flash, session
from flask import send_from_directory
from dotenv import load_dotenv
import sqlite3
from database_init import inicializuj_databazi
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import os
import secrets
import string

# Definice povolených souborů
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif'}
# Cesta, kam se budou fotky fyzicky ukládat (relativně k app.py)
UPLOAD_FOLDER = 'uploads'
# Ujistíme se, že složka existuje
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Načteme proměnné ze souboru .env
load_dotenv()

app = Flask(__name__, instance_relative_config=True)
# Nastavení tajného klíče z .env (pokud chybí, použije se fallback)
#app.secret_key = os.getenv('SECRET_KEY', 'defaultni-nebezpecny-klic') # Nutné pro session a flash
app.secret_key = os.environ['SECRET_KEY']

# Cesta k databázi v instance složce
# Flask automaticky vytvoří cestu app.instance_path
db_path = os.path.join(app.instance_path, os.getenv('DATABASE_NAME', 'moje_data.db'))
# Zajistíme, aby složka instance existovala (vytvoří se při prvním spuštění)
os.makedirs(app.instance_path, exist_ok=True)

# AUTOMATICKÉ SPUŠTĚNÍ SKRIPTU
if not os.path.exists(db_path):
    print("Databáze nenalezena, vytvářím novou...")
    inicializuj_databazi(db_path)
else:
    print(f"Databáze nalezena zde: {db_path}")

@app.route("/")
def index():
    # Flask automaticky hledá ve složce 'templates'
    return render_template("index.html")

# --- 1. ROUTA PRO ZOBRAZENÍ STRÁNKY ---
@app.route('/registrace', methods=['GET'])
def registrace():
    # Jen vykreslí HTML šablonu, nic víc
    return render_template('registrace.html')

# --- API ROUTA PRO VYGENEROVÁNÍ HESLA ---
@app.route('/api/generovat-heslo', methods=['GET'])
def api_generovat_heslo():
    # Zvýšil jsem délku na 12 pro ještě lepší bezpečnost, ale můžeš nechat 10
    length = 12 
    alphabet = string.ascii_letters + string.digits + string.punctuation
    
    # Vygenerování hesla pomocí tvého kódu
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    
    # Odeslání hesla zpět na frontend ve formátu JSON
    return jsonify({
        "status": "success", 
        "heslo": password
    }), 200

# --- 2. API ROUTA PRO ZPRACOVÁNÍ DAT (AJAX) ---
@app.route('/api/registrace', methods=['POST'])
def api_registrace():
    data = request.get_json()

    if not data:
        return jsonify({"status": "error", "zprava": "Chybí data požadavku"}), 400

    jmeno = data.get('jmeno')
    email = data.get('email')
    heslo_raw = data.get('heslo')

    if not all([jmeno, email, heslo_raw]):
        return jsonify({"status": "error", "zprava": "Všechna pole jsou povinná! ✍️"}), 400

    ted = datetime.now()
    datum_reg = ted.strftime("%Y-%m-%d %H:%M:%S")
    heslo_hash = generate_password_hash(heslo_raw)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "INSERT INTO uzivatele (jmeno, email, heslo_hash, datum_registrace) VALUES (?, ?, ?, ?)",
            (jmeno, email, heslo_hash, datum_reg)
        )
        conn.commit()
        
        # Místo redirectu (který AJAX neumí přímo), posíláme URL k přesměrování
        return jsonify({
            "status": "success", 
            "zprava": "Registrace proběhla úspěšně! ✅ Přesměrovávám...",
            "redirect": url_for('prihlaseni')
        }), 200

    except sqlite3.IntegrityError:
        return jsonify({
            "status": "error", 
            "zprava": "Tento e-mail už je zaregistrován. ❌"
        }), 409

    finally:
        conn.close()

# --- 1. ROUTA PRO ZOBRAZENÍ STRÁNKY PŘIHLÁŠENÍ ---
@app.route('/prihlaseni', methods=['GET'])
def prihlaseni():
    # Jen vykreslí HTML šablonu
    return render_template('prihlaseni.html')

# --- 2. API ROUTA PRO ZPRACOVÁNÍ PŘIHLÁŠENÍ (AJAX) ---
@app.route('/api/prihlaseni', methods=['POST'])
def api_prihlaseni():
    data = request.get_json()

    if not data:
        return jsonify({"status": "error", "zprava": "Chybí data požadavku"}), 400

    email = data.get('email')
    heslo_zadane = data.get('heslo')

    if not email or not heslo_zadane:
        return jsonify({"status": "error", "zprava": "Zadejte e-mail i heslo."}), 400

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Hledáme uživatele podle e-mailu
    # Rozšíříme SELECT o sloupce role a je_blokovan
    cursor.execute(
        "SELECT id, heslo_hash, jmeno, role, je_blokovan FROM uzivatele WHERE email = ?", (email,)
    )
    radek = cursor.fetchone()
    conn.close()

    if radek:
        # Nejprve zkontrolujeme, jestli není uživatel blokován
        if radek['je_blokovan'] == 1:
            return jsonify({"status": "error", "zprava": "Váš účet je blokován. 🚫 Kontaktujte podporu."}), 403 # 403 Forbidden
     
        # Ověření hesla proti haši
        if check_password_hash(radek['heslo_hash'], heslo_zadane):
            session['user_id'] = radek['id'] # "Digitální náramek"
            session['user_jmeno'] = radek['jmeno'] # Uložíme i jméno uživatele
            session['role'] = radek['role'] # Uložíme i roli uživatele do náramku

            return jsonify({
                "status": "success", 
                "zprava": "Vítejte zpět! 🎉 Přesměrovávám...",
                "redirect": url_for('index')
            }), 200
        else:
            return jsonify({"status": "error", "zprava": "Nesprávné heslo. ❌"}), 401 # 401 Unauthorized
    else:
        return jsonify({"status": "error", "zprava": "Uživatel s tímto e-mailem neexistuje. ❌"}), 404 # 404 Not Found

# --- ROUTA PRO ADMIN ROZHRANÍ (admin.html) ---
@app.route('/admin')
def admin_panel():
    # Kontrola, zda je přihlášen admin
    if session.get('role') != 'admin':
        flash("Sem mají přístup pouze vyvolení! 🛑")
        return redirect(url_for('index'))

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Načteme všechny uživatele (kromě tebe samotného, abys ses omylem nezablokoval)
    cursor.execute("SELECT id, jmeno, email, role, je_blokovan FROM uzivatele WHERE id != ?", (session.get('user_id'),))
    vsichni_uzivatele = cursor.fetchall()
    conn.close()

    return render_template('admin.html', uzivatele=vsichni_uzivatele)

# API pro přepnutí blokace (AJAX)
@app.route('/api/admin/prepni-blokaci/<int:target_user_id>', methods=['POST'])
def api_prepni_blokaci(target_user_id):
    if session.get('role') != 'admin':
        return jsonify({"status": "error", "zprava": "Neautorizovaný přístup"}), 403

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Zjistíme aktuální stav a otočíme ho (0->1, 1->0)
    cursor.execute("UPDATE uzivatele SET je_blokovan = 1 - je_blokovan WHERE id = ?", (target_user_id,))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "zprava": "Stav uživatele byl změněn. ✅"})

# --- ROUTA PRO ZOBRAZENÍ GALERIE (moje_fotky.html) ---
@app.route('/moje-fotky')
def moje_fotky():
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        flash("Pro zobrazení galerie se musíte přihlásit. 🔒")
        return redirect(url_for('prihlaseni'))
    
    # Připojíme se do DB a načteme uživatelovy fotky
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row # Díky tomuto můžeme v HTML psát fotka['nazev_souboru'] místo fotka[0]
    cursor = conn.cursor()
    
    # Vybereme fotky konkrétního uživatele, seřazené od nejnovějších
    cursor.execute(
        "SELECT id, nazev_souboru, cesta_k_souboru, datum_nahrani FROM fotky WHERE uzivatel_id = ? ORDER BY datum_nahrani DESC",
        (uzivatel_id,)
    )
    nahrane_fotky = cursor.fetchall()
    conn.close()

    # Pošleme seznam fotek do šablony pod jménem 'fotky'
    return render_template('moje_fotky.html', fotky=nahrane_fotky)

# --- ROUTA PRO POSKYTNUTÍ OBRÁZKU PROHLÍŽEČI ---
@app.route('/uploads/<filename>')
def nahrany_soubor(filename):
    # Vezme soubor ze složky 'uploads' a pošle ho jako obrázek do HTML
    return send_from_directory(UPLOAD_FOLDER, filename)

# --- ROUTA PRO UPLOAD ---
@app.route('/api/nahrat-foto', methods=['POST'])
def api_nahrat_foto():
    # 1. Kontrola přihlášení
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        return jsonify({"status": "error", "zprava": "Pro nahrávání se musíte přihlásit! 🔒"}), 401

    # 2. Získáme SEZNAM všech souborů pod klíčem 'fotky' (změněno z 'foto')
    soubory = request.files.getlist('fotky')
    
    # Kontrola, zda uživatel vůbec něco vybral
    if not soubory or soubory[0].filename == '':
        return jsonify({"status": "error", "zprava": "Nevybral jsi žádný soubor! 📁"}), 400

    uspesne_fotky = [] # Sem si uložíme data pro odeslání zpět do JS
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        ted_datum_cas = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        for soubor in soubory:
            if soubor and soubor.filename != '':
                bezpecny_nazev = secure_filename(soubor.filename)
                jmeno, pripona = os.path.splitext(bezpecny_nazev)
                
                if pripona.lower() not in ALLOWED_EXTENSIONS:
                    continue # Nepovolený soubor přeskočíme a jdeme na další

                # Přidali jsme %f (mikrosekundy), aby se fotky nahrané naráz nepřepsaly
                cas_string = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                novy_nazev = f"{jmeno}_{uzivatel_id}_{cas_string}{pripona}"
                
                cesta_na_disk = os.path.join(UPLOAD_FOLDER, novy_nazev)
                soubor.save(cesta_na_disk)

                cursor.execute(
                    "INSERT INTO fotky (nazev_souboru, cesta_k_souboru, uzivatel_id, datum_nahrani) VALUES (?, ?, ?, ?)",
                    (soubor.filename, novy_nazev, uzivatel_id, ted_datum_cas)
                )
                nove_id = cursor.lastrowid
                
                uspesne_fotky.append({
                    "id": nove_id,
                    "nazev_souboru": soubor.filename,
                    "cesta_k_souboru": novy_nazev,
                    "datum_nahrani": ted_datum_cas
                })

        conn.commit()

        # Pokud se nahrála alespoň jedna fotka, vracíme úspěch
        if uspesne_fotky:
            return jsonify({
                "status": "success",
                "zprava": f"Úspěšně nahráno {len(uspesne_fotky)} fotek! 🚀",
                "fotky": uspesne_fotky # Posíláme POLE fotek, ne jen jednu
            })
        else:
            return jsonify({"status": "error", "zprava": "Nepodařilo se nahrát žádný povolený soubor. 🚫"}), 400
            
    except Exception as e:
        conn.rollback()
        return jsonify({"status": "error", "zprava": f"Chyba při ukládání: {e}"}), 500
    finally:
        conn.close()

# --- API ROUTA PRO SMAZÁNÍ FOTKY (AJAX) ---
@app.route('/api/smazat-foto/<int:foto_id>', methods=['DELETE'])
def api_smazat_foto(foto_id):
    # 1. Kontrola přihlášení
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        return jsonify({"status": "error", "zprava": "Pro tuto akci se musíte přihlásit! 🔒"}), 401

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 2. Zjistíme cestu k souboru a ověříme vlastníka
        cursor.execute("SELECT cesta_k_souboru FROM fotky WHERE id = ? AND uzivatel_id = ?", (foto_id, uzivatel_id))
        vysledek = cursor.fetchone()

        if vysledek:
            nazev_souboru_na_disku = vysledek[0]
            absolutni_cesta = os.path.join(UPLOAD_FOLDER, nazev_souboru_na_disku)

            # 3. Smazání souboru z disku (pokud existuje)
            if os.path.exists(absolutni_cesta):
                os.remove(absolutni_cesta)

            # 4. Smazání záznamu z databáze
            cursor.execute("DELETE FROM fotky WHERE id = ? AND uzivatel_id = ?", (foto_id, uzivatel_id))
            conn.commit()
            return jsonify({"status": "success", "zprava": "Fotka byla úspěšně smazána. 🗑️"}), 200
        else:
            return jsonify({"status": "error", "zprava": "Fotka nebyla nalezena nebo k ní nemáte přístup. 🚫"}), 404

    except Exception as e:
        conn.rollback()
        return jsonify({"status": "error", "zprava": f"Chyba při mazání: {e}"}), 500
    finally:
        conn.close()

# --- API ROUTA PRO ODHLÁŠENÍ (AJAX) ---
@app.route('/api/odhlaseni', methods=['POST'])
def api_odhlaseni():
    # Odstraní ID uživatele ze session
    session.pop('user_id', None)
    
    # Vrátíme JSON s přesměrováním
    return jsonify({
        "status": "success", 
        "zprava": "Byli jste úspěšně odhlášeni.",
        "redirect": url_for('index')
    }), 200

if __name__ == "__main__":
    app.run(debug=True)