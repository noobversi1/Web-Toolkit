// static/js/compressimage.js

document.addEventListener('alpine:init', () => {
    Alpine.data('compressImageComponent', () => ({
        // --- STATE (Data) ---
        file: null,
        quality: 85,
        statusText: 'Pilih file JPG, JPEG, atau PNG untuk memulai.',
        isDragOver: false,
        isDone: false,
        modalOpen: false,
        compressedBlob: null,
        previewUrl: '',       // URL sementara untuk <img> di modal
        downloadUrl: '',        // URL permanen untuk tombol download
        downloadFileName: 'kompres_web_toolkit.jpg',
        
        // --- HELPER FUNCTIONS (Bawaan dari script lama) ---
        _fmtBytes(b) {
            if (!b) return '0 B';
            const k = 1024, s = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(b) / Math.log(k));
            return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
        },
        _fileToImage(file) {
            return new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => {
                    const img = new Image();
                    img.onload = () => res(img);
                    img.onerror = () => rej(new Error('Gagal memuat gambar'));
                    img.src = fr.result;
                };
                fr.onerror = () => rej(new Error('Gagal membaca file'));
                fr.readAsDataURL(file);
            });
        },
        _canvasToBlob(canvas, mime, quality) {
            return new Promise(r => canvas.toBlob(b => r(b), mime, quality));
        },
        
        // --- HELPER BARU untuk validasi file ---
        _updateFileInfo(file) {
            if (!file) {
                this.file = null;
                this.statusText = 'Pilih file JPG, JPEG, atau PNG untuk memulai.';
                this.isDone = false;
                return;
            }
            
            // 1. Cek Tipe
            if (!['image/png', 'image/jpeg'].includes(file.type)) {
                alertUser('Format file tidak didukung. Harap pilih JPG, JPEG, atau PNG.');
                this.file = null;
                this.statusText = 'Format file tidak valid.';
                this.isDone = false;
                return;
            }
            
            // 2. Cek Ukuran (konsisten dengan OCR)
            if (!validateFileSize(file)) { // <-- Tidak perlu argumen lagi
                this.file = null; this.statusText = 'File terlalu besar.';
                return; // Hentikan
            }

            this.file = file;
            this.statusText = `File: ${file.name} (${this._fmtBytes(file.size)}). Siap dikompres.`;
            this.compressedBlob = null;
            this.isDone = false;
            
            // Hapus blob URL lama jika ada
            if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
            this.downloadUrl = '';
            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = '';
        },
        
        // --- EVENT HANDLERS ---
        handleFileSelect(event) {
            this._updateFileInfo(event.target.files[0]);
            event.target.value = null;
        },
        handleFileDrop(event) {
            this.isDragOver = false;
            this._updateFileInfo(event.dataTransfer.files[0]);
        },

        // --- MAIN ACTIONS ---
        async compress() {
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file gambar terlebih dahulu.");
                return;
            }

            // 1. Bersihkan status di kartu (agar tidak ada pesan ganda)
            this.statusText = '';
            this.isDone = false;

            // 2. Tampilkan overlay global (hanya satu kali)
            showLoadingOverlay();

            try {
                const img = await this._fileToImage(this.file);
                const w = img.width, h = img.height;
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                
                // Beri background putih (khusus untuk PNG transparan)
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                
                const quality = Math.max(0.1, Math.min(1, this.quality / 100));
                const mime = 'image/jpeg';
                
                const blob = await this._canvasToBlob(canvas, mime, quality);
                this.compressedBlob = blob;

                // Hapus blob URL lama jika ada
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                
                this.downloadUrl = URL.createObjectURL(blob);
                this.downloadFileName = `kompres_gambar_web_toolkit.jpg`;

                this.statusText = `✅ Selesai: dari ${this._fmtBytes(this.file.size)} → ${this._fmtBytes(blob.size)}`;
                this.isDone = true;

            } catch (err) {
                console.error(err);
                alertUser('Gagal memproses gambar: ' + (err.message || err));
            } finally {
                hideLoadingOverlay();
            }
        },
        
        showPreview() {
            if (!this.compressedBlob) {
                alertUser("⚠️ Belum ada hasil kompresi. Tekan 'Kompres' dulu.");
                return;
            }
            
            // Buat URL baru untuk preview
            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = URL.createObjectURL(this.compressedBlob);
            this.modalOpen = true;
        },
        
        onModalClose() {
            this.modalOpen = false;
            // Revoke URL preview setelah transisi selesai
            setTimeout(() => {
                if (this.previewUrl) {
                    URL.revokeObjectURL(this.previewUrl);
                    this.previewUrl = '';
                }
            }, 300);
        }
    }));
});