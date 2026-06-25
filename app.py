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
from dicom_logic import get_drl_metadata, generate_thumb
import pandas as pd
import io
import csv

# Definice povolených souborů
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif'}
# Cesta, kam se budou fotky fyzicky ukládat (relativně k app.py)

# --- KONFIGURACE CEST ---
UPLOAD_ROOT = 'uploads'
FOTKY_FOLDER = os.path.join(UPLOAD_ROOT, 'fotky')
DICOM_RAW_FOLDER = os.path.join(UPLOAD_ROOT, 'dicom_originaly')
DICOM_THUMB_FOLDER = os.path.join(UPLOAD_ROOT, 'dicom_nahledy')

# Automatické vytvoření struktury při startu
for slozka in [FOTKY_FOLDER, DICOM_RAW_FOLDER, DICOM_THUMB_FOLDER]:
    os.makedirs(slozka, exist_ok=True)



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

# AUTOMATICKÁ KONTROLA A AKTUALIZACE DATABÁZE
print(f"Kontroluji (aktualizuji) strukturu databáze: {db_path}")
inicializuj_databazi(db_path)

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

# --- ROUTA PRO FOTKY Z GALERIE ---
@app.route('/uploads/fotky/<filename>')
def nahrana_fotka(filename):
    return send_from_directory(FOTKY_FOLDER, filename)

# --- ROUTA PRO DICOM NÁHLEDY (PNG) ---
@app.route('/uploads/dicom-nahled/<filename>')
def dicom_nahled(filename):
    return send_from_directory(DICOM_THUMB_FOLDER, filename)


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
                
                cesta_na_disk = os.path.join(FOTKY_FOLDER, novy_nazev)
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
            absolutni_cesta = os.path.join(FOTKY_FOLDER, nazev_souboru_na_disku)

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

# --- ROUTA PRO STAŽENÍ FOTKY ---
@app.route('/stahnout-foto/<int:foto_id>')
def stahnout_foto(foto_id):
    # 1. Kontrola, zda je uživatel přihlášen
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        flash("Pro stahování souborů se musíte přihlásit. 🔒")
        return redirect(url_for('prihlaseni'))

    # 2. Najdeme soubor v databázi
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Přidali jsme do výběru i 'nazev_souboru', což je ten původní hezký název
    cursor.execute("SELECT cesta_k_souboru, nazev_souboru FROM fotky WHERE id = ? AND uzivatel_id = ?", (foto_id, uzivatel_id))
    vysledek = cursor.fetchone()
    conn.close()

    # 3. Pokud záznam existuje, pošleme fotku ke stažení
    if vysledek:
        nazev_souboru_na_disku = vysledek[0]
        puvodni_nazev = vysledek[1] # Vytáhneme původní název z databáze
        
        # Přidán parametr download_name, aby se fotka stáhla pod původním jménem!
        return send_from_directory(FOTKY_FOLDER, nazev_souboru_na_disku, as_attachment=True, download_name=puvodni_nazev)
    else:
        # Pokud soubor neexistuje nebo patří někomu jinému
        flash("Fotka nebyla nalezena nebo k ní nemáte přístup. 🚫")
        return redirect(url_for('moje_fotky'))

# --- ROUTA PRO ZOBRAZENÍ DICOM ARCHIVU (muj_dicom.html) ---
# Routa přijme volitelný parametr 'kategorie', výchozí je 'vse'
@app.route('/muj-dicom', defaults={'kategorie': 'vse'})
@app.route('/muj-dicom/<kategorie>')
def muj_dicom(kategorie):
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        flash("Pro přístup k DICOM archivu se musíte přihlásit. 🔒")
        return redirect(url_for('prihlaseni'))
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Rozhodnutí podle vybrané kategorie
    if kategorie == 'vse':
        cursor.execute(
            "SELECT * FROM dicom_snimky WHERE uzivatel_id = ? ORDER BY datum_nahrani DESC",
            (uzivatel_id,)
        )
    else:
        cursor.execute(
            "SELECT * FROM dicom_snimky WHERE uzivatel_id = ? AND kategorie = ? ORDER BY datum_nahrani DESC",
            (uzivatel_id, kategorie)
        )
        
    snimky = cursor.fetchall()
    conn.close()

    # Do šablony pošleme i aktuální kategorii, abychom podle ní mohli upravit např. nadpis stránky
    return render_template('muj_dicom.html', dicom_snimky=snimky, aktivni_kategorie=kategorie)

# --- API PRO NAHRÁNÍ A EXTRAKCI METADAT ---
@app.route('/api/nahrat-dicom', methods=['POST'])
def api_nahrat_dicom():
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        return jsonify({"status": "error", "zprava": "Nepřihlášený uživatel."}), 401

    soubory = request.files.getlist('dicom_files')
    # ZÍSKÁNÍ KATEGORIE Z FORM DATA (pokud není zadána, uloží se jako 'vse')
    kategorie = request.form.get('kategorie', 'vse') 

    if not soubory or soubory[0].filename == '':
        return jsonify({"status": "error", "zprava": "Žádné soubory k nahrání."}), 400

    uspesne = 0
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        for soubor in soubory:
            bezpecny_nazev = secure_filename(soubor.filename)
            cas_prefix = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            unikatni_nazev = f"{cas_prefix}_{uzivatel_id}_{bezpecny_nazev}"
            cesta_dcm = os.path.join(DICOM_RAW_FOLDER, unikatni_nazev)
            
            soubor.save(cesta_dcm)
            meta = get_drl_metadata(cesta_dcm)
            
            thumb_nazev = f"thumb_{unikatni_nazev}.png"
            generate_thumb(cesta_dcm, DICOM_THUMB_FOLDER, thumb_nazev)

            # ÚPRAVA INSERT DOTAZU: Přidán sloupec 'kategorie'
            cursor.execute('''
                INSERT INTO dicom_snimky (
                    nazev_souboru, cesta_k_souboru, thumb_cesta, uzivatel_id, datum_nahrani, kategorie,
                    patient_id, study_date, weight, kap, description, sex,
                    manufacturer, model_name, institution_name, department_name, station_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                soubor.filename, unikatni_nazev, thumb_nazev, uzivatel_id, 
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"), kategorie,  # ZDE PŘIDÁNA PROMĚNNÁ
                meta.get('PatientID'), meta.get('StudyDate'), meta.get('Weight'),
                meta.get('KAP'), meta.get('StudyDescription'), meta.get('PatientSex'),
                meta.get('Manufacturer'), meta.get('ManufacturerModelName'),
                meta.get('InstitutionName'), meta.get('InstitutionalDepartmentName'),
                meta.get('StationName')
            ))
            uspesne += 1

        conn.commit()
        return jsonify({"status": "success", "zprava": f"Nahráno a analyzováno {uspesne} souborů."})

    except Exception as e:
        return jsonify({"status": "error", "zprava": f"Chyba: {str(e)}"}), 500
    finally:
        conn.close()

# --- API PRO VÝPOČET STATISTIK Z VYBRANÝCH SOUBORŮ ---
@app.route('/api/analyzovat-vyber', methods=['POST'])
def api_analyzovat_vyber():
    data = request.get_json()
    ids = data.get('ids', []) # Seznam ID, které uživatel zaškrtal

    if not ids:
        return jsonify({"status": "error", "zprava": "Nebyly vybrány žádné snímky."}), 400

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Bezpečné načtení vybraných ID pro daného uživatele
    dotaz = f"SELECT kap, weight FROM dicom_snimky WHERE id IN ({','.join(['?']*len(ids))}) AND uzivatel_id = ?"
    cursor.execute(dotaz, ids + [session.get('user_id')])
    vysledky = cursor.fetchall()
    conn.close()

    if not vysledky:
        return jsonify({"status": "error", "zprava": "Data nenalezena."}), 404

    # Převedení dat na číselné hodnoty s ochranou proti chybám formátu
    hodnoty_kap = []
    hodnoty_hmotnost = []

    for r in vysledky:
        # Extrakce KAP
        kap_val = r['kap']
        if kap_val and kap_val != 'N/A':
            try:
                hodnoty_kap.append(float(kap_val))
            except ValueError:
                pass  # Ignorujeme nečíselné hodnoty

        # Extrakce Hmotnosti
        weight_val = r['weight']
        if weight_val and weight_val != 'N/A':
            try:
                hodnoty_hmotnost.append(float(weight_val))
            except ValueError:
                pass  # Ignorujeme nečíselné hodnoty

    if not hodnoty_kap and not hodnoty_hmotnost:
        return jsonify({"status": "error", "zprava": "Vybrané snímky neobsahují validní data pro KAP ani hmotnost."}), 400

    # Sestavení slovníku se statistikami
    statistiky = {}

    # Původní výpočet KAP
    if hodnoty_kap:
        statistiky["pocet"] = len(hodnoty_kap)
        statistiky["prumer"] = round(sum(hodnoty_kap) / len(hodnoty_kap), 2)
        statistiky["max"] = max(hodnoty_kap)
        statistiky["min"] = min(hodnoty_kap)
    else:
        statistiky["pocet"] = 0
        statistiky["prumer"] = statistiky["max"] = statistiky["min"] = "N/A"

    # NOVÝ VÝPOČET HMOTNOSTI
    if hodnoty_hmotnost:
        statistiky["hmotnost_pocet"] = len(hodnoty_hmotnost)
        statistiky["hmotnost_prumer"] = round(sum(hodnoty_hmotnost) / len(hodnoty_hmotnost), 2)
        statistiky["hmotnost_max"] = round(max(hodnoty_hmotnost), 2)
        statistiky["hmotnost_min"] = round(min(hodnoty_hmotnost), 2)
    else:
        statistiky["hmotnost_pocet"] = 0
        statistiky["hmotnost_prumer"] = statistiky["hmotnost_max"] = statistiky["hmotnost_min"] = "N/A"

    return jsonify({"status": "success", "data": statistiky})

# --- API ROUTA PRO SMAZÁNÍ DICOMU (AJAX) ---
@app.route('/api/smazat-dicom/<int:dicom_id>', methods=['DELETE'])
def api_smazat_dicom(dicom_id):
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        return jsonify({"status": "error", "zprava": "Neautorizováno! 🔒"}), 401

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT cesta_k_souboru, thumb_cesta FROM dicom_snimky WHERE id = ? AND uzivatel_id = ?", (dicom_id, uzivatel_id))
        vysledek = cursor.fetchone()

        if vysledek:
            raw_cesta = os.path.join(DICOM_RAW_FOLDER, vysledek[0])
            thumb_cesta = os.path.join(DICOM_THUMB_FOLDER, vysledek[1])

            # Smažeme fyzické soubory (originál i náhled)
            if os.path.exists(raw_cesta): os.remove(raw_cesta)
            if os.path.exists(thumb_cesta): os.remove(thumb_cesta)

            # Smažeme z DB
            cursor.execute("DELETE FROM dicom_snimky WHERE id = ? AND uzivatel_id = ?", (dicom_id, uzivatel_id))
            conn.commit()
            return jsonify({"status": "success", "zprava": "DICOM byl úspěšně smazán. 🗑️"})
        else:
            return jsonify({"status": "error", "zprava": "Soubor nenalezen."}), 404

    except Exception as e:
        conn.rollback()
        return jsonify({"status": "error", "zprava": f"Chyba: {e}"}), 500
    finally:
        conn.close()

# --- ROUTA PRO STAŽENÍ PŮVODNÍHO DICOM SOUBORU ---
@app.route('/stahnout-dicom/<int:dicom_id>')
def stahnout_dicom(dicom_id):
    # 1. Kontrola, zda je uživatel přihlášen
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        flash("Pro stahování souborů se musíte přihlásit. 🔒")
        return redirect(url_for('prihlaseni'))

    # 2. Najdeme soubor v databázi
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT cesta_k_souboru, nazev_souboru FROM dicom_snimky WHERE id = ? AND uzivatel_id = ?", (dicom_id, uzivatel_id))
    vysledek = cursor.fetchone()
    conn.close()

    # 3. Pokud záznam existuje, pošleme soubor uživateli
    if vysledek:
        unikatni_cesta = vysledek[0]  # Ten dlouhý název s čísly a hashem, jak to leží na disku
        puvodni_nazev = vysledek[1]   # Původní čistý název, jak ho uživatel nahrál

        # as_attachment=True říká prohlížeči, ať soubor stáhne a neotvírá ho
        # download_name zajistí, že se soubor stáhne pod původním hezkým názvem!
        return send_from_directory(DICOM_RAW_FOLDER, unikatni_cesta, as_attachment=True, download_name=puvodni_nazev)
    else:
        # Pokud se někdo pokusí stáhnout soubor, který neexistuje nebo není jeho
        flash("Soubor nenalezen nebo k němu nemáte přístup. 🚫")
        return redirect(url_for('muj_dicom'))

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