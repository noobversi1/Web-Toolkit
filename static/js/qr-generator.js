// static/js/qr-generator.js

document.addEventListener('alpine:init', () => {
    Alpine.data('qrGenerator', () => ({
        // --- STATE (Data) ---
        dataInput: '',
        modalOpen: false,

        // --- PRIVATE FUNCTIONS (Helper) ---
        _sanitizeInput(input) {
            return input.replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");
        },

        // --- PUBLIC FUNCTIONS (Actions) ---
        generate() {
            const data = this._sanitizeInput(this.dataInput).trim();
            const modalContainer = document.getElementById("modalQRCode");

            if (!modalContainer) return; // Safety check

            if (data.length === 0) {
                // Panggil fungsi global dari app.js
                alertUser("⚠️ Mohon masukkan Teks atau URL sebelum membuat Kode QR.");
                return; 
            }
            
            // Panggil fungsi global dari app.js
            showLoadingOverlay();

            // Kosongkan QR sebelumnya
            modalContainer.innerHTML = "";

            // Beri jeda 500ms agar loading terlihat
            setTimeout(() => {
                try {
                    // Buat QR Code baru
                    new QRCode(modalContainer, {
                        width: 256,
                        height: 256,
                        colorDark: "#000",
                        colorLight: "#fff",
                        correctLevel: QRCode.CorrectLevel.H,
                        text: data
                    });

                    // Buka modal menggunakan state Alpine
                    this.modalOpen = true;

                } catch (error) {
                    console.error("Gagal membuat Kode QR:", error);
                    alertUser("Terjadi kesalahan saat membuat Kode QR.");
                } finally {
                    // Selalu sembunyikan loading
                    hideLoadingOverlay();
                }
            }, 500); 
        },

        download() {
            const canvas = document.querySelector("#modalQRCode canvas");
            if (canvas) {
                const dataURL = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.href = dataURL;
                link.download = "qr_web_toolkit.png";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                alertUser("Gambar Kode QR belum berhasil dibuat.");
            }
        }
    }));
});