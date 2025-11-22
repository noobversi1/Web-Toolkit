# blueprints/pdftodocx.py

import io
import os
import tempfile
from flask import (Blueprint, request, send_file, render_template, current_app)
# Import library baru
from pdf2docx import Converter
from werkzeug.utils import secure_filename

# 1. Inisialisasi Blueprint
pdftodocx_bp = Blueprint('pdftodocx_bp', __name__, url_prefix='/pdf-ke-docx')

# 2. Routing untuk Halaman Form (GET)
@pdftodocx_bp.route('/', methods=['GET'])
def form():
    """Menampilkan halaman HTML PDF ke DOCX"""
    return render_template('pdftodocx.html')

# 3. Routing untuk Proses Konversi (POST)
@pdftodocx_bp.route('/process', methods=['POST'])
def process():
    """Menerima file PDF, mengonversinya ke DOCX, dan mengirim kembali"""
    
    # 1. Validasi Input (Sama seperti compresspdf.py)
    if 'file' not in request.files:
        return "Tidak ada file yang diunggah", 400

    uploaded_file = request.files['file']
    if uploaded_file.filename == '':
        return "Nama file kosong", 400
        
    if not uploaded_file.filename.lower().endswith('.pdf'):
        return "Hanya file PDF yang diizinkan", 400

    # Kita butuh path file fisik untuk library pdf2docx
    # Kita gunakan tempfile untuk keamanan
    temp_pdf_path = None
    try:
        # Buat file temporary untuk input PDF
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_pdf:
            uploaded_file.save(temp_pdf.name)
            temp_pdf_path = temp_pdf.name
        
        # Buat buffer di memori untuk output DOCX
        output_buffer = io.BytesIO()

        # 2. Proses Konversi
        cv = Converter(temp_pdf_path)
        # Konversi dan simpan hasilnya ke buffer memori
        cv.convert(output_buffer, multi_processing=True, cpu_count=2) # Gunakan 4 thread untuk mempercepat
        cv.close()
        
        output_buffer.seek(0)
        
        # 3. Kirim File DOCX
        # (Menggunakan nama file statis seperti permintaan Anda sebelumnya)
        new_filename = "pdf_docx_web_toolkit.docx"
        
        return send_file(
            output_buffer,
            # Ini adalah mimetype yang benar untuk file .docx
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=new_filename
        )

    except Exception as e:
        current_app.logger.error(f"Error PDF ke DOCX: {e}")
        return f"Terjadi kesalahan saat konversi: {e}", 500
    
    finally:
        # 4. Selalu hapus file temporary
        if temp_pdf_path and os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)