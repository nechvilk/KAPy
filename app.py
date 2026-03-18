from flask import Flask, jsonify, render_template, request, redirect, url_for, flash, session
from flask import send_from_directory
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import os

# Definice povolených souborů
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif'}
# Cesta, kam se budou fotky fyzicky ukládat (relativně k app.py)
UPLOAD_FOLDER = 'uploads'
# Ujistíme se, že složka existuje
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.secret_key = 'vase_velmi_tajne_heslo' # Nutné pro session a flash

@app.route("/")
def index():
    # Flask automaticky hledá ve složce 'templates'
    return render_template("index.html")

# --- ROUTA PRO REGISTRACI ---
@app.route('/registrace', methods=['GET', 'POST'])
def registrace():
    if request.method == 'POST':
        jmeno = request.form['jmeno']
        email = request.form['email']
        heslo_raw = request.form['heslo']
        
        # Získání a formátování času
        ted = datetime.now()
        datum_reg = ted.strftime("%Y-%m-%d %H:%M:%S")
        
        # Bezpečné zahašování
        heslo_hash = generate_password_hash(heslo_raw)

        conn = sqlite3.connect('database/moje_data.db')
        cursor = conn.cursor()

        try:
            # Bezpečné vložení pomocí placeholderů (?)
            cursor.execute(
            "INSERT INTO uzivatele (jmeno, email, heslo_hash, datum_registrace) VALUES (?, ?, ?, ?)",
            (jmeno, email, heslo_hash, datum_reg)
            )
            conn.commit()
            flash("Registrace proběhla úspěšně! Nyní se můžete přihlásit. ✅")
            return redirect(url_for('prihlaseni'))
        except sqlite3.IntegrityError:
            # Zachycení duplicitního e-mailu (UNIQUE constraint)
            flash("Tento e-mail už je zaregistrován. ❌")
            return redirect(url_for('registrace'))
        finally:
            conn.close()

    return render_template('registrace.html')

# --- ROUTA PRO PŘIHLÁŠENÍ ---
@app.route('/prihlaseni', methods=['GET', 'POST'])
def prihlaseni():
    if request.method == 'POST':
        email = request.form['email']
        heslo_zadane = request.form['heslo']

        conn = sqlite3.connect('database/moje_data.db')
        cursor = conn.cursor()
        
        # Hledáme uživatele podle e-mailu
        cursor.execute(
        "SELECT id, heslo_hash FROM uzivatele WHERE email = ?", (email,)
        )
        radek = cursor.fetchone()
        conn.close()

        if radek:
            uzivatel_id = radek[0]
            ulozeny_hash = radek[1]

            # Ověření hesla proti haši
            if check_password_hash(ulozeny_hash, heslo_zadane):
                session['user_id'] = uzivatel_id # "Digitální náramek"
                flash("Vítejte zpět! 🎉")
                return redirect(url_for('index'))
            else:
                flash("Nesprávné heslo. ❌")
        else:
            flash("Uživatel s tímto e-mailem neexistuje. ❌")
        
        return redirect(url_for('prihlaseni'))

    return render_template('prihlaseni.html')

# --- ROUTA PRO ZOBRAZENÍ GALERIE (moje_fotky.html) ---
@app.route('/moje-fotky')
def moje_fotky():
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        flash("Pro zobrazení galerie se musíte přihlásit. 🔒")
        return redirect(url_for('prihlaseni'))
    
    # Připojíme se do DB a načteme uživatelovy fotky
    conn = sqlite3.connect('database/moje_data.db')
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

# --- ROUTA PRO UPLOAD SOUBORU ---
@app.route('/api/nahrat-foto', methods=['POST'])
def api_nahrat_foto():
    # 1. Kontrola přihlášení ze session
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        return jsonify({"status": "error", "zprava": "Pro nahrávání se musíte přihlásit! 🔒"}), 401

    soubor = request.files.get('foto')
    
    if soubor and soubor.filename != '':
        bezpecny_nazev = secure_filename(soubor.filename)
        jmeno, pripona = os.path.splitext(bezpecny_nazev)
        
        if pripona.lower() not in ALLOWED_EXTENSIONS:
            return jsonify({"status": "error", "zprava": "Tento typ souboru není povolen! 🚫"}), 400

        cas_string = datetime.now().strftime("%Y%m%d_%H%M%S")
        novy_nazev = f"{jmeno}_{uzivatel_id}_{cas_string}{pripona}"
        
        cesta_na_disk = os.path.join(UPLOAD_FOLDER, novy_nazev)
        soubor.save(cesta_na_disk)

        # 3. Zápis do databáze
        ted = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn = sqlite3.connect('database/moje_data.db')
        cursor = conn.cursor()

        try:
            cursor.execute(
                "INSERT INTO fotky (nazev_souboru, cesta_k_souboru, uzivatel_id, datum_nahrani) VALUES (?, ?, ?, ?)",
                (soubor.filename, novy_nazev, uzivatel_id, ted)
            )
            conn.commit()
            return jsonify({"status": "success", "zprava": "Fotka byla úspěšně nahrána! 🚀"})
        except Exception as e:
            conn.rollback()
            return jsonify({"status": "error", "zprava": f"Chyba databáze: {e}"}), 500
        finally:
            conn.close()
            
    return jsonify({"status": "error", "zprava": "Nevybral jsi žádný soubor! 📁"}), 400

# --- ROUTA PRO SMAZÁNÍ FOTKY ---
@app.route('/smazat-foto/<int:foto_id>', methods=['POST'])
def smazat_foto(foto_id):
    # 1. Kontrola přihlášení
    uzivatel_id = session.get('user_id')
    if not uzivatel_id:
        flash("Pro tuto akci se musíte přihlásit! 🔒")
        return redirect(url_for('prihlaseni'))

    # Připojení ke správné databázi
    conn = sqlite3.connect('database/moje_data.db')
    cursor = conn.cursor()

    try:
        # 2. Zjistíme cestu k souboru a ověříme vlastníka
        cursor.execute("SELECT cesta_k_souboru FROM fotky WHERE id = ? AND uzivatel_id = ?", (foto_id, uzivatel_id))
        vysledek = cursor.fetchone()

        if vysledek:
            nazev_souboru_na_disku = vysledek[0] # V naší DB je už uložen jen název
            
            # Cesta do složky uploads (kde fotky reálně jsou)
            absolutni_cesta = os.path.join(UPLOAD_FOLDER, nazev_souboru_na_disku)

            # 3. Smazání souboru z disku (pokud existuje)
            if os.path.exists(absolutni_cesta):
                os.remove(absolutni_cesta)
                print(f"Soubor {absolutni_cesta} byl smazán z disku.")

            # 4. Smazání záznamu z databáze
            cursor.execute("DELETE FROM fotky WHERE id = ? AND uzivatel_id = ?", (foto_id, uzivatel_id))
            conn.commit()
            flash("Fotka byla úspěšně smazána. 🗑️")
        else:
            flash("Fotka nebyla nalezena nebo k ní nemáte přístup. 🚫")

    except Exception as e:
        conn.rollback()
        flash(f"Chyba při mazání: {e}")
    finally:
        conn.close()

    return redirect(url_for('moje_fotky'))

# --- ROUTA PRO ODHLÁŠENÍ ---
@app.route('/odhlaseni')
def odhlaseni():
    # Odstraní ID uživatele ze session
    session.pop('user_id', None)
    flash("Byli jste úspěšně odhlášeni. 👋")
    return redirect(url_for('index'))

if __name__ == "__main__":
    app.run(debug=True)