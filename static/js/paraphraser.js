// static/js/paraphraser.js

async function submitParaForm(e) {
    const form = document.getElementById('paraForm');
    const fd = new FormData(form);

    // Tambahkan mode
    fd.append("mode", document.getElementById("modeSelect").value);

    try { showLoadingOverlay(); } catch (err) {}

    try {
        const resp = await fetch(form.dataset.processUrl, { method: 'POST', body: fd });
        if (!resp.ok) {
            const txt = await resp.text();
            try { alertUser('Error: ' + txt); } catch (e) {}
            return;
        }

        const data = await resp.json();
        const out = data.paraphrased || '';

        const resEl = document.getElementById('paraResult');
        resEl.textContent = out;
        document.getElementById('resultArea').classList.remove('hidden');

        // setup download link
        const blob = new Blob([out], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const dl = document.getElementById('downloadLink');
        dl.href = url; dl.download = 'tulis_web_toolkit.txt'; dl.classList.remove('hidden');

        const copyBtn = document.getElementById('copyBtn');
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(out)
                .then(()=>{ alertUser('✅ Disalin'); })
                .catch(()=>{ alertUser('Gagal menyalin'); });
        };

    } catch (err) {
        try { alertUser('Terjadi kesalahan: ' + err.message); } catch (e) {}
    } finally {
        try { hideLoadingOverlay(); } catch (err) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('paraForm');
    if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitParaForm(e);
    });
});
