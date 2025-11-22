// static/js/xlsxtopdf.js
document.addEventListener('alpine:init', () => {
    Alpine.data('xlsxToPdfComponent', (uploadUrl) => ({
        file: null,
        statusText: 'Pilih file .xls/.xlsx/.ods untuk dikonversi.',
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
                this.statusText = 'Pilih file .xls/.xlsx/.ods untuk dikonversi.';
                this.isDone = false;
                this.showResultArea = false;
                return;
            }

            const name = file.name || '';
            const ext = name.split('.').pop().toLowerCase();
            if (!['xls','xlsx','ods'].includes(ext)) {
                alertUser('Format file tidak didukung. Gunakan .xls, .xlsx, atau .ods');
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
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            this.statusText = `File: ${file.name} (${fileSize} MB). Siap dikonversi.`;
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

        _getDownloadName(response) {
            const cd = response.headers.get('content-disposition') || '';
            const m = cd.match(/filename="?([^"]+)"?/);
            if (m && m[1]) return m[1];
            return 'xlsx_pdf_web_toolkit.pdf';
        },

        async submitConvert() {
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file terlebih dahulu.");
                return;
            }

            showLoadingOverlay();
            this.showResultArea = false;
            this.successMessage = '';
            this.isDone = false;

            try {
                const fd = new FormData();
                fd.append('file', this.file);

                const resp = await fetch(this.uploadUrl, { method: 'POST', body: fd });
                if (!resp.ok) {
                    const text = await resp.text();
                    throw new Error(text || 'Terjadi kesalahan saat konversi.');
                }

                const blob = await resp.blob();
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                this.downloadUrl = URL.createObjectURL(blob);
                this.downloadFileName = this._getDownloadName(resp);

                this.successMessage = "✅ Berhasil! File PDF siap diunduh.";
                this.showResultArea = true;
                this.statusText = `Selesai memproses: ${this.file.name}`;
                this.isDone = true;

            } catch (err) {
                alertUser(`❌ ${err.message}`);
                this.statusText = 'Gagal memproses file.';
                this.isDone = false;
                this.showResultArea = false;
            } finally {
                hideLoadingOverlay();
            }
        }
    }));
});
