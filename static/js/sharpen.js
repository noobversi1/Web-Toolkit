document.addEventListener('alpine:init', () => {
    Alpine.data('sharpenComponent', (uploadUrl) => ({
        // --- STATE ---
        file: null,
        statusText: 'Pilih file JPG, PNG, atau WebP untuk memulai.',
        isDragOver: false,
        isDone: false,
        uploadUrl: uploadUrl,
        processing: false,
        mode: 'classic', // 'classic' or 'ai'
        
        // Modal & hasil
        modalOpen: false,
        previewUrl: '',
        downloadUrl: '',
        downloadFileName: 'pertajam_web_toolkit.png',
        processedBlob: null,
        errorMessage: '',

        _getDownloadName(response) {
            const contentDisposition = response.headers.get("content-disposition");
            let defaultName = "pertajam_web_toolkit.png";
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/);
                if (filenameMatch) {
                    defaultName = decodeURIComponent(filenameMatch[1] || filenameMatch[2]);
                }
            }
            return defaultName;
        },
        
        _updateFile(file) {
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

            if (!validateFileSize(file)) {
                this.file = null; this.statusText = 'File terlalu besar.'; return;
            }

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

        handleFileSelect(event) {
            this._updateFile(event.target.files[0]);
            event.target.value = null;
        },
        handleFileDrop(event) {
            this.isDragOver = false;
            this._updateFile(event.dataTransfer.files[0]);
        },

        async submitSharpen() {
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file gambar terlebih dahulu.");
                return;
            }
            if (this.processing) return;

            this.statusText = '';
            this.isDone = false;
            this.processing = true;
            this.errorMessage = '';
            showLoadingOverlay();

            const formData = new FormData();
            formData.append('image', this.file);
            formData.append('mode', this.mode); // mode: classic | ai

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
                this.statusText = "✅ Berhasil! File Anda telah diproses. Klik 'Preview' untuk melihat.";
                this.isDone = true;

            } catch (err) {
                alertUser(`❌ Terjadi kesalahan: ${err.message}`);
                this.statusText = 'Gagal memproses gambar.';
                this.isDone = false;
                this.errorMessage = err.message;
            } finally {
                hideLoadingOverlay();
                this.processing = false;
            }
        },
        
        showPreview() {
            if (!this.processedBlob) {
                alertUser("⚠️ Belum ada hasil proses. Tekan 'Pertajam Gambar' dulu.");
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
            }, 300);
        }
    }));
});
