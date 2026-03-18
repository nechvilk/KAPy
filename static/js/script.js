document.addEventListener('DOMContentLoaded', () => {
    const fotoVstup = document.querySelector('#foto-vstup');
    const nahledImg = document.querySelector('#nahled-obrazek');
    const nahledKontajner = document.querySelector('#nahled-kontajner');
    const btnNahrat = document.querySelector('#tlacitko-nahrat');
    const vypis = document.querySelector('#vypis');

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
                // Vyčistíme případnou předchozí zprávu
                vypis.textContent = ''; 
            }
        });
    }

    // 2. Odeslání na server přes Fetch API
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
                    
                    // Vyčistíme formulář po úspěšném nahrání
                    fotoVstup.value = '';
                    nahledKontajner.style.display = 'none';

                    // --- NOVÁ ČÁST: Automatické obnovení stránky ---
                    // Počkáme 1.5 sekundy, aby si uživatel stihl přečíst zprávu, a pak načteme galerii znovu
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
});