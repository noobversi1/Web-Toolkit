# blueprints/pdftoimage.py

import io
import os
import zipfile # Kita akan menggunakan zip untuk mengirim banyak gambar
from flask import (Blueprint, request, send_file, render_template, current_app)
# Library utama untuk konversi PDF ke Gambar
from pdf2image import convert_from_bytes
from werkzeug.utils import secure_filename

# 1. Inisialisasi Blueprint
pdftoimage_bp = Blueprint('pdftoimage_bp', __name__, url_prefix='/pdf-ke-gambar')

# Path ke Poppler (jika diperlukan, sesuaikan dengan server Anda)
# Biasanya tidak perlu jika sudah terinstal via apt-get
POPPLER_PATH = None 

# 2. Routing untuk Halaman Form (GET)
@pdftoimage_bp.route('/', methods=['GET'])
def form():
    """Menampilkan halaman HTML PDF ke Gambar"""
    return render_template('pdftoimage.html')

# 3. Routing untuk Proses Konversi (POST)
@pdftoimage_bp.route('/process', methods=['POST'])
def process():
    """Menerima file PDF, mengonversi setiap halaman, dan mengirim ZIP"""
    
    # 1. Validasi Input (Sama seperti compresspdf.py)
    if 'file' not in request.files:
        return "Tidak ada file yang diunggah", 400

    uploaded_file = request.files['file']
    if uploaded_file.filename == '':
        return "Nama file kosong", 400
        
    if not uploaded_file.filename.lower().endswith('.pdf'):
        return "Hanya file PDF yang diizinkan", 400

    # Ambil format output dari form (jpeg atau png)
    output_format = request.form.get('format', 'jpeg').lower()
    if output_format not in ['jpeg', 'png']:
         return "Format output tidak valid", 400

    try:
        pdf_bytes = uploaded_file.read()
        
        # 2. Proses Konversi PDF ke List Gambar (PIL Image)
        # Kita set DPI 150 untuk keseimbangan kualitas/ukuran
        images = convert_from_bytes(
            pdf_bytes, 
            dpi=150,
            fmt=output_format,
            poppler_path=POPPLER_PATH,
            thread_count=2 # Gunakan 4 thread untuk mempercepat
        )

        if not images:
            return "File PDF tidak mengandung halaman atau gagal diproses.", 400

        # 3. Buat File ZIP dalam Memori
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for i, img in enumerate(images):
                # Simpan tiap gambar ke buffer memori sementara
                img_buffer = io.BytesIO()
                
                # Tentukan format simpan untuk PIL
                pil_format = 'JPEG' if output_format == 'jpeg' else 'PNG'
                img.save(img_buffer, format=pil_format)
                img_buffer.seek(0)
                
                # --- PERUBAHAN DI SINI ---
                # Gunakan nama file statis sesuai permintaan Anda
                file_name = f"pdf_gambar_web_toolkit_{i+1}.{output_format}"
                # -------------------------
                
                zipf.writestr(file_name, img_buffer.read())

        zip_buffer.seek(0)
        
        # 4. Kirim File ZIP ke Pengguna
        zip_download_name = f"pdf_gambar_web_toolkit.zip"
        
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=zip_download_name
        )

    except Exception as e:
        current_app.logger.error(f"Error PDF ke Gambar: {e}")
        # Tangani error spesifik jika poppler tidak ditemukan
        if "Poppler" in str(e):
             return "Error Server: Dependensi Poppler tidak ditemukan.", 500
        return f"Terjadi kesalahan saat konversi: {e}", 500