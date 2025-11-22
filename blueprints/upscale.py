# blueprints/upscale.py

import io
import cv2 # Membutuhkan opencv-python-headless
import numpy as np # Membutuhkan numpy
from flask import Blueprint, request, render_template, send_file, current_app
import os

# 1. Inisialisasi Blueprint
upscale_bp = Blueprint('upscale_bp', __name__, url_prefix='/peningkatan-hd')

# Daftar mimetype gambar yang diizinkan
ALLOWED_MIMETYPES = {'image/jpeg', 'image/png', 'image/webp'}

def upscale_image_cv2(image_file_bytes, scale_factor_str):
    try:
        # --- 1. Dapatkan Path MODEL DIREKTORI dari Konfigurasi Flask ---
        model_dir = current_app.config.get('UPSCALE_MODEL_DIR')
        if not model_dir:
            raise Exception("Konfigurasi server error: Direktori model AI tidak diset.")
            
        # --- 2. Tentukan Model dan Skala ---
        # Validasi input (meskipun sudah divalidasi di 'process')
        if scale_factor_str not in ['2', '3', '4']:
            raise Exception("Skala pembesaran tidak valid.")
            
        scale_factor_int = int(scale_factor_str)
        
        # Buat nama file model secara dinamis
        model_filename = f"FSRCNN_x{scale_factor_str}.pb"
        model_path = os.path.join(model_dir, model_filename)

        if not os.path.exists(model_path):
            current_app.logger.error(f"File model AI tidak ditemukan di: {model_path}")
            raise Exception(f"Konfigurasi server error: File model {model_filename} tidak ditemukan.")

        # --- 3. Baca Gambar menggunakan OpenCV ---
        nparr = np.frombuffer(image_file_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise Exception("Gagal membaca file gambar. File mungkin rusak.")
        
        # --- 3.5. Resize jika melebihi batas max_side ---
        max_side = current_app.config.get('AI_CPU_MAX_SIDE', 2048)
        h, w = img.shape[:2]

        if max(h, w) > max_side:
            scale = max_side / max(h, w)
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            current_app.logger.info(
                f"Resize dulu: {w}x{h} → {new_w}x{new_h} (max_side={max_side})"
            )

        # --- 4. Inisialisasi Model Super Resolution ---
        sr = cv2.dnn_superres.DnnSuperResImpl_create()
        
        # Baca model dari file
        sr.readModel(model_path)
        
        # Atur model dan skala (SEKARANG DINAMIS)
        sr.setModel("fsrcnn", scale_factor_int) 

        # --- 5. Jalankan Upscale (PROSES BERAT DI SINI) ---
        current_app.logger.info(f"Memulai proses upscale {scale_factor_str}x CV2...")
        result = sr.upsample(img)
        current_app.logger.info(f"Proses upscale {scale_factor_str}x CV2 selesai.")

        # --- 6. Encode Hasil kembali ke format PNG ---
        is_success, buffer = cv2.imencode(".png", result)
        if not is_success:
            raise Exception("Gagal meng-encode gambar hasil upscale.")

        output_buffer = io.BytesIO(buffer)
        output_buffer.seek(0)
        
        return output_buffer, 'image/png', 'png'

    except cv2.error as e:
        current_app.logger.error(f"OpenCV Error (Mungkin Out-of-Memory): {e}")
        raise Exception(f"Gagal upscale (Error CV2). Gambar mungkin terlalu besar. Detail: {e}")
    except Exception as e:
        current_app.logger.error(f"Gagal upscale gambar: {e}")
        raise Exception(f"Gagal memproses upscale. Error: {e}")

# 2. Routing untuk Halaman Form (GET)
@upscale_bp.route('/', methods=['GET'])
def form():
    return render_template('upscale.html')

@upscale_bp.route('/process', methods=['POST'])
def process():
    if 'image' not in request.files:
        return "Tidak ada file yang diunggah", 400
        
    file = request.files['image']

    # Ambil nilai 'scale' dari form, default ke '4' jika tidak ada
    scale_factor = request.form.get('scale', '4')

    if not file.filename or file.mimetype not in ALLOWED_MIMETYPES:
        return "Format file tidak didukung. Harap unggah JPG, PNG, atau WebP", 415

    # Validasi skala
    if scale_factor not in ['2', '3', '4']:
        return "Skala pembesaran tidak valid.", 400

    try:
        image_bytes = file.read()
        
        # Kirim skala yang dipilih ke fungsi logika
        image_output, mimetype, ext = upscale_image_cv2(image_bytes, scale_factor)

        # Ubah nama file output dinamis
        download_name = f'perbesar_{scale_factor}x_web_toolkit.{ext}'

        return send_file(
            image_output,
            mimetype=mimetype,
            as_attachment=True,
            download_name=download_name
        )

    except Exception as e:
        return str(e), 500