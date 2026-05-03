document.addEventListener("DOMContentLoaded", () => {

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

    // --- 1. ZOBRAZENÍ ZÁSTUPNÝCH NÁHLEDŮ S MOŽNOSTÍ VYŘAZENÍ ---
    const dicomVstup = document.getElementById("dicom-vstup");
    const nahledKontejner = document.getElementById("dicom-nahled-kontajner");
    
    // Globální pole pro uchování vybraných souborů
    let dicomSouboryProUpload = [];

    if (dicomVstup) {
        dicomVstup.addEventListener("change", function() {
            nahledKontejner.innerHTML = ""; 
            dicomSouboryProUpload = [];     
            const soubory = this.files;

            if (soubory.length > 0) {
                nahledKontejner.style.display = "flex";
                
                Array.from(soubory).forEach((soubor, index) => {
                    dicomSouboryProUpload.push({ file: soubor, aktivni: true });

                    const polozka = document.createElement("div");
                    polozka.style.background = "#f8fafc";
                    polozka.style.border = "2px solid #3b82f6";
                    polozka.style.padding = "15px 10px";
                    polozka.style.borderRadius = "8px";
                    polozka.style.textAlign = "center";
                    polozka.style.width = "120px";
                    polozka.style.cursor = "pointer";
                    polozka.style.transition = "all 0.2s ease";
                    polozka.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
                    
                    polozka.innerHTML = `
                        <div style="font-size: 2.5rem; margin-bottom: 8px; pointer-events: none;">🏥</div>
                        <div style="font-size: 0.7rem; font-weight: bold; color: #1e293b; word-wrap: break-word; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; pointer-events: none;">${soubor.name}</div>
                        <div style="font-size: 0.6rem; color: #64748b; margin-top: 5px; pointer-events: none;">${(soubor.size / 1024).toFixed(1)} KB</div>
                    `;

                    polozka.addEventListener("click", () => {
                        const novyStav = !dicomSouboryProUpload[index].aktivni;
                        dicomSouboryProUpload[index].aktivni = novyStav;

                        if (novyStav) {
                            polozka.style.opacity = "1";
                            polozka.style.filter = "grayscale(0%)";
                            polozka.style.border = "2px solid #3b82f6";
                            polozka.style.transform = "scale(1)";
                        } else {
                            polozka.style.opacity = "0.4";
                            polozka.style.filter = "grayscale(100%)";
                            polozka.style.border = "2px dashed #cbd5e1";
                            polozka.style.transform = "scale(0.95)";
                        }
                    });

                    nahledKontejner.appendChild(polozka);
                });
            } else {
                nahledKontejner.style.display = "none";
            }
        });
    }

// --- 2. NAHRÁVÁNÍ NA SERVER S REÁLNÝM PROGRESS BAREM ---
    const tlacitkoNahrat = document.getElementById("tlacitko-nahrat-dicom");
    const progressWrapper = document.getElementById("dicom-progress-wrapper");
    const progressBar = document.getElementById("dicom-progress-bar");
    const progressText = document.getElementById("dicom-progress-text");

    if (tlacitkoNahrat) {
        tlacitkoNahrat.addEventListener("click", () => {
            // Vyfiltrujeme pouze ty soubory, které uživatel nezašednul
            const aktivniSoubory = dicomSouboryProUpload.filter(polozka => polozka.aktivni).map(p => p.file);
            
            if (aktivniSoubory.length === 0) {
                showToast("Nemáte vybrané žádné soubory k nahrání! 📁", "warning");
                return;
            }

            const formData = new FormData();
            aktivniSoubory.forEach(soubor => {
                formData.append("dicom_files", soubor);
            });

            tlacitkoNahrat.disabled = true;
            progressWrapper.style.display = "block";
            
            // Vytvoříme XMLHttpRequest pro sledování reálného uploadu
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/nahrat-dicom", true);

            // Sledujeme průběh nahrávání
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    const procenta = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = procenta + "%";
                    
                    if (procenta === 100) {
                        progressText.innerText = "Zpracovávám metadata a náhledy... ⏳";
                    } else {
                        progressText.innerText = `Nahrávám: ${procenta}%`;
                    }
                }
            });

            // Reakce po dokončení celého požadavku (včetně zpracování na serveru)
            xhr.onload = function() {
                try {
                    const result = JSON.parse(xhr.responseText);
                    
                    // xhr.status 200-299 znamená úspěch (záleží, co vrací tvůj backend)
                    if (xhr.status >= 200 && xhr.status < 300) {
                        progressBar.style.width = "100%";
                        //progressText.innerText = "Hotovo! ✅";
                        showToast("Snímky byly úspěšně nahrány.", "success");
                        
                        setTimeout(() => {
                            window.location.reload(); 
                        }, 1500);
                    } else {
                        showToast(result.zprava || "Chyba při nahrávání.", "error");
                        tlacitkoNahrat.disabled = false;
                        progressWrapper.style.display = "none";
                    }
                } catch (error) {
                    showToast("Chyba při čtení odpovědi ze serveru.", "error");
                    tlacitkoNahrat.disabled = false;
                    progressWrapper.style.display = "none";
                }
            };

            // Reakce na výpadek sítě / chybu spojení
            xhr.onerror = function() {
                showToast("Došlo k chybě spojení se serverem.", "error");
                tlacitkoNahrat.disabled = false;
                progressWrapper.style.display = "none";
            };

            // Odeslání požadavku
            xhr.send(formData);
        });
    }

    // --- 3. LOGIKA ZAŠKRTÁVÁTEK A ANALÝZY ---
    const btnAnalyzovat = document.getElementById("btn-spustit-analyzu");
    const analyzaKarta = document.getElementById("analyza-vysledky-karta");
    const analyzaData = document.getElementById("analyza-data");

    function aktualizujTlacitkoAnalyzy() {
        const vybrano = document.querySelectorAll(".dicom-checkbox:checked").length;
        if(btnAnalyzovat) {
            btnAnalyzovat.innerText = `Analyzovat vybrané (${vybrano})`;
            btnAnalyzovat.disabled = vybrano === 0;
        }
    }

    document.addEventListener("change", function(e) {
        if(e.target && e.target.classList.contains("dicom-checkbox")) {
            aktualizujTlacitkoAnalyzy();
        }
    });

    if (btnAnalyzovat) {
        btnAnalyzovat.addEventListener("click", async () => {
            const vybranaIDs = Array.from(document.querySelectorAll(".dicom-checkbox:checked")).map(cb => cb.value);
            
            btnAnalyzovat.innerText = "Počítám... ⏳";
            btnAnalyzovat.disabled = true;

            try {
                const response = await fetch("/api/analyzovat-vyber", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: vybranaIDs })
                });

                const result = await response.json();

                if (response.ok) {
                    const stat = result.data;
                    analyzaKarta.style.display = "block";
                    analyzaData.innerHTML = `
                        <div style="text-align: center; padding: 10px;">
                            <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">${stat.pocet}</div>
                            <div style="color: #64748b; font-size: 0.9rem;">Snímků</div>
                        </div>
                        <div style="text-align: center; padding: 10px;">
                            <div style="font-size: 2rem; font-weight: bold; color: #10b981;">${stat.prumer}</div>
                            <div style="color: #64748b; font-size: 0.9rem;">Průměrné KAP</div>
                        </div>
                        <div style="text-align: center; padding: 10px;">
                            <div style="font-size: 2rem; font-weight: bold; color: #ef4444;">${stat.max}</div>
                            <div style="color: #64748b; font-size: 0.9rem;">Max KAP</div>
                        </div>
                    `;
                    showToast("Analýza byla úspěšně dokončena.", "success");
                    analyzaKarta.scrollIntoView({ behavior: 'smooth' });
                } else {
                    showToast(result.zprava || "Chyba při výpočtu.", "error");
                }
            } catch (error) {
                showToast("Chyba při komunikaci se serverem.", "error");
            } finally {
                aktualizujTlacitkoAnalyzy(); 
            }
        });
    }

    // --- 4. MAZÁNÍ DICOMU ---
    document.addEventListener("click", async function(e) {
        if(e.target && e.target.classList.contains("btn-smazat-dicom")) {
            const btn = e.target;
            
            // Confirm vyskakovací okno u mazání si většinou necháváme jako bezpečnostní pojistku
            if (!confirm("Opravdu chcete tento DICOM záznam smazat?")) return;
            
            const dicomId = btn.getAttribute("data-id");
            const puvodniText = btn.innerText;
            btn.innerText = "Mažu... ⏳";
            btn.disabled = true;

            try {
                const response = await fetch(`/api/smazat-dicom/${dicomId}`, { method: "DELETE" });
                const result = await response.json();

                if (response.ok) {
                    const karta = document.getElementById(`dicom-karta-${dicomId}`);
                    if (karta) {
                        // Přidáme malý efekt zmizení před odstraněním
                        karta.style.opacity = '0';
                        setTimeout(() => karta.remove(), 300);
                    }
                    
                    showToast("Záznam byl úspěšně smazán.", "success");
                    aktualizujTlacitkoAnalyzy(); 

                    setTimeout(() => {
                        const container = document.getElementById('dicom-seznam');
                        const zbyvajiciKarty = container.querySelectorAll('.fotka-karta');

                        if (zbyvajiciKarty.length === 0) {
                            container.innerHTML = `
                                <p id="empty-message" style="text-align: center; color: #6b7280; background: #fff; padding: 40px; border-radius: 8px; grid-column: 1 / -1;">
                                    V archivu nemáte žádné DICOM snímky.
                                </p>`;
                        }
                    }, 350);

                } else {
                    showToast(result.zprava || "Chyba při mazání.", "error");
                    btn.innerText = puvodniText;
                    btn.disabled = false;
                }
            } catch (error) {
                showToast("Chyba spojení při mazání.", "error");
                btn.innerText = puvodniText;
                btn.disabled = false;
            }
        }
    });

// --- 5. ZVĚTŠENÍ DICOM NÁHLEDU (Sjednocená verze) ---
    const dicomModal = document.getElementById('dicom-modal');
    const dicomModalImg = document.getElementById('dicom-modal-img');
    const dicomModalPopisek = document.getElementById('dicom-modal-popisek');
    const dicomBtnZavrit = document.getElementById('dicom-btn-zavrit');
    const dicomBtnLeva = document.getElementById('dicom-btn-leva');
    const dicomBtnPrava = document.getElementById('dicom-btn-prava');

    let dicomAktualniIndex = 0;

    function getAktualniDicomFotky() {
        return Array.from(document.querySelectorAll('.fotka-karta img'));
    }

    function zobrazDicomFotku(index) {
        const fotky = getAktualniDicomFotky();
        if (fotky.length === 0) {
            dicomModal.classList.remove('show');
            return;
        }

        if (index >= fotky.length) dicomAktualniIndex = 0;
        else if (index < 0) dicomAktualniIndex = fotky.length - 1;
        else dicomAktualniIndex = index;

        dicomModalImg.src = fotky[dicomAktualniIndex].src;
        dicomModalPopisek.textContent = fotky[dicomAktualniIndex].alt;
    }

    if (dicomModal) {
        document.addEventListener('click', function(e) {
            if (e.target && e.target.matches('.fotka-karta img')) {
                const fotky = getAktualniDicomFotky();
                dicomAktualniIndex = fotky.indexOf(e.target); 
                
                if (dicomAktualniIndex !== -1) {
                    dicomModal.classList.add('show'); // Použití sjednocené třídy
                    zobrazDicomFotku(dicomAktualniIndex);
                }
            }
        });

        dicomBtnLeva.addEventListener('click', (e) => {
            e.stopPropagation(); 
            zobrazDicomFotku(dicomAktualniIndex - 1);
        });

        dicomBtnPrava.addEventListener('click', (e) => {
            e.stopPropagation();
            zobrazDicomFotku(dicomAktualniIndex + 1);
        });

        dicomBtnZavrit.addEventListener('click', () => dicomModal.classList.remove('show'));

        dicomModal.addEventListener('click', (e) => {
            if (e.target === dicomModal) dicomModal.classList.remove('show');
        });

        document.addEventListener('keydown', (e) => {
            if (dicomModal.classList.contains('show')) {
                if (e.key === "Escape") dicomModal.classList.remove('show');
                if (e.key === "ArrowLeft") zobrazDicomFotku(dicomAktualniIndex - 1);
                if (e.key === "ArrowRight") zobrazDicomFotku(dicomAktualniIndex + 1);
            }
        });
    }

});