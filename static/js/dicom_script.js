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

// --- 1. ZOBRAZENÍ REÁLNÝCH NÁHLEDŮ S MOŽNOSTÍ VYŘAZENÍ ---
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
                
                // Místo emodži vytvoříme element canvas pro náhled
                const canvasId = `canvas_dcm_${index}`;
                
                polozka.innerHTML = `
                    <div style="width: 100px; height: 100px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                        <canvas id="${canvasId}" width="100" height="100" style="max-width: 100%; max-height: 100%; display: none; pointer-events: none;"></canvas>
                        <div id="loader_${index}" style="font-size: 0.8rem; color: #64748b; pointer-events: none;">Načítám...</div>
                    </div>
                    <div style="font-size: 0.7rem; font-weight: bold; color: #1e293b; word-wrap: break-word; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; pointer-events: none;">${soubor.name}</div>
                    <div style="font-size: 0.6rem; color: #64748b; margin-top: 5px; pointer-events: none;">${(soubor.size / (1024 * 1024)).toFixed(2)} MB</div>
                `;

                // Spustíme asynchronní parsování a vykreslení DICOMu
                vykresliDicomNahled(soubor, canvasId, `loader_${index}`);

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

// --- POMOCNÁ FUNKCE PRO RYCHLÉ PARSOVÁNÍ RAW DICOM DATA ---
function vykresliDicomNahled(file, canvasId, loaderId) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const buffer = e.target.result;
            const view = new DataView(buffer);
            
            // Základní kontrola DICOM "DICM" prefixu na offsetu 128
            const magic = String.fromCharCode(view.getUint8(128), view.getUint8(129), view.getUint8(130), view.getUint8(131));
            if (magic !== "DICM") throw new Error("Není DICOM");

            let rows = 512; // fallback, pokud parsování selže
            let cols = 512;
            let pixelDataOffset = -1;
            let bitsAllocated = 16;

            // Velmi jednoduchý a rychlý skener tagů
            for (let i = 132; i < buffer.byteLength - 8; i += 2) {
                // Hledáme tagy (Group, Element)
                const group = view.getUint16(i, true);
                const element = view.getUint16(i + 2, true);

                if (group === 0x0028 && element === 0x0010) { // Rows
                    rows = view.getUint16(i + 8, true);
                } else if (group === 0x0028 && element === 0x0011) { // Columns
                    cols = view.getUint16(i + 8, true);
                } else if (group === 0x0028 && element === 0x00100) { // Bits Allocated
                    bitsAllocated = view.getUint16(i + 8, true);
                } else if (group === 0x7fe0 && element === 0x0010) { // Pixel Data
                    // Detekce, zda jde o explicitní nebo implicitní VR (přeskočení délky dat)
                    const vr = String.fromCharCode(view.getUint8(i + 4), view.getUint8(i + 5));
                    if (["OW", "OB", "UN"].includes(vr)) {
                        pixelDataOffset = i + 12;
                    } else {
                        pixelDataOffset = i + 8;
                    }
                    break; // Našli jsme pixely, můžeme končit hledání tagů
                }
            }

            if (pixelDataOffset === -1) throw new Error("Pixel data nenašlo");

            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            
            // Inicializace dočasného canvasu v plné velikosti DICOMu
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = cols;
            tempCanvas.height = rows;
            const tempCtx = tempCanvas.getContext('2d');
            const imgData = tempCtx.createImageData(cols, rows);

            // Čtení pixelů (předpokládáme standardní 16-bit nebo 8-bit nekomprimovaný grayscale)
            let min = 65535, max = 0;
            const numPixels = cols * rows;
            const pixels = new Uint16Array(numPixels);

            if (bitsAllocated === 16) {
                for (let p = 0; p < numPixels; p++) {
                    const offset = pixelDataOffset + (p * 2);
                    if (offset + 1 < buffer.byteLength) {
                        const val = view.getUint16(offset, true);
                        pixels[p] = val;
                        if (val < min) min = val;
                        if (val > max) max = val;
                    }
                }
            } else { // 8-bit fallback
                for (let p = 0; p < numPixels; p++) {
                    const offset = pixelDataOffset + p;
                    if (offset < buffer.byteLength) {
                        const val = view.getUint8(offset);
                        pixels[p] = val;
                        if (val < min) min = val;
                        if (val > max) max = val;
                    }
                }
            }

            // Rychlé okénkování (min/max rozsah) pro optimální kontrast na webu
            const range = max - min || 1;
            for (let p = 0; p < numPixels; p++) {
                const norm = ((pixels[p] - min) / range) * 255;
                const idx = p * 4;
                imgData.data[idx] = norm;     // R
                imgData.data[idx + 1] = norm; // G
                imgData.data[idx + 2] = norm; // B
                imgData.data[idx + 3] = 255;  // Alpha
            }

            tempCtx.putImageData(imgData, 0, 0);

            // Zmenšení velkého snímku do malého
            // 1. Výpočet správného měřítka pro zachování poměru stran
            const meritko = Math.min(100 / cols, 100 / rows);
            const novaSirka = cols * meritko;
            const novaVyska = rows * meritko;
            
            // 2. Výpočet odsazení pro vycentrování v našem 100x100 boxu
            const offsetX = (100 - novaSirka) / 2;
            const offsetY = (100 - novaVyska) / 2;

            // 3. Vykreslení (původní_canvas, x_zdroj, y_zdroj, sirka_zdroj, vyska_zdroj, x_cil, y_cil, sirka_cil, vyska_cil)
            ctx.drawImage(tempCanvas, 0, 0, cols, rows, offsetX, offsetY, novaSirka, novaVyska);
            
            // Schovat loader a ukázat canvas
            document.getElementById(loaderId).style.display = "none";
            canvas.style.display = "block";

        } catch (err) {
            // Při chybě parsování (např. komprimovaný JPEG2000 DICOM) zobrazíme náhradní text
            document.getElementById(loaderId).innerText = "Snímek (No Preview)";
        }
    };
    reader.readAsArrayBuffer(file);
}

    // --- 2. NAHRÁVÁNÍ NA SERVER VČETNĚ KLIENTSKÉ ANONYMIZACE ---
    const tlacitkoNahrat = document.getElementById("tlacitko-nahrat-dicom");
    const progressWrapper = document.getElementById("dicom-progress-wrapper");
    const progressBar = document.getElementById("dicom-progress-bar");
    const progressText = document.getElementById("dicom-progress-text");

    if (tlacitkoNahrat) {
        // Změna na async funkci, abychom mohli čekat na zpracování souborů
        tlacitkoNahrat.addEventListener("click", async () => {
            const aktivniSoubory = dicomSouboryProUpload.filter(polozka => polozka.aktivni).map(p => p.file);
            
            if (aktivniSoubory.length === 0) {
                showToast("❌ Nemáte vybrané žádné soubory k nahrání!", "error");
                return;
            }

            tlacitkoNahrat.disabled = true;
            progressWrapper.style.display = "block";
            progressText.innerText = "Anonymizuji citlivá data v prohlížeči... 🛡️";

            const formData = new FormData();

            // Snímky proženeme anonymizérem přímo v RAM paměti PC před odesláním
            for (const soubor of aktivniSoubory) {
                try {
                    const anonymniBlob = await anonymizujDicomVProhlizeci(soubor);
                    // Přidáme vyčištěný Blob do formuláře pod stejným názvem
                    formData.append("dicom_files", anonymniBlob, soubor.name);
                } catch (chybaAnonymizace) {
                    console.error("Chyba při čištění souboru:", soubor.name, chybaAnonymizace);
                    showToast(`❌ Nepodařilo se bezpečně vyčistit soubor ${soubor.name}. Nahrávání bylo zrušeno.`, "error");
                    tlacitkoNahrat.disabled = false;
                    progressWrapper.style.display = "none";
                    return;
                }
            }

            // --- DYNAMICKÁ DETEKCE KATEGORIE Z URL ADRESY ---
            const cestaSegmenty = window.location.pathname.split('/').filter(p => p !== "");
            let aktualniKategorie = "vse";
            
            const indexDicom = cestaSegmenty.indexOf("muj-dicom");
            if (indexDicom !== -1 && cestaSegmenty[indexDicom + 1]) {
                aktualniKategorie = cestaSegmenty[indexDicom + 1];
            }
            
            formData.append("kategorie", aktualniKategorie);
            // ------------------------------------------------
            
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/nahrat-dicom", true);

            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    const procenta = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = procenta + "%";
                    
                    if (procenta === 100) {
                        progressText.innerText = "Server zpracovává metadata... ⏳";
                    } else {
                        progressText.innerText = `Bezpečné nahrávání: ${procenta}%`;
                    }
                }
            });

            xhr.onload = function() {
                try {
                    const result = JSON.parse(xhr.responseText);
                    
                    if (xhr.status >= 200 && xhr.status < 300) {
                        progressBar.style.width = "100%";
                        showToast("Snímky byly bezpečně nahrány.", "success");
                        
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

            xhr.onerror = function() {
                showToast("Došlo k chybě spojení se serverem.", "error");
                tlacitkoNahrat.disabled = false;
                progressWrapper.style.display = "none";
            };

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
                    
                    let htmlObsah = `
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

                    if (stat.hmotnost_prumer !== "N/A") {
                        htmlObsah += `
                        <div style="text-align: center; padding: 10px; border-left: 1px solid #e2e8f0;">
                            <div style="font-size: 2rem; font-weight: bold; color: #f59e0b;">${stat.hmotnost_prumer}</div>
                            <div style="color: #64748b; font-size: 0.9rem;">Prům. hmotnost (kg)</div>
                        </div>
                        `;
                    }

                    analyzaData.innerHTML = htmlObsah;
                    
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
                        karta.style.opacity = '0';
                        setTimeout(() => karta.remove(), 300);
                    }
                    
                    showToast("Záznam byl úspěšně smazán.", "success");
                    aktualizujTlacitkoAnalyzy(); 

                    setTimeout(() => {
                        const container = document.getElementById('dicom-seznam');
                        const zbyvajiciKarty = container ? container.querySelectorAll('.fotka-karta') : [];

                        if (zbyvajiciKarty.length === 0 && container) {
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

    // --- 5. ZVĚTŠENÍ DICOM NÁHLEDU ---
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
            if(dicomModal) dicomModal.classList.remove('show');
            return;
        }

        if (index >= fotky.length) dicomAktualniIndex = 0;
        else if (index < 0) dicomAktualniIndex = fotky.length - 1;
        else dicomAktualniIndex = index;

        if(dicomModalImg) dicomModalImg.src = fotky[dicomAktualniIndex].src;
        if(dicomModalPopisek) dicomModalPopisek.textContent = fotky[dicomAktualniIndex].alt;
    }

    if (dicomModal) {
        document.addEventListener('click', function(e) {
            if (e.target && e.target.matches('.fotka-karta img')) {
                const fotky = getAktualniDicomFotky();
                dicomAktualniIndex = fotky.indexOf(e.target); 
                
                if (dicomAktualniIndex !== -1) {
                    dicomModal.classList.add('show');
                    zobrazDicomFotku(dicomAktualniIndex);
                }
            }
        });

        if(dicomBtnLeva) {
            dicomBtnLeva.addEventListener('click', (e) => {
                e.stopPropagation(); 
                zobrazDicomFotku(dicomAktualniIndex - 1);
            });
        }

        if(dicomBtnPrava) {
            dicomBtnPrava.addEventListener('click', (e) => {
                e.stopPropagation();
                zobrazDicomFotku(dicomAktualniIndex + 1);
            });
        }

        if(dicomBtnZavrit) {
            dicomBtnZavrit.addEventListener('click', () => dicomModal.classList.remove('show'));
        }

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

// --- POMOCNÁ FUNKCE PRO BINÁRNÍ ANONYMIZACI NA FRONTENDU ---
function anonymizujDicomVProhlizeci(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const buffer = e.target.result;
                const view = new DataView(buffer);
                const uint8 = new Uint8Array(buffer);
                
                // Ověření DICM hlavičky
                const magic = String.fromCharCode(view.getUint8(128), view.getUint8(129), view.getUint8(130), view.getUint8(131));
                if (magic !== "DICM") {
                    // Pokud to z nějakého důvodu není DICOM, pustíme ho dál beze změny
                    resolve(file);
                    return;
                }

                // Definice tagů k vyčištění (Group, Element, Nová hodnota)
                const tagyKAnonymizaci = [
                    { g: 0x0010, e: 0x0010, novyText: "ANONYMOUS^PATIENT" }, // PatientName
                    { g: 0x0010, e: 0x0020, novyText: "anonymous" },         // PatientID
                    { g: 0x0010, e: 0x0030, novyText: "00000000" },          // PatientBirthDate
                    { g: 0x0008, e: 0x0080, novyText: "ANONYMOUS" },         // InstitutionName
                    { g: 0x0008, e: 0x0090, novyText: "" },                  // ReferringPhysicianName
                    { g: 0x0008, e: 0x1050, novyText: "" }                   // PerformingPhysicianName
                ];

                // Procházíme soubor bajt po bajtu
                for (let i = 132; i < buffer.byteLength - 12; i++) {
                    const group = view.getUint16(i, true);
                    const element = view.getUint16(i + 2, true);

                    // OPTIMALIZACE: Jakmile narazíme na Pixel Data (0x7fe0, 0x0010), 
                    // máme jistotu, že všechny textové hlavičky už proběhly. Můžeme vykočit a ušetřit čas.
                    if (group === 0x7fe0 && element === 0x0010) {
                        break;
                    }

                    const nalezenyTag = tagyKAnonymizaci.find(t => t.g === group && t.e === element);
                    if (nalezenyTag) {
                        // Detekce Explicit VR (jestli jsou na pozici i+4 dvě velká ASCII písmena)
                        const c1 = view.getUint8(i + 4);
                        const c2 = view.getUint8(i + 5);
                        const jeExplicit = (c1 >= 65 && c1 <= 90) && (c2 >= 65 && c2 <= 90);

                        let offsetHodnoty = 0;
                        let delkaHodnoty = 0;

                        if (jeExplicit) {
                            // Běžné textové VR (PN, LO, DA, SH) mají délku uloženu jako 16-bit integer na offsetu i+6
                            delkaHodnoty = view.getUint16(i + 6, true);
                            offsetHodnoty = i + 8;
                        } else {
                            // Implicit VR má délku uloženu jako 32-bit integer na offsetu i+4
                            delkaHodnoty = view.getUint32(i + 4, true);
                            offsetHodnoty = i + 8;
                        }

                        // Pokud má pole nějakou délku a nepřeteče soubor, vygumujeme ho
                        if (delkaHodnoty > 0 && (offsetHodnoty + delkaHodnoty) <= buffer.byteLength) {
                            // 1. Vyplníme celou původní délku mezerami (0x20)
                            for (let k = 0; k < delkaHodnoty; k++) {
                                uint8[offsetHodnoty + k] = 0x20;
                            }
                            // 2. Vepíšeme náš bezpečný text (pokud nějaký chceme vložit)
                            const text = nalezenyTag.novyText;
                            for (let k = 0; k < Math.min(text.length, delkaHodnoty); k++) {
                                uint8[offsetHodnoty + k] = text.charCodeAt(k);
                            }
                        }
                    }
                }

                // Vytvoříme z upraveného bufferu nový bezpečný Blob (fiktivní soubor)
                const vycistenyBlob = new Blob([buffer], { type: file.type });
                resolve(vycistenyBlob);

            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

});