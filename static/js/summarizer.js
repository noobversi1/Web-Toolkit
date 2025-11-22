// static/js/summarizer.js

async function submitForm(e) {
    const form = document.getElementById('summForm');
    const fd = new FormData(form);
    // jika ada file custom input replacement, make sure we still include file -> native input name="file" exists
    try { showLoadingOverlay(); } catch (err) { /* ignore if not present */ }

    try {
        const resp = await fetch(form.dataset.processUrl, {
            method: 'POST',
            body: fd
        });

        if (!resp.ok) {
            const txt = await resp.text();
            try { alertUser('Error: ' + txt); } catch (err) { console.error('Error:', txt); }
            try { hideLoadingOverlay(); } catch (err) { }
            return;
        }

        const data = await resp.json();
        const summary = data.summary || '';

        // tampilkan ringkasan
        const summaryEl = document.getElementById('summaryText');
        if (summaryEl) summaryEl.textContent = summary;
        const resultArea = document.getElementById('resultArea');
        if (resultArea) resultArea.classList.remove('hidden');

        // download txt
        const blob = new Blob([summary], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const dl = document.getElementById('downloadLink');
        if (dl) {
            dl.href = url;
            dl.download = 'rangkum_web_toolkit.txt';
            dl.classList.remove('hidden');
        }

        // tombol copy
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(summary).then(() => {
                    try { alertUser('✅ Rangkuman disalin'); } catch (err) { console.log('copied'); }
                }).catch(err => {
                    try { alertUser('Gagal menyalin: ' + err.message); } catch (e) { console.error(err); }
                });
            };
        }

    } catch (err) {
        try { alertUser('Terjadi kesalahan: ' + err.message); } catch (e) { console.error(err); }
    } finally {
        try { hideLoadingOverlay(); } catch (err) { }
    }
}

document.addEventListener('DOMContentLoaded', () => {

    // ---------- slider label ----------
    const range = document.getElementById('sentences');
    if (range) {
        const label = document.getElementById('sentencesLabel');
        label && (label.innerText = range.value);
        range.addEventListener('input', () => {
            document.getElementById('sentencesLabel').innerText = range.value;
        });
    }

    // ---------- file picker custom ----------
    // We want to allow clearing and show filename nicely
    let fileInput = document.getElementById('fileInput'); // note: may be replaced when clearing
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const fileClearBtn = document.getElementById('fileClearBtn');
    const pickerBtn = document.getElementById('filePickerBtn');

    function updateFileDisplay(file) {
        if (!fileNameDisplay) return;
        if (file) {
            fileNameDisplay.textContent = `${file.name} · ${Math.round(file.size / 1024)} KB`;
            fileNameDisplay.title = file.name;
            fileClearBtn && fileClearBtn.classList.remove('hidden');
            if (pickerBtn) {
                pickerBtn.classList.remove('bg-blue-600');
                pickerBtn.classList.add('bg-green-600');
            }
        } else {
            fileNameDisplay.textContent = 'Belum ada file dipilih';
            fileNameDisplay.title = '';
            fileClearBtn && fileClearBtn.classList.add('hidden');
            if (pickerBtn) {
                pickerBtn.classList.remove('bg-green-600');
                pickerBtn.classList.add('bg-blue-600');
            }
        }
    }

    // bind change handler (we need ability to rebind if input is replaced)
    function bindFileInputHandlers(inp) {
        if (!inp) return;
        inp.addEventListener('change', () => {
            const f = inp.files && inp.files[0];
            updateFileDisplay(f);
        });
    }

    // initial bind
    bindFileInputHandlers(fileInput);

    // clear file - robustly (replace input to ensure it's cleared)
    if (fileClearBtn) {
        fileClearBtn.addEventListener('click', () => {
            if (!fileInput) fileInput = document.getElementById('fileInput');
            if (!fileInput) return;

            // create new input element with same attributes and replace
            const newInput = fileInput.cloneNode();
            // ensure value is empty
            newInput.value = '';
            fileInput.parentNode.replaceChild(newInput, fileInput);

            // re-assign reference and rebind
            fileInput = document.getElementById('fileInput');
            bindFileInputHandlers(fileInput);

            // update display
            updateFileDisplay(null);
        });
    }

    // If there's an external Reset button that clears entire form
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const textInput = document.getElementById('textInput');
            if (textInput) textInput.value = '';
            // clear file custom display
            if (fileInput) {
                // trigger clear like above
                const newInput = fileInput.cloneNode();
                newInput.value = '';
                fileInput.parentNode.replaceChild(newInput, fileInput);
                fileInput = document.getElementById('fileInput');
                bindFileInputHandlers(fileInput);
            }
            updateFileDisplay(null);

            const resultArea = document.getElementById('resultArea');
            if (resultArea) resultArea.classList.add('hidden');
        });
    }

    // ---------- form submit ----------
    const form = document.getElementById('summForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitForm(e);
        });
    }

    // Accessibility / keyboard: pressing Enter on filePickerBtn should open file dialog
    if (pickerBtn) {
        pickerBtn.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                const inp = document.getElementById('fileInput');
                inp && inp.click();
            }
        });
    }

    // initial UI state
    updateFileDisplay(null);

});
