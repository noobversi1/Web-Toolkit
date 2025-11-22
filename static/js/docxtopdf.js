// static/js/docxtopdf.js
document.addEventListener('alpine:init', () => {
    Alpine.data('docxToPdfComponent', (uploadUrl) => ({
        file: null,
        statusText: 'Pilih file .docx atau .doc untuk dikonversi.',
        isDragOver: false,
        isDone: false,
        showResultArea: false,
        successMessage: '',
        downloadUrl: '',
        downloadFileName: '',
        uploadUrl: uploadUrl,

        _updateFile(file) {
            if (!file) {
                this.file = null;
                this.statusText = 'Pilih file .docx atau .doc untuk dikonversi.';
                this.isDone = false;
                this.showResultArea = false;
                return;
            }

            const allowed = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            // note: mime types may vary by browser, so also check extension
            const name = file.name || '';
            const ext = name.split('.').pop().toLowerCase();
            if (!allowed.includes(file.type) && !['doc','docx'].includes(ext)) {
                alertUser('Format file tidak didukung. Gunakan .doc atau .docx');
                this.file = null;
                this.statusText = 'Format file tidak valid.';
                return;
            }

            if (typeof validateFileSize === 'function' && !validateFileSize(file)) {
                this.file = null;
                this.statusText = 'File terlalu besar.';
                return;
            }

            this.file = file;
            const sizeMb = (file.size / 1024 / 1024).toFixed(2);
            this.statusText = `File: ${file.name} (${sizeMb} MB). Siap dikonversi.`;
            this.isDone = false;
            this.showResultArea = false;
            if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
            this.downloadUrl = '';
        },

        handleFileSelect(e) {
            this._updateFile(e.target.files[0]);
            e.target.value = null;
        },

        handleFileDrop(e) {
            this.isDragOver = false;
            this._updateFile(e.dataTransfer.files[0]);
        },

        async submitConvert() {
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file .docx atau .doc terlebih dahulu.");
                return;
            }

            showLoadingOverlay();
            this.showResultArea = false;
            this.successMessage = '';
            try {
                const fd = new FormData();
                fd.append('file', this.file);

                const resp = await fetch(this.uploadUrl, { method: 'POST', body: fd });
                if (!resp.ok) {
                    const txt = await resp.text();
                    throw new Error(txt || 'Terjadi kesalahan saat konversi.');
                }

                const blob = await resp.blob();
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                this.downloadUrl = URL.createObjectURL(blob);

                // coba ambil nama dari header content-disposition
                const cd = resp.headers.get('content-disposition') || '';
                const m = cd.match(/filename="?([^"]+)"?/);
                this.downloadFileName = (m && m[1]) ? m[1] : (this.file.name.replace(/\.(docx|doc)$/i, '') + '.pdf');

                this.successMessage = "✅ Berhasil! File PDF siap diunduh.";
                this.showResultArea = true;
                this.isDone = true;
                this.statusText = `Selesai memproses: ${this.file.name}`;
            } catch (err) {
                alertUser(`❌ ${err.message}`);
                this.statusText = 'Gagal memproses file.';
                this.isDone = false;
            } finally {
                hideLoadingOverlay();
            }
        }
    }));
});
