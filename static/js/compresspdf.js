// static/js/compresspdf.js

document.addEventListener('alpine:init', () => {
    Alpine.data('compressPdfComponent', (uploadUrl) => ({
        // --- STATE (Data) ---
        file: null,
        statusText: 'Pilih file PDF untuk memulai.',
        isDragOver: false,
        isDone: false,
        uploadUrl: uploadUrl,
        compressionLevel: 'medium', // Default untuk <select>
        
        // State Hasil
        showResultArea: false,
        successMessage: '',
        downloadUrl: '',
        downloadFileName: 'compressed.pdf',

        // --- HELPER: Mengambil nama file dari header (dari sharpen.js) ---
        _getDownloadName(response) {
            const contentDisposition = response.headers.get("content-disposition");
            let defaultName = "compressed.pdf"; // Default
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (filenameMatch && filenameMatch[1]) {
                    defaultName = filenameMatch[1];
                }
            }
            return defaultName;
        },
        
        // --- HELPER: Validasi file (Pola dari ocr/sharpen) ---
        _updateFile(file) {
            // 1. Reset jika tidak ada file
            if (!file) {
                this.file = null;
                this.statusText = 'Pilih file PDF untuk memulai.';
                this.isDone = false;
                this.showResultArea = false;
                return;
            }

            // 2. Validasi Tipe File
            if (file.type !== 'application/pdf') {
                 alertUser('Format file tidak didukung. Harap pilih file .pdf');
                 this.file = null; this.statusText = 'Format file tidak valid.'; this.isDone = false;
                 return;
            }

            // 3. Validasi Ukuran File (Menggunakan global app.js)
            if (!validateFileSize(file)) { // Memanggil fungsi global
                this.file = null; this.statusText = 'File terlalu besar.'; this.isDone = false;
                return; 
            }

            // 4. Jika lolos, set state
            this.file = file;
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            this.statusText = `File: ${file.name} (${fileSize} MB). Siap dikompres.`;
            this.isDone = false;
            this.showResultArea = false; // Sembunyikan hasil lama
            if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
            this.downloadUrl = '';
        },

        // --- EVENT HANDLERS ---
        handleFileSelect(event) {
            this._updateFile(event.target.files[0]);
            event.target.value = null; // Reset input
        },
        handleFileDrop(event) {
            this.isDragOver = false;
            this._updateFile(event.dataTransfer.files[0]);
        },

        // --- MAIN ACTION (Tombol Klik) ---
        async submitCompress() {
            // 1. Cek file
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file PDF terlebih dahulu.");
                return;
            }

            // 2. Reset & Tampilkan Overlay
            this.showResultArea = false;
            this.statusText = ''; // Bersihkan status
            this.isDone = false;
            showLoadingOverlay(); // Panggil overlay global

            // 3. Siapkan FormData
            const formData = new FormData();
            formData.append('file', this.file);
            formData.append('level', this.compressionLevel); // Kirim level kompresi

            // 4. Kirim request
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
                
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                
                this.downloadUrl = URL.createObjectURL(blob);
                this.downloadFileName = this._getDownloadName(response);
                this.successMessage = "✅ Berhasil! File Anda telah dikompres.";
                this.showResultArea = true;
                
                // Set status sukses
                this.statusText = `Selesai memproses: ${this.file.name}`;
                this.isDone = true;

            } catch (err) {
                alertUser(`❌ Terjadi kesalahan: ${err.message}`); // Panggil alert global
                this.statusText = 'Gagal memproses file.';
                this.isDone = false;
                this.showResultArea = false; 
            } finally {
                hideLoadingOverlay(); // Tutup overlay global
            }
        }
    }));
});