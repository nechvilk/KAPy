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

    // --- 5. NOVÉ: PŘIHLÁŠENÍ PŘES AJAX ---
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
});