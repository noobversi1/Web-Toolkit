// static/js/convertimage.js
document.addEventListener('alpine:init', () => {
  Alpine.data('convertImageComponent', (serverEndpoint) => ({
    // STATE
    file: null,
    fileLabel: 'Seret & lepas file di sini atau klik untuk memilih',
    isDragOver: false,
    targetFormat: 'image/png',
    quality: 90,
    statusText: 'Pilih file gambar untuk memulai.',
    isDone: false,
    modalOpen: false,
    processedBlob: null,
    previewUrl: '',
    downloadUrl: '',
    downloadName: '',
    // progress state (local fallback)
    uploading: false,
    uploadProgress: 0,

    // helpers
    _fmtBytes(b) {
      if (!b) return '0 B';
      const k = 1024, s = ['B','KB','MB','GB'], i = Math.floor(Math.log(b)/Math.log(k));
      return (b / Math.pow(k,i)).toFixed(2) + ' ' + s[i];
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

    _makeName(orig, mime) {
      const extMap = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/bmp':'bmp','image/tiff':'tiff','image/gif':'gif'};
      const ext = extMap[mime] || 'img';
      return `konversi_gambar_web_toolkit.${ext}`;
    },

    // update file info + validation (pakai validateFileSize global)
    _updateFileInfo(file) {
      if (!file) {
        this.file = null;
        this.statusText = 'Pilih file gambar untuk memulai.';
        this.isDone = false;
        return;
      }

      if (!file.type.startsWith('image/')) {
        alertUser('Format file bukan gambar.');
        this.file = null; this.statusText = 'Format file tidak valid.'; return;
      }

      if (!validateFileSize(file)) {
        this.file = null; this.statusText = 'File terlalu besar.'; return;
      }

      this.file = file;
      this.fileLabel = `${file.name} · ${this._fmtBytes(file.size)}`;
      this.statusText = `File siap: ${file.name} (${this._fmtBytes(file.size)})`;
      this.isDone = false;

      // revoke old urls
      if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.downloadUrl = ''; this.previewUrl = '';
      this.processedBlob = null;
    },

    // event handlers
    handleFileSelect(e) { this._updateFileInfo(e.target.files[0]); e.target.value = null; },
    handleFileDrop(e) { this.isDragOver = false; this._updateFileInfo(e.dataTransfer.files[0]); },

    // apakah browser bisa encode langsung?
    _clientCanEncode(mime) {
      return ['image/png','image/jpeg','image/webp'].includes(mime);
    },

    // loading overlay wrapper (pakai global jika ada)
    _showLoading(){ if (window.showLoadingOverlay) return window.showLoadingOverlay(); this.uploading = true; },
    _hideLoading(){ if (window.hideLoadingOverlay) return window.hideLoadingOverlay(); this.uploading = false; this.uploadProgress = 0; },
    _setProgress(p){ if (window.setUploadProgress) return window.setUploadProgress(p); this.uploadProgress = p; },

    // konversi utama
    async convert() {
      if (!this.file) { alertUser('Unggah file dulu.'); return; }
      this.statusText = 'Memproses...'; this._showLoading();

      try {
        if (this._clientCanEncode(this.targetFormat)) {
          // client-side via canvas
          const img = await this._fileToImage(this.file);
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');

          // kalau target JPEG, isi background putih untuk alpha
          if (this.targetFormat === 'image/jpeg') {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0,0,canvas.width,canvas.height);
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const quality = Math.max(0.1, Math.min(1, this.quality / 100));
          const blob = await this._canvasToBlob(canvas, this.targetFormat, quality);
          if (!blob) throw new Error('Browser tidak mendukung encode ke format ini.');
          this.processedBlob = blob;
          this.downloadUrl = URL.createObjectURL(blob);
          this.previewUrl = this.downloadUrl;
          this.downloadName = this._makeName(this.file.name, this.targetFormat);
          this.statusText = `✅ Selesai (client). ${this._fmtBytes(this.file.size)} → ${this._fmtBytes(blob.size)}.`;
          this.isDone = true;
        } else {
          // server-side dengan progress (XHR)
          if (!serverEndpoint) throw new Error('Konversi server tidak tersedia.');
          await this._uploadToServerWithProgress(serverEndpoint);
        }
      } catch (err) {
        console.error(err);
        alertUser('Gagal memproses: ' + (err.message || err));
        this.statusText = 'Gagal memproses gambar.';
        this.isDone = false;
      } finally {
        this._hideLoading();
      }
    },

    // upload XHR to get progress
    _uploadToServerWithProgress(url) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const fd = new FormData();
        fd.append('image', this.file);
        fd.append('target', this.targetFormat);
        fd.append('quality', this.quality);

        xhr.open('POST', url, true);
        xhr.responseType = 'blob';

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            this._setProgress(percent);
          }
        };

        xhr.onloadstart = () => { this.uploading = true; this._setProgress(1); };
        xhr.onerror = () => { this._setProgress(0); this.uploading = false; reject(new Error('Gagal mengunggah ke server')); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const blob = xhr.response;
            if (!blob || blob.size === 0) return reject(new Error('Server merespon kosong'));
            // finalize
            if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
            this.downloadUrl = URL.createObjectURL(blob);
            this.previewUrl = this.downloadUrl;
            this.downloadName = this._makeName(this.file.name, this.targetFormat);
            this.statusText = `✅ Selesai (server). ${this._fmtBytes(this.file.size)} → ${this._fmtBytes(blob.size)}.`;
            this.isDone = true;
            this._setProgress(100);
            resolve();
          } else {
            // coba baca text pesan error
            const reader = new FileReader();
            reader.onload = () => {
              const txt = reader.result || `Server error ${xhr.status}`;
              reject(new Error(txt));
            };
            reader.onerror = () => reject(new Error(`Server error ${xhr.status}`));
            reader.readAsText(xhr.response);
          }
        };

        xhr.send(fd);
      });
    },

    // preview modal handlers (sama dengan compressimage pattern)
    showPreview() {
      if (!this.processedBlob && !this.previewUrl) {
        alertUser('Belum ada hasil. Tekan Konversi dulu.');
        return;
      }
      // jika processedBlob ada tapi previewUrl belum, buat URL
      if (this.processedBlob && !this.previewUrl) {
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = URL.createObjectURL(this.processedBlob);
      }
      this.modalOpen = true;
    },

    onModalClose() {
      this.modalOpen = false;
      // revoke preview URL setelah transisi (sama pattern)
      setTimeout(() => {
        if (this.previewUrl && this.processedBlob) {
          URL.revokeObjectURL(this.previewUrl);
          this.previewUrl = '';
        }
      }, 300);
    }
  }));
});
