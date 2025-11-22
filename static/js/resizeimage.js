// static/js/resizeimage.js

document.addEventListener('alpine:init', () => {
    Alpine.data('resizeImageComponent', () => ({
        // --- STATE (Data) ---
        file: null,
        resizePercentage: 80, // Persentase default untuk resize
        statusText: 'Pilih file JPG atau PNG untuk memulai.',
        isDragOver: false,
        isDone: false,
        modalOpen: false,
        resizedBlob: null,
        previewUrl: '',       
        downloadUrl: '',        
        downloadFileName: 'perkecil_web_toolkit.png', // Default PNG untuk menjaga transparansi
        
        // Data resolusi
        originalWidth: 0,
        originalHeight: 0,
        newWidth: 0,
        newHeight: 0,
        
        // --- HELPER FUNCTIONS (Diambil dari compressimage.js) ---
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
            // Quality hanya berlaku untuk mime/jpeg
            return new Promise(r => canvas.toBlob(b => r(b), mime, quality));
        },
        
        // --- WATCHER untuk menghitung resolusi baru ---
        init() {
            this.$watch('resizePercentage', () => {
                this.calculateNewDimensions();
            });
        },

        calculateNewDimensions() {
            if (this.originalWidth > 0 && this.originalHeight > 0) {
                const ratio = this.resizePercentage / 100;
                this.newWidth = Math.round(this.originalWidth * ratio);
                this.newHeight = Math.round(this.originalHeight * ratio);
            }
        },

        // --- HELPER BARU untuk validasi file dan mendapatkan dimensi ---
        async _updateFileInfo(file) {
            // ... (Kode validasi file sama)
            if (!file) {
                this.file = null;
                this.statusText = 'Pilih file JPG atau PNG untuk memulai.';
                this.isDone = false;
                this.originalWidth = this.originalHeight = this.newWidth = this.newHeight = 0;
                return;
            }
            
            if (!['image/png', 'image/jpeg'].includes(file.type)) {
                alertUser('Format file tidak didukung. Harap pilih JPG atau PNG.');
                this.file = null;
                this.statusText = 'Format file tidak valid.';
                this.isDone = false;
                return;
            }
            
            if (!validateFileSize(file)) { 
                this.file = null; this.statusText = 'File terlalu besar.';
                return; 
            }

            this.file = file;
            this.resizedBlob = null;
            this.isDone = false;
            
            // Dapatkan resolusi asli
            try {
                const img = await this._fileToImage(file);
                this.originalWidth = img.width;
                this.originalHeight = img.height;
                this.calculateNewDimensions(); // Hitung dimensi baru
                
                this.statusText = `File: ${file.name} (${this._fmtBytes(file.size)}). Siap diperkecil.`;
            } catch (err) {
                alertUser('Gagal mendapatkan dimensi gambar.');
                this.file = null;
            }
            
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

        // --- MAIN ACTIONS: RESIZE ---
        async resize() {
            if (!this.file) {
                alertUser("⚠️ Mohon unggah file gambar terlebih dahulu.");
                return;
            }

            this.statusText = '';
            this.isDone = false;
            showLoadingOverlay();

            try {
                const img = await this._fileToImage(this.file);
                
                // Dimensi yang akan digunakan untuk canvas
                const targetWidth = this.newWidth;
                const targetHeight = this.newHeight;

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth; 
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                
                // Menggambar gambar asli ke dimensi canvas yang baru
                // Ini secara otomatis akan melakukan operasi resize (downscale)
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                
                // Atur tipe MIME output. Default ke PNG untuk menjaga kualitas, 
                // atau gunakan JPG jika file aslinya JPG.
                const isJpg = this.file.type === 'image/jpeg';
                const mime = isJpg ? 'image/jpeg' : 'image/png';
                // Jika JPG, gunakan kualitas 95% (karena fokusnya resize, bukan kompresi kualitas)
                const quality = isJpg ? 0.95 : undefined; 
                
                const blob = await this._canvasToBlob(canvas, mime, quality);
                this.resizedBlob = blob;

                // Hapus blob URL lama jika ada
                if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
                
                this.downloadUrl = URL.createObjectURL(blob);
                const ext = isJpg ? 'jpg' : 'png';
                this.downloadFileName = `perkecil_web_toolkit.${ext}`;

                this.statusText = `✅ Selesai: ${this.originalWidth}x${this.originalHeight} → ${targetWidth}x${targetHeight}. Ukuran file: ${this._fmtBytes(blob.size)}`;
                this.isDone = true;

            } catch (err) {
                console.error(err);
                alertUser('Gagal memproses gambar: ' + (err.message || err));
            } finally {
                hideLoadingOverlay();
            }
        },
        
        showPreview() {
            if (!this.resizedBlob) {
                alertUser("⚠️ Belum ada hasil perkecilan. Tekan 'Perkecil' dulu.");
                return;
            }
            
            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = URL.createObjectURL(this.resizedBlob);
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