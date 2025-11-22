// static/js/upscale.js

document.addEventListener('alpine:init', () => {
    Alpine.data('upscaleComponent', (uploadUrl) => ({
        // --- STATE (Pola sharpen/compress) ---
        file: null,
        statusText: 'Pilih file JPG, PNG, atau WebP untuk memulai.',
        isDragOver: false,
        isDone: false,
        uploadUrl: uploadUrl,
        
        // --- TAMBAHAN BARU: State untuk dropdown ---
        scaleFactor: '4', // Default 4x
        
        // State untuk Modal & Hasil
        modalOpen: false,
        previewUrl: '',       
        downloadUrl: '',      
        downloadFileName: 'perbesar_web_toolkit.png',
        processedBlob: null,   

        // --- HELPER: Mengambil nama file (dari script lama) ---
        _getDownloadName(response) {
            const contentDisposition = response.headers.get("content-disposition");
            let defaultName = "perbesar_web_toolkit.png";
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (filenameMatch && filenameMatch[1]) {
                    defaultName = filenameMatch[1];
                }
            }
            return defaultName;
        },
        
        // --- HELPER: Validasi file (Pola dari compress/ocr/sharpen) ---
        _updateFile(file) {
            // (Logika ini identik dengan sharpen.js)
            if (!file) {
                this.file = null;
                this.statusText = 'Pilih file baru untuk diproses.';
                this.isDone = false;
                this.processedBlob = null;
                return;
            }
            const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                 alertUser('Format file tidak didukung. Harap pilih JPG, PNG, atau WebP.');
                 this.file = null; this.statusText = 'Format file tidak valid.'; this.isDone = false;
                 return;
            }
            if (!validateFileSize(file)) { // <-- Tidak perlu argumen lagi
                this.file = null; this.statusText = 'File terlalu besar.';
                return; // Hentikan
            }

            // Jika lolos, set state
            this.file = file;
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            this.statusText = `File: ${file.name} (${fileSize} MB). Siap diproses.`;
            this.isDone = false;
            this.processedBlob = null;
            
            if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
            this.downloadUrl = '';
            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = '';
        },

        // --- EVENT HANDLERS (Identik dengan sharpen.js) ---
        handleFileSelect(event) {
            this._updateFile(event.target.files[0]);
            event.target.value = null; 
        },
        handleFileDrop(event) {
            this.isDragOver = false;
            this._updateFile(event.dataTransfer.files[0]);
        },

        // --- MAIN ACTION (Tombol Klik) ---
        async submitUpscale() { // Nama fungsi diubah
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file gambar terlebih dahulu.");
                return;
            }

            this.statusText = ''; 
            this.isDone = false;
            showLoadingOverlay();

            const formData = new FormData();
            formData.append('image', this.file);
            // --- PERUBAHAN KRUSIAL: Tambahkan scaleFactor ---
            formData.append('scale', this.scaleFactor);

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
                
                this.processedBlob = blob;
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                this.downloadUrl = URL.createObjectURL(blob);
                
                this.downloadFileName = this._getDownloadName(response);
                // Teks status diubah
                this.statusText = "✅ Berhasil! File Anda telah diperbesar. Klik 'Preview' untuk melihat.";
                this.isDone = true;

            } catch (err) {
                alertUser(`❌ Terjadi kesalahan: ${err.message}`);
                this.statusText = 'Gagal memproses gambar.';
                this.isDone = false;
            } finally {
                hideLoadingOverlay();
            }
        },
        
        // --- FUNGSI MODAL (Identik dengan sharpen.js) ---
        showPreview() {
            if (!this.processedBlob) {
                alertUser("⚠️ Belum ada hasil proses. Tekan 'Perbesar Gambar' dulu.");
                return;
            }
            
            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = URL.createObjectURL(this.processedBlob);
            this.modalOpen = true;
        },
        
        onModalClose() {
            this.modalOpen = false;
            setTimeout(() => {
                if (this.previewUrl) {
                    URL.revokeObjectURL(this.previewUrl);
                    this.previewUrl = '';
                }
            }, 300); // 300ms sesuai transisi CSS
        }
    }));
});