// static/js/pdf_to_xlsx.js

document.addEventListener('alpine:init', () => {
    Alpine.data('pdfToXlsxComponent', (uploadUrl) => ({
        file: null,
        statusText: 'Pilih file PDF untuk memulai ekstraksi.',
        isDragOver: false,
        isDone: false,
        uploadUrl: uploadUrl,
        showResultArea: false,
        successMessage: '',
        downloadUrl: '',
        downloadFileName: 'pdf_xlsx_web_toolkit.xlsx',
        // options
        prefer_stream: false,
        merge_tables: true,

        _updateFile(file) {
            if (!file) {
                this.file = null;
                this.statusText = 'Pilih file PDF untuk memulai ekstraksi.';
                this.isDone = false;
                this.showResultArea = false;
                this.tablePreviews = [];
                return;
            }

            if (file.type !== 'application/pdf') {
                alertUser('Format file tidak didukung. Harap pilih file .pdf');
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
            this.statusText = `File: ${file.name} (${fileSize} MB). Siap diproses.`;
            this.isDone = false;
            this.showResultArea = false;
            this.tablePreviews = [];
            if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
            this.downloadUrl = '';
        },

        handleFileSelect(event) {
            this._updateFile(event.target.files[0]);
            event.target.value = null;
        },

        handleFileDrop(event) {
            this.isDragOver = false;
            this._updateFile(event.dataTransfer.files[0]);
        },

        _getDownloadName(response) {
            const contentDisposition = response.headers.get("content-disposition");
            let defaultName = "pdf_xlsx_web_toolkit.xlsx";
            if (contentDisposition) {
                const m = contentDisposition.match(/filename="?([^"]+)"?/);
                if (m && m[1]) defaultName = m[1];
            }
            return "pdf_xlsx_web_toolkit.xlsx";
        },

        async submitConvert() {
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file PDF terlebih dahulu.");
                return;
            }

            this.showResultArea = false;
            this.successMessage = '';
            this.isDone = false;
            showLoadingOverlay();

            const formData = new FormData();
            formData.append('file', this.file);
            formData.append('prefer_stream', this.prefer_stream ? '1' : '0');
            formData.append('merge_tables', this.merge_tables ? '1' : '0');

            try {
                const response = await fetch(this.uploadUrl, {
                    method: "POST",
                    body: formData
                });

                if (!response.ok) {
                    const errTxt = await response.text();
                    throw new Error(errTxt.trim() || "Terjadi kesalahan.");
                }

                const blob = await response.blob();
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                this.downloadUrl = URL.createObjectURL(blob);
                this.downloadFileName = this._getDownloadName(response);

                this.successMessage = "✅ Berhasil! File XLSX siap diunduh.";
                this.showResultArea = true;
                this.statusText = `Selesai memproses: ${this.file.name}`;
                this.isDone = true;

            } catch (err) {
                alertUser(`❌ Terjadi kesalahan: ${err.message}`);
                this.statusText = 'Gagal memproses file.';
                this.isDone = false;
                this.showResultArea = false;
            } finally {
                hideLoadingOverlay();
            }
        }
    }));
});
