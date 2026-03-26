document.addEventListener('DOMContentLoaded', () => {

    // --- FUNKCE PRO TOAST NOTIFIKACE ---
    function showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerText = message;
        container.appendChild(toast);

        // Animace zobrazení
        setTimeout(() => toast.classList.add('show'), 10);

        // Automatické skrytí
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // --- ELEMENTY PRO NAHRÁVÁNÍ FOTEK ---
    const fotoVstup = document.querySelector('#foto-vstup');
    const nahledImg = document.querySelector('#nahled-obrazek');
    const nahledKontajner = document.querySelector('#nahled-kontajner');
    const btnNahrat = document.querySelector('#tlacitko-nahrat');

    // --- ELEMENTY PRO FLASH ZPRÁVY (Serverové) ---
    const flashMessages = document.querySelector('.flash-messages');

    // --- ELEMENTY PRO REGISTRACI ---
    const registracniFormular = document.getElementById('registracni-form');
    const regTlacitko = document.getElementById('reg-tlacitko');

    // --- ELEMENTY PRO PŘIHLÁŠENÍ ---
    const prihlasovaciFormular = document.getElementById('prihlasovaci-form');
    const prihlTlacitko = document.getElementById('prihl-tlacitko');

    // --- ELEMENTY PRO MAZÁNÍ FOTEK ---
    const tlacitkaSmazat = document.querySelectorAll('.btn-smazat');

    // --- ELEMENTY PRO ODHLÁŠENÍ ---
    const btnOdhlasit = document.getElementById('btn-odhlasit');

    // --- ELEMENTY PRO ZVĚTŠENÍ FOTEK A LISTOVÁNÍ (MODAL) ---
    const modal = document.getElementById('foto-modal');
    const modalImg = document.getElementById('modal-obrazek');
    const modalPopisek = document.getElementById('modal-popisek');
    const btnZavrit = document.querySelector('.modal-zavrit');
    const btnLeva = document.getElementById('sipka-leva');
    const btnPrava = document.getElementById('sipka-prava');
    

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
            }
        });
    }

    // 2. Odeslání na server přes Fetch API (FOTKY)
    if (btnNahrat) {
        btnNahrat.addEventListener('click', () => {
            const soubor = fotoVstup.files[0];

            if (!soubor) {
                showToast("❌ Prosím, nejprve vyberte fotku!", "error");
                return;
            }

            showToast("⏳ Nahrávám...", "info");

            const balicek = new FormData();
            balicek.append('foto', soubor);

            fetch('/api/nahrat-foto', {
                method: 'POST',
                body: balicek
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    showToast(data.zprava, "success");
                    fotoVstup.value = '';
                    nahledKontajner.style.display = 'none';

                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                    
                } else {
                    showToast(data.zprava, "error");
                }
            })
            .catch(chyba => {
                console.error("Chyba spojení:", chyba);
                showToast("❌ Nepodařilo se spojit se serverem.", "error");
            });
        });
    }

    // 3. AUTOMATICKÉ SKRYTÍ FLASH ZPRÁV (Zůstává pro klasické serverové zprávy)
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
                    showToast(result.zprava, "success");
                    setTimeout(() => {
                        window.location.href = result.redirect;
                    }, 1500);
                } else {
                    showToast(result.zprava, "error");
                    regTlacitko.disabled = false;
                    regTlacitko.innerText = "Zaregistrovat se";
                }

            } catch (err) {
                console.error("Chyba při registraci:", err);
                showToast("Ups, spojení se serverem selhalo. 🔌", "error");
                regTlacitko.disabled = false;
                regTlacitko.innerText = "Zaregistrovat se";
            }
        });
    }

    // 5. PŘIHLÁŠENÍ PŘES AJAX
    if (prihlasovaciFormular) {
        prihlasovaciFormular.addEventListener('submit', async (e) => {
            e.preventDefault(); 

            prihlTlacitko.disabled = true;
            prihlTlacitko.innerText = "Ověřuji údaje... ⏳";

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
                    showToast(result.zprava, "success");
                    setTimeout(() => {
                        window.location.href = result.redirect;
                    }, 1000);
                } else {
                    showToast(result.zprava, "error");
                    prihlTlacitko.disabled = false;
                    prihlTlacitko.innerText = "Přihlásit se";
                }

            } catch (err) {
                console.error("Chyba při přihlašování:", err);
                showToast("Ups, spojení se serverem selhalo. 🔌", "error");
                prihlTlacitko.disabled = false;
                prihlTlacitko.innerText = "Přihlásit se";
            }
        });
    }

    // 6. SMAZÁNÍ FOTKY PŘES AJAX
    tlacitkaSmazat.forEach(tlacitko => {
        tlacitko.addEventListener('click', async (e) => {
            const fotoId = e.target.getAttribute('data-id');
            
            if (!confirm('Opravdu chcete nenávratně smazat tuto fotku? 🗑️')) {
                return; 
            }

            e.target.disabled = true;
            e.target.innerText = "Mažu... ⏳";

            try {
                const response = await fetch(`/api/smazat-foto/${fotoId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (response.ok) {
                    showToast("Fotka byla smazána.", "success");
                    const kartaFotky = document.getElementById(`fotka-karta-${fotoId}`);
                    if (kartaFotky) {
                        kartaFotky.style.transition = "opacity 0.4s ease, transform 0.4s ease";
                        kartaFotky.style.opacity = "0";
                        kartaFotky.style.transform = "scale(0.9)"; 
                        
                        setTimeout(() => {
                            kartaFotky.remove();
                        }, 400);
                    }
                } else {
                    showToast("Chyba: " + result.zprava, "error");
                    e.target.disabled = false;
                    e.target.innerText = "Smazat";
                }

            } catch (err) {
                console.error("Chyba při mazání:", err);
                showToast("Nepodařilo se spojit se serverem. 🔌", "error");
                e.target.disabled = false;
                e.target.innerText = "Smazat";
            }
        });
    });
    
    // 7. ODHLÁŠENÍ PŘES AJAX
    if (btnOdhlasit) {
        btnOdhlasit.addEventListener('click', async () => {
            btnOdhlasit.disabled = true;
            btnOdhlasit.innerText = "Odhlašuji... ⏳";

            try {
                const response = await fetch('/api/odhlaseni', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (response.ok) {
                    showToast(result.zprava, "success");
                    setTimeout(() => {
                        window.location.href = result.redirect;
                    }, 1000);
                } else {
                    showToast("Chyba při odhlášení: " + result.zprava, "error");
                    btnOdhlasit.disabled = false;
                    btnOdhlasit.innerText = "Odhlásit se";
                }

            } catch (err) {
                console.error("Chyba:", err);
                showToast("Nepodařilo se spojit se serverem. 🔌", "error");
                btnOdhlasit.disabled = false;
                btnOdhlasit.innerText = "Odhlásit se";
            }
        });
    }

    // --- 8. ZVĚTŠENÍ FOTKY A LISTOVÁNÍ (MODAL) ---

    // Vytvoříme z obrázků skutečné pole (Array), abychom v něm mohli listovat
    const nahledyFotek = Array.from(document.querySelectorAll('.fotka-karta img'));
    let aktualniIndex = 0; // Pamatuje si, kde zrovna jsme

    // Funkce, která vykreslí fotku podle zadaného indexu
    function zobrazFotku(index) {
        // Kontrola, abychom nepřetáhli přes okraj (tzv. nekonečná smyčka)
        if (index >= nahledyFotek.length) aktualniIndex = 0;
        else if (index < 0) aktualniIndex = nahledyFotek.length - 1;
        else aktualniIndex = index;

        modalImg.src = nahledyFotek[aktualniIndex].src;
        modalPopisek.textContent = nahledyFotek[aktualniIndex].alt;
    }

    if (modal && nahledyFotek.length > 0) {
        // Kliknutí na malou fotku v galerii
        nahledyFotek.forEach((img, index) => {
            img.addEventListener('click', function() {
                modal.classList.add('show');
                zobrazFotku(index); // Zavoláme naši novou funkci
            });
        });

        // Kliknutí na šipku DOLEVA
        btnLeva.addEventListener('click', (e) => {
            e.stopPropagation(); // Zabrání tomu, aby se modal omylem zavřel kliknutím
            zobrazFotku(aktualniIndex - 1);
        });

        // Kliknutí na šipku DOPRAVA
        btnPrava.addEventListener('click', (e) => {
            e.stopPropagation();
            zobrazFotku(aktualniIndex + 1);
        });

        // Zavření křížkem
        btnZavrit.addEventListener('click', () => modal.classList.remove('show'));

        // Zavření kliknutím kamkoliv VEDLE fotky (ale ne na šipky)
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });

        // Klávesové zkratky (Escape pro zavření, šipky pro listování)
        document.addEventListener('keydown', (e) => {
            if (modal.classList.contains('show')) {
                if (e.key === "Escape") modal.classList.remove('show');
                if (e.key === "ArrowLeft") zobrazFotku(aktualniIndex - 1);
                if (e.key === "ArrowRight") zobrazFotku(aktualniIndex + 1);
            }
        });
    }
});