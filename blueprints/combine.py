# blueprints/combine.py

import io
from flask import Blueprint, request, send_file, render_template, current_app
from PyPDF2 import PdfWriter, PdfReader

# 1. Inisialisasi Blueprint
combine_bp = Blueprint('combine_bp', __name__, url_prefix='/gabung-pdf')

def combine_pdfs(pdf_files):
    """Menggabungkan file PDF (Logika Inti)."""
    pdf_merger = PdfWriter()

    for file in pdf_files:
        try:
            file.seek(0)
            reader = PdfReader(file)
            for page in reader.pages:
                pdf_merger.add_page(page)

        except Exception as e:
            # Menggunakan current_app.logger di dalam Blueprint
            current_app.logger.error(f"Gagal memproses file '{file.filename}'. Detail: {e}")
            raise Exception(f"Gagal memproses file '{file.filename}'. Pastikan file tidak terproteksi sandi.")

    output_buffer = io.BytesIO()
    pdf_merger.write(output_buffer)
    output_buffer.seek(0)
    return output_buffer

# 2. Routing untuk Halaman Form (GET)
@combine_bp.route('/', methods=['GET'])
def form():
    # Menggunakan nama file HTML yang sudah ada
    return render_template('combinepdf.html')

# 3. Routing untuk Proses Penggabungan (POST)
@combine_bp.route('/combine', methods=['POST'])
def combine():
    uploaded_files = request.files.getlist('pdfs[]')
    valid_files = [file for file in uploaded_files if file.filename and file.mimetype == 'application/pdf']

    if len(valid_files) < 2:
        return "Harap unggah minimal dua file PDF", 400

    try:
        pdf_output = combine_pdfs(valid_files)

        return send_file(
            pdf_output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='gabungan_pdf_toolkit.pdf'
        )

    except Exception as e:
        # Mengembalikan error ke sisi klien (AJAX)
        return str(e), 500