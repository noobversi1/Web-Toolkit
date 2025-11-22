// static/js/pdftoimage.js

document.addEventListener('alpine:init', () => {
    Alpine.data('pdfToImageComponent', (uploadUrl) => ({
        // --- STATE (Data) ---
        file: null,
        statusText: 'Pilih file PDF untuk memulai konversi.', // Teks diubah
        isDragOver: false,
        isDone: false,
        uploadUrl: uploadUrl,
        outputFormat: 'jpeg', // Diubah dari compressionLevel
        
        // State Hasil
        showResultArea: false,
        successMessage: '',
        downloadUrl: '',
        downloadFileName: 'hasil_gambar.zip', // Hasilnya adalah ZIP

        // --- HELPER: Validasi file (Pola dari compresspdf.js) ---
        _updateFile(file) {
            // 1. Reset jika tidak ada file
            if (!file) {
                this.file = null;
                this.statusText = 'Pilih file PDF untuk memulai konversi.'; // Teks diubah
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
            // Kita cek dulu apakah fungsi globalnya ada
            if (typeof validateFileSize === 'function' && !validateFileSize(file)) {
                this.file = null; this.statusText = 'File terlalu besar.'; this.isDone = false;
                return; 
            }

            // 4. Jika lolos, set state
            this.file = file;
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            this.statusText = `File: ${file.name} (${fileSize} MB). Siap dikonversi.`; // Teks diubah
            this.isDone = false;
            this.showResultArea = false;
            if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
            this.downloadUrl = '';
        },

        // --- EVENT HANDLERS (Sama seperti compresspdf.js) ---
        handleFileSelect(event) {
            this._updateFile(event.target.files[0]);
            event.target.value = null; // Reset input
        },
        handleFileDrop(event) {
            this.isDragOver = false;
            this._updateFile(event.dataTransfer.files[0]);
        },

        // --- MAIN ACTION (Tombol Klik) ---
        async submitConvert() { // Nama fungsi diubah
            // 1. Cek file
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file PDF terlebih dahulu.");
                return;
            }

            // 2. Reset & Tampilkan Overlay (Global dari app.js)
            this.showResultArea = false;
            this.statusText = '';
            this.isDone = false;
            showLoadingOverlay(); 

            // 3. Siapkan FormData
            const formData = new FormData();
            formData.append('file', this.file);
            formData.append('format', this.outputFormat); // Diubah dari 'level'

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

                const blob = await response.blob(); // Ini akan menjadi file .zip
                
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                
                this.downloadUrl = URL.createObjectURL(blob);
                
                // Ambil nama file dari header (jika backend mengirimnya)
                const disposition = response.headers.get('content-disposition');
                if (disposition && disposition.indexOf('attachment') !== -1) {
                    const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
                    if (filenameMatch && filenameMatch[1]) {
                        this.downloadFileName = filenameMatch[1];
                    }
                }
                
                this.successMessage = "✅ Berhasil! File ZIP berisi gambar Anda siap diunduh."; // Teks diubah
                this.showResultArea = true;
                
                this.statusText = `Selesai memproses: ${this.file.name}`;
                this.isDone = true;

            } catch (err) {
                alertUser(`❌ Terjadi kesalahan: ${err.message}`); // Global dari app.js
                this.statusText = 'Gagal memproses file.';
                this.isDone = false;
                this.showResultArea = false; 
            } finally {
                hideLoadingOverlay(); // Global dari app.js
            }
        }
    }));
});