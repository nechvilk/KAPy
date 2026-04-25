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

    // --- ELEMENTY PRO GENERÁTOR HESLA ---
    const btnGenerovat = document.getElementById('btn-generovat');
    const inputHeslo = document.getElementById('heslo');

    // --- ELEMENTY PRO PŘIHLÁŠENÍ ---
    const prihlasovaciFormular = document.getElementById('prihlasovaci-form');
    const prihlTlacitko = document.getElementById('prihl-tlacitko');

    // --- ELEMENTY PRO ODHLÁŠENÍ ---
    const btnOdhlasit = document.getElementById('btn-odhlasit');

    // --- ELEMENTY PRO ZVĚTŠENÍ FOTEK A LISTOVÁNÍ (MODAL) ---
    const modal = document.getElementById('foto-modal');
    const modalImg = document.getElementById('modal-obrazek');
    const modalPopisek = document.getElementById('modal-popisek');
    const btnZavrit = document.querySelector('.modal-zavrit');
    const btnLeva = document.getElementById('sipka-leva');
    const btnPrava = document.getElementById('sipka-prava');

// Naše "chytrá paměť" pro správu stavu fotek před odesláním
    let fotkyKNahrani = [];

    // --- 1. ZOBRAZENÍ NÁHLEDŮ (INTELIGENTNÍ VELIKOST + VYŘAZOVÁNÍ) ---
    if (fotoVstup) {
        fotoVstup.addEventListener('change', () => {
            const soubory = fotoVstup.files;
            
            // Vyčistíme kontejner a naši paměť při každém novém výběru
            nahledKontajner.innerHTML = ''; 
            fotkyKNahrani = []; 
            
            if (soubory.length > 0) {
                nahledKontajner.style.display = 'flex';
                nahledKontajner.style.flexWrap = 'wrap';
                nahledKontajner.style.gap = '10px';
                nahledKontajner.style.marginTop = '15px';
                nahledKontajner.style.justifyContent = 'center';

                // Inteligentní výpočet velikosti
                let velikost = 175; 
                if (soubory.length > 15) velikost = 70;  
                else if (soubory.length > 8) velikost = 100;  
                else if (soubory.length > 4) velikost = 120; 
                else if (soubory.length > 2) velikost = 150; 

                // Projdeme vybrané soubory
                Array.from(soubory).forEach((soubor, index) => {
                    if (soubor.type.startsWith('image/')) {
                        
                        // Uložíme si soubor do naší chytré paměti (ve výchozím stavu není vyřazen)
                        fotkyKNahrani.push({ dataSouboru: soubor, vyrazeno: false });

                        const ctecka = new FileReader();
                        ctecka.onload = (e) => {
                            const img = document.createElement('img');
                            img.src = e.target.result;
                            
                            // Stylování náhledu
                            img.style.width = velikost + 'px';
                            img.style.height = velikost + 'px';
                            img.style.objectFit = 'cover'; 
                            img.style.borderRadius = '8px';
                            img.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
                            img.style.opacity = '0';
                            
                            // Přidáme plynulý přechod i pro naše zešednutí (filter) a zmenšení (transform)
                            img.style.transition = 'opacity 0.3s ease-in, filter 0.3s ease, transform 0.3s ease';
                            
                            // Ukážeme uživateli, že na to jde kliknout (změní se kurzor na ručičku)
                            img.style.cursor = 'pointer';

                            // --- MAGIE KLIKÁNÍ PRO VYŘAZENÍ ---
                            img.addEventListener('click', () => {
                                // Přepneme stav v naší paměti
                                fotkyKNahrani[index].vyrazeno = !fotkyKNahrani[index].vyrazeno;
                                
                                if (fotkyKNahrani[index].vyrazeno) {
                                    // Zešedne, zprůhlední a mírně se zmenší (efekt "vypnuto")
                                    img.style.filter = 'grayscale(100%) opacity(40%)';
                                    img.style.transform = 'scale(0.85)';
                                } else {
                                    // Vrátí se do normálu
                                    img.style.filter = 'none';
                                    img.style.transform = 'scale(1)';
                                }
                            });

                            nahledKontajner.appendChild(img);
                            setTimeout(() => img.style.opacity = '1', 10);
                        };
                        ctecka.readAsDataURL(soubor);
                    }
                });
            } else {
                nahledKontajner.style.display = 'none';
            }
        });
    }

    // --- 2. NAHRÁVÁNÍ FOTEK S PROGRESS BAREM ---
    if (btnNahrat) {
        btnNahrat.addEventListener('click', () => {
            
            // Vyfiltrujeme z naší paměti jen ty fotky, které NEJSOU vyřazené
            const fotkyKOdeslani = fotkyKNahrani.filter(polozka => polozka.vyrazeno === false);

            if (fotkyKOdeslani.length === 0) {
                showToast("❌ Nemáte vybrané žádné fotky k nahrání!", "error");
                return;
            }

            const balicek = new FormData();
            
            // Zabalíme do FormData jen ty aktivní
            fotkyKOdeslani.forEach(polozka => {
                balicek.append('fotky', polozka.dataSouboru);
            });

            // Elementy progress baru
            const wrapper = document.getElementById('progress-wrapper');
            const bar = document.getElementById('progress-bar');
            const text = document.getElementById('progress-text');

            const xhr = new XMLHttpRequest();
            btnNahrat.disabled = true;
            wrapper.style.display = 'block';

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const procenta = Math.round((e.loaded / e.total) * 100);
                    bar.style.width = procenta + '%';
                    text.innerText = `Nahrávám: ${procenta}%`;
                }
            });

            xhr.onload = function() {
                const data = JSON.parse(xhr.responseText);
                
                if (xhr.status === 200 && data.status === 'success') {
                    showToast(data.zprava, "success");
                    
                    // Reset všeho po úspěšném nahrání
                    fotoVstup.value = '';
                    fotkyKNahrani = []; // Vyčistíme i naši paměť
                    nahledKontajner.innerHTML = ''; 
                    nahledKontajner.style.display = 'none';
                    
                    let grid = document.querySelector('.galerie-grid');
                    const kontejner = document.getElementById('galerie-kontejner');

                    if (!grid) {
                        kontejner.innerHTML = `<h2 style="text-align: center; margin-bottom: 20px;">Vaše galerie 🖼️</h2><div class="galerie-grid"></div>`;
                        grid = document.querySelector('.galerie-grid');
                    }

                    data.fotky.forEach(novaFotka => {
                        const kartaHTML = `
                            <div class="fotka-karta" id="fotka-karta-${novaFotka.id}">
                                <img src="/uploads/${novaFotka.cesta_k_souboru}" alt="${novaFotka.nazev_souboru}">
                                <p class="fotka-nazev" title="${novaFotka.nazev_souboru}">${novaFotka.nazev_souboru}</p>
                                <p class="fotka-datum">${novaFotka.datum_nahrani}</p>
                                <button type="button" class="btn btn-danger btn-smazat" data-id="${novaFotka.id}" style="width: 100%; padding: 8px; font-size: 0.85rem; margin-top: 10px;">Smazat</button>
                            </div>
                        `;
                        grid.insertAdjacentHTML('afterbegin', kartaHTML);
                    });
                    
                } else {
                    showToast(data.zprava || "Chyba při nahrávání", "error");
                }

                setTimeout(() => {
                    wrapper.style.display = 'none';
                    bar.style.width = '0%';
                    btnNahrat.disabled = false;
                }, 1000);
            };

            xhr.onerror = function() {
                showToast("❌ Chyba spojení se serverem.", "error");
                btnNahrat.disabled = false;
                wrapper.style.display = 'none';
            };

            xhr.open('POST', '/api/nahrat-foto');
            xhr.send(balicek);
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

    // 6. SMAZÁNÍ FOTKY PŘES AJAX (Upraveno na event delegation pro dynamicky přidané fotky)
    // Místo tlacitkaSmazat.forEach posloucháme kliknutí na celém dokumentu
    document.addEventListener('click', async (e) => {
        // Zkontrolujeme, zda to, na co se kliklo, je tlačítko "Smazat"
        if (e.target && e.target.classList.contains('btn-smazat')) {
            const tlacitko = e.target;
            const fotoId = tlacitko.getAttribute('data-id');
            
            if (!confirm('Opravdu chcete nenávratně smazat tuto fotku? 🗑️')) {
                return; 
            }

            tlacitko.disabled = true;
            tlacitko.innerText = "Mažu... ⏳";

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
                            
                            // Kontrola prázdné galerie
                            const grid = document.querySelector('.galerie-grid');
                            if (grid && grid.querySelectorAll('.fotka-karta').length === 0) {
                                const kontejner = document.getElementById('galerie-kontejner');
                                if (kontejner) {
                                    kontejner.innerHTML = `
                                        <h2 style="text-align: center; margin-bottom: 20px;">Vaše galerie 🖼️</h2>
                                        <p class="prazdna-galerie-info" style="text-align: center; color: #6b7280; background: #fff; padding: 20px; border-radius: 8px;">
                                            Zatím zde nemáte žádné fotky. Nahrajte svou první výše! 😊
                                        </p>
                                    `;
                                }
                            }
                        }, 400);
                    }
                } else {
                    showToast("Chyba: " + result.zprava, "error");
                    tlacitko.disabled = false;
                    tlacitko.innerText = "Smazat";
                }

            } catch (err) {
                console.error("Chyba při mazání:", err);
                showToast("Nepodařilo se spojit se serverem. 🔌", "error");
                tlacitko.disabled = false;
                tlacitko.innerText = "Smazat";
            }
        }
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

    let aktualniIndex = 0; // Pamatuje si, kde zrovna jsme

    // Pomocná funkce, která si VŽDY načte aktuální stav fotek na stránce
    function getAktualniFotky() {
        return Array.from(document.querySelectorAll('.fotka-karta img'));
    }

    // Funkce, která vykreslí fotku podle zadaného indexu
    function zobrazFotku(index) {
        const fotky = getAktualniFotky();
        
        // Pokud galerie zůstala po smazání prázdná, modal rovnou zavřeme
        if (fotky.length === 0) {
            modal.classList.remove('show');
            return;
        }

        // Kontrola, abychom nepřetáhli přes okraj (tzv. nekonečná smyčka)
        if (index >= fotky.length) aktualniIndex = 0;
        else if (index < 0) aktualniIndex = fotky.length - 1;
        else aktualniIndex = index;

        modalImg.src = fotky[aktualniIndex].src;
        modalPopisek.textContent = fotky[aktualniIndex].alt;
    }

    if (modal) {
        // Využijeme tzv. Event Delegation - nasloucháme kliknutí na celé stránce
        // a pokud to byl obrázek v galerii, zobrazíme ho.
        document.addEventListener('click', function(e) {
            if (e.target && e.target.matches('.fotka-karta img')) {
                console.log(e.target);
                const fotky = getAktualniFotky();
                // Zjistíme aktuální pozici kliknuté fotky v aktuálním seznamu
                aktualniIndex = fotky.indexOf(e.target); 
                
                if (aktualniIndex !== -1) {
                    modal.classList.add('show');
                    zobrazFotku(aktualniIndex);
                }
            }
        });

        // Kliknutí na šipku DOLEVA
        btnLeva.addEventListener('click', (e) => {
            e.stopPropagation(); 
            zobrazFotku(aktualniIndex - 1);
        });

        // Kliknutí na šipku DOPRAVA
        btnPrava.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log("Kliknuto na doprava, aktuální index:", aktualniIndex);
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

    // 9. GENERÁTOR HESLA
    if (btnGenerovat && inputHeslo) {
        btnGenerovat.addEventListener('click', async () => {
            // Animace na tlačítku
            const puvodniText = btnGenerovat.innerText;
            btnGenerovat.innerText = "Kouzlím... 🪄";
            btnGenerovat.disabled = true;

            try {
                // Zavoláme tvoji novou Python routu (metoda je defaultně GET)
                const response = await fetch('/api/generovat-heslo');
                const result = await response.json();

                if (response.ok && result.status === 'success') {
                    // Vložíme heslo do políčka
                    inputHeslo.value = result.heslo;
                    
                    // Odkryjeme heslo (změníme typ na text), aby ho uživatel viděl
                    inputHeslo.type = 'text'; 
                    
                    showToast("Bezpečné heslo bylo vygenerováno! 🔑", "success");
                } else {
                    showToast("Něco se pokazilo při generování hesla.", "error");
                }
            } catch (err) {
                console.error("Chyba:", err);
                showToast("Spojení se serverem selhalo. 🔌", "error");
            } finally {
                // Vrátíme tlačítko do původního stavu
                btnGenerovat.innerText = puvodniText;
                btnGenerovat.disabled = false;
            }
        });
    }

    // --- 10. ADMIN: PŘEPÍNÁNÍ BLOKACE PŘES AJAX ---
    document.addEventListener('click', async (e) => {
        // Zkontrolujeme, zda se kliklo na tlačítko pro blokaci
        if (e.target && e.target.classList.contains('btn-toggle-ban')) {
            const tlacitko = e.target;
            const userId = tlacitko.getAttribute('data-id');
            const puvodniText = tlacitko.innerText.trim();
            
            // Vizuální odezva
            tlacitko.disabled = true;
            tlacitko.innerText = "Zpracuji... ⏳";

            try {
                const response = await fetch(`/api/admin/prepni-blokaci/${userId}`, { 
                    method: 'POST' 
                });
                const result = await response.json();

                if (response.ok) {
                    // Úspěch! Upravíme DOM
                    const stavKontejner = document.getElementById(`stav-text-${userId}`);
                    
                    if (puvodniText === "Zablokovat") {
                        stavKontejner.innerHTML = '<span style="color: red; font-weight: bold;">Zablokován 🚫</span>';
                        tlacitko.innerText = "Odblokovat";
                    } else {
                        stavKontejner.innerHTML = '<span style="color: green;">Aktivní ✅</span>';
                        tlacitko.innerText = "Zablokovat";
                    }
                    // Využijeme tvoji funkci showToast!
                    showToast("Stav uživatele byl úspěšně změněn.", "success");
                } else {
                    showToast("Chyba: " + result.zprava, "error");
                    tlacitko.innerText = puvodniText; 
                }
            } catch (err) {
                console.error("Chyba spojení:", err);
                showToast("Nepodařilo se spojit se serverem. 🔌", "error");
                tlacitko.innerText = puvodniText; 
            } finally {
                tlacitko.disabled = false;
            }
        }
    });

});