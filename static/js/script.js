document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTY PRO NAHRÁVÁNÍ FOTEK ---
    const fotoVstup = document.querySelector('#foto-vstup');
    const nahledImg = document.querySelector('#nahled-obrazek');
    const nahledKontajner = document.querySelector('#nahled-kontajner');
    const btnNahrat = document.querySelector('#tlacitko-nahrat');
    const vypis = document.querySelector('#vypis');

    // --- ELEMENTY PRO FLASH ZPRÁVY ---
    const flashMessages = document.querySelector('.flash-messages');

    // --- ELEMENTY PRO REGISTRACI ---
    const registracniFormular = document.getElementById('registracni-form');
    const regZprava = document.getElementById('reg-zprava');
    const regTlacitko = document.getElementById('reg-tlacitko');

    // --- ELEMENTY PRO PŘIHLÁŠENÍ ---
    const prihlasovaciFormular = document.getElementById('prihlasovaci-form');
    const prihlZprava = document.getElementById('prihl-zprava');
    const prihlTlacitko = document.getElementById('prihl-tlacitko');

    // --- ELEMENTY PRO MAZÁNÍ FOTEK ---
    const tlacitkaSmazat = document.querySelectorAll('.btn-smazat');

    // --- ELEMENTY PRO ODHLÁŠENÍ ---
    const btnOdhlasit = document.getElementById('btn-odhlasit');
    const odhlaseniZprava = document.getElementById('odhlaseni-zprava');

    // 1. Zobrazení náhledu po výběru souboru
    if (fotoVstup) {
        fotoVstup.addEventListener('change', () => {
            const soubor = fotoVstup.files[0];
            if (soubor) {
                const ctecka = new FileReader();
                ctecka.onload = (e) => {
                    nahledImg.src = e.target.result;
                    nahledKontajner.style.display = 'block';
                };
                ctecka.readAsDataURL(soubor);
                vypis.textContent = ''; 
            }
        });
    }

    // 2. Odeslání na server přes Fetch API (FOTKY)
    if (btnNahrat) {
        btnNahrat.addEventListener('click', () => {
            const soubor = fotoVstup.files[0];

            if (!soubor) {
                vypis.style.color = 'red';
                vypis.textContent = "❌ Prosím, nejprve vyberte fotku!";
                return;
            }

            vypis.style.color = '#3b82f6';
            vypis.textContent = "⏳ Nahrávám...";

            const balicek = new FormData();
            balicek.append('foto', soubor);

            fetch('/api/nahrat-foto', {
                method: 'POST',
                body: balicek
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    vypis.style.color = 'green';
                    vypis.textContent = data.zprava;
                    
                    fotoVstup.value = '';
                    nahledKontajner.style.display = 'none';

                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                    
                } else {
                    vypis.style.color = 'red';
                    vypis.textContent = data.zprava;
                }
            })
            .catch(chyba => {
                console.error("Chyba spojení:", chyba);
                vypis.style.color = 'red';
                vypis.textContent = "❌ Nepodařilo se spojit se serverem.";
            });
        });
    }

    // 3. AUTOMATICKÉ SKRYTÍ FLASH ZPRÁV
    if (flashMessages) {
        setTimeout(() => {
            flashMessages.style.transition = "opacity 0.8s ease, transform 0.6s ease";
            flashMessages.style.opacity = "0";
            flashMessages.style.transform = "translateY(-20px)"; 

            setTimeout(() => {
                flashMessages.remove();
            }, 800);
        }, 3000);
    }

    // 4. REGISTRACE PŘES AJAX
    if (registracniFormular) {
        registracniFormular.addEventListener('submit', async (e) => {
            e.preventDefault();

            regTlacitko.disabled = true;
            regTlacitko.innerText = "Pracuji na tom... ⏳";
            regZprava.textContent = ""; 

            const formData = {
                jmeno: document.getElementById('jmeno').value,
                email: document.getElementById('email').value,
                heslo: document.getElementById('heslo').value
            };

            try {
                const response = await fetch('/api/registrace', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (response.ok) {
                    regZprava.style.color = "green";
                    regZprava.textContent = result.zprava;
                    setTimeout(() => {
                        window.location.href = result.redirect;
                    }, 1500);
                } else {
                    regZprava.style.color = "red";
                    regZprava.textContent = result.zprava;
                    regTlacitko.disabled = false;
                    regTlacitko.innerText = "Zaregistrovat se";
                }

            } catch (err) {
                console.error("Chyba při registraci:", err);
                regZprava.style.color = "red";
                regZprava.textContent = "Ups, spojení se serverem selhalo. 🔌";
                regTlacitko.disabled = false;
                regTlacitko.innerText = "Zaregistrovat se";
            }
        });
    }

    // --- 5. PŘIHLÁŠENÍ PŘES AJAX ---
    if (prihlasovaciFormular) {
        prihlasovaciFormular.addEventListener('submit', async (e) => {
            e.preventDefault(); // Zastavíme klasické odeslání

            // Vizuální zpětná vazba
            prihlTlacitko.disabled = true;
            prihlTlacitko.innerText = "Ověřuji údaje... ⏳";
            prihlZprava.textContent = ""; 

            // Sběr dat
            const formData = {
                email: document.getElementById('email').value,
                heslo: document.getElementById('heslo').value
            };

            try {
                const response = await fetch('/api/prihlaseni', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (response.ok) {
                    // Úspěšné přihlášení
                    prihlZprava.style.color = "green";
                    prihlZprava.textContent = result.zprava;
                    
                    // Přesměrování na index.html po chvíli
                    setTimeout(() => {
                        window.location.href = result.redirect;
                    }, 1000);
                } else {
                    // Špatné heslo nebo neexistující uživatel
                    prihlZprava.style.color = "red";
                    prihlZprava.textContent = result.zprava;
                    prihlTlacitko.disabled = false;
                    prihlTlacitko.innerText = "Přihlásit se";
                }

            } catch (err) {
                console.error("Chyba při přihlašování:", err);
                prihlZprava.style.color = "red";
                prihlZprava.textContent = "Ups, spojení se serverem selhalo. 🔌";
                prihlTlacitko.disabled = false;
                prihlTlacitko.innerText = "Přihlásit se";
            }
        });
    }

    // --- 6. SMAZÁNÍ FOTKY PŘES AJAX ---
    tlacitkaSmazat.forEach(tlacitko => {
        tlacitko.addEventListener('click', async (e) => {
            // Získáme ID fotky z data atributu tlačítka
            const fotoId = e.target.getAttribute('data-id');
            
            // Nahrazujeme původní onsubmit confirm
            if (!confirm('Opravdu chcete nenávratně smazat tuto fotku? 🗑️')) {
                return; // Pokud uživatel klikne na "Zrušit", nic se nestane
            }

            // Vizuální zpětná vazba na tlačítku
            e.target.disabled = true;
            e.target.innerText = "Mažu... ⏳";

            try {
                // Posíláme požadavek s metodou DELETE
                const response = await fetch(`/api/smazat-foto/${fotoId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (response.ok) {
                    // Úspěch! Najdeme celou kartu s fotkou a plynule ji schováme
                    const kartaFotky = document.getElementById(`fotka-karta-${fotoId}`);
                    if (kartaFotky) {
                        kartaFotky.style.transition = "opacity 0.4s ease, transform 0.4s ease";
                        kartaFotky.style.opacity = "0";
                        kartaFotky.style.transform = "scale(0.9)"; // Lehce se "zdrcne"
                        
                        // Po dokončení animace prvek úplně vymažeme z HTML
                        setTimeout(() => {
                            kartaFotky.remove();
                        }, 400);
                    }
                } else {
                    // Chyba ze strany serveru (např. uživatel nemá právo)
                    alert("Chyba: " + result.zprava);
                    e.target.disabled = false;
                    e.target.innerText = "Smazat";
                }

            } catch (err) {
                console.error("Chyba při mazání:", err);
                alert("Nepodařilo se spojit se serverem. 🔌");
                e.target.disabled = false;
                e.target.innerText = "Smazat";
            }
        });
    });
    
    // --- 7. ODHLÁŠENÍ PŘES AJAX ---
    if (btnOdhlasit) {
        btnOdhlasit.addEventListener('click', async () => {
            // Vizuální odezva
            btnOdhlasit.disabled = true;
            btnOdhlasit.innerText = "Odhlašuji... ⏳";
            if (odhlaseniZprava) odhlaseniZprava.textContent = "";

            try {
                const response = await fetch('/api/odhlaseni', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (response.ok) {
                    // Úspěšné odhlášení
                    if (odhlaseniZprava) {
                        odhlaseniZprava.style.color = "green";
                        odhlaseniZprava.textContent = result.zprava;
                    } else {
                        alert(result.zprava); // Pokud by na stránce nebyl div pro zprávu
                    }
                    
                    // Počkáme sekundu a přesměrujeme (stránka se reloadne a načte se stav pro nepřihlášené)
                    setTimeout(() => {
                        window.location.href = result.redirect;
                    }, 1000);
                } else {
                    alert("Chyba při odhlášení: " + result.zprava);
                    btnOdhlasit.disabled = false;
                    btnOdhlasit.innerText = "Odhlásit se";
                }

            } catch (err) {
                console.error("Chyba:", err);
                alert("Nepodařilo se spojit se serverem. 🔌");
                btnOdhlasit.disabled = false;
                btnOdhlasit.innerText = "Odhlásit se";
            }
        });
    }
});