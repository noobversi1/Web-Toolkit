// static/js/ocr.js

document.addEventListener('alpine:init', () => {
    Alpine.data('ocrComponent', (uploadUrl) => ({
        // --- STATE (Data) ---
        file: null,
        fileName: '',
        filePreviewUrl: '',
        isImage: false,
        isDragOver: false,
        statusText: 'Pilih file PDF atau gambar untuk memulai ekstrak.',
        isDone: false,
        showResultArea: false,
        resultText: '',
        downloadUrl: '',
        downloadFileName: '',
        uploadUrl: uploadUrl,

        // --- PRIVATE HELPERS ---
        _updateFile(file) {
            if (!file) {
                this.file = null;
                this.fileName = '';
                this.filePreviewUrl = '';
                this.isImage = false;
                this.statusText = 'Pilih file PDF atau gambar untuk memulai ekstrak.';
                this.isDone = false;
                this.showResultArea = false;
                return;
            }

            // Validasi tipe file
            const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
            if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
                alertUser('Format file tidak didukung. Harap pilih PDF atau Gambar.');
                this.file = null; this.fileName = ''; this.filePreviewUrl = ''; this.isImage = false;
                this.statusText = 'Format file tidak valid.';
                return;
            }

            // Validasi ukuran global (app.js)
            if (typeof validateFileSize === 'function' && !validateFileSize(file)) {
                this.file = null;
                this.statusText = 'File terlalu besar.';
                this.isDone = false;
                return;
            }

            this.file = file;
            this.fileName = file.name;
            this.isImage = file.type.startsWith('image/');

            if (this.isImage) {
                const reader = new FileReader();
                reader.onload = (e) => { this.filePreviewUrl = e.target.result; };
                reader.readAsDataURL(file);
            } else {
                this.filePreviewUrl = '';
            }

            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            this.statusText = `File: ${file.name} (${fileSize} MB). Siap diproses.`;
            this.isDone = false;
            this.showResultArea = false;
            if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
            this.downloadUrl = '';
        },

        // --- EVENT HANDLERS ---
        handleFileSelect(event) {
            this._updateFile(event.target.files[0]);
            event.target.value = null;
        },

        handleFileDrop(event) {
            this.isDragOver = false;
            this._updateFile(event.dataTransfer.files[0]);
        },

        // --- ACTION ---
        async submitOCR() {
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file PDF atau gambar terlebih dahulu.");
                return;
            }

            this.showResultArea = false;
            this.resultText = '';
            this.downloadUrl = '';
            showLoadingOverlay();

            const formData = new FormData();
            formData.append('file', this.file);
            // server selalu mengembalikan text/plain .txt

            try {
                const response = await fetch(this.uploadUrl, {
                    method: "POST",
                    body: formData
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(errText.trim() || "Terjadi kesalahan.");
                }

                // server mengembalikan text/plain (txt). Kita baca sebagai text.
                const text = await response.text();
                const safeText = text.trim() || "⚠️ Tidak ada teks yang terdeteksi.";
                this.resultText = safeText;

                // buat blob untuk tombol unduh
                const blob = new Blob([safeText], { type: 'text/plain' });
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                this.downloadUrl = URL.createObjectURL(blob);
                this.downloadFileName = `ocr_web_toolkit.txt`;

                this.showResultArea = true;
                this.statusText = `Selesai memproses: ${this.fileName}`;
                this.isDone = true;

            } catch (err) {
                this.resultText = `❌ Terjadi kesalahan saat memproses file: ${err.message}`;
                this.showResultArea = true;
                this.isDone = false;
            } finally {
                hideLoadingOverlay();
            }
        }
    }));
});
