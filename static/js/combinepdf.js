// static/js/combinepdf.js

document.addEventListener('alpine:init', () => {
    // 'uploadUrl' akan diisi oleh Jinja dari HTML
    Alpine.data('combinePdfComponent', (uploadUrl) => ({
        // --- STATE (Data) ---
        files: [], // Array untuk menyimpan file {id, name, file}
        isDragOver: false,
        showResultArea: false,
        downloadUrl: '',
        downloadFileName: 'gabung_web_toolkit.pdf',
        successMessage: '',
        uploadUrl: uploadUrl,
        _fileCounter: 0, // Untuk ID unik

        // --- PRIVATE FUNCTIONS (Helper) ---
        _addFiles(fileList) {
            // Kita tidak perlu mendefinisikan MAX_FILE_SIZE atau MAX_TOTAL_SIZE lagi
            let currentTotalSize = this.files.reduce((sum, item) => sum + item.file.size, 0);

            for (let file of fileList) {
                // ... (cek tipe file)
                
                // Panggil fungsi global
                if (!validateFileSize(file)) { // <-- JAUH LEBIH BERSIH
                    continue;
                }
                
                // Cek total ukuran menggunakan konstanta global
                if (currentTotalSize + file.size > GLOBAL_MAX_TOTAL_SIZE_BYTES) {
                    alertUser(`Batas total ukuran file (${GLOBAL_MAX_TOTAL_SIZE_MB} MB) tercapai.`);
                    break;
                }
                currentTotalSize += file.size;
                this.files.push({
                    id: this._fileCounter++,
                    name: file.name,
                    file: file
                });
            }
        },

        // --- EVENT HANDLERS ---
        // (handleFileSelect, handleFileDrop, removeFile tetap sama)
        handleFileSelect(event) {
            this._addFiles(event.target.files);
            event.target.value = null;
        },
        handleFileDrop(event) {
            this.isDragOver = false;
            this._addFiles(event.dataTransfer.files);
        },
        removeFile(id) {
            this.files = this.files.filter(item => item.id !== id);
        },

        // --- MAIN ACTION (Tombol Klik) ---
        // (submitCombine tetap sama)
        async submitCombine() {
            if (this.files.length < 2) {
                alertUser("⚠️ Mohon unggah minimal 2 file PDF untuk digabungkan.");
                return;
            }
            this.showResultArea = false;
            this.downloadUrl = '';
            showLoadingOverlay();
            const formData = new FormData();
            this.files.forEach((item) => {
                formData.append('pdfs[]', item.file, item.name);
            });
            try {
                const response = await fetch(this.uploadUrl, {
                    method: "POST",
                    body: formData
                });
                if (!response.ok) {
                    const errorMessage = await response.text();
                    throw new Error(errorMessage.trim() || "Terjadi kesalahan yang tidak diketahui.");
                }
                const blob = await response.blob();
                this.downloadUrl = URL.createObjectURL(blob);
                this.successMessage = "✅ Berhasil! File PDF Gabungan Anda Siap Diunduh.";
                this.showResultArea = true;
            } catch (err) {
                alertUser(`❌ Terjadi kesalahan: ${err.message}`);
                this.showResultArea = false; 
            } finally {
                hideLoadingOverlay();
            }
        }
    }));
});