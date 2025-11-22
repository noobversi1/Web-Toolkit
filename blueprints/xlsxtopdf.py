# blueprints/xlsxtopdf.py
import os
import io
import shutil
import tempfile
import subprocess
from pathlib import Path
from flask import Blueprint, request, send_file, render_template, current_app
from werkzeug.utils import secure_filename

xlsxtopdf_bp = Blueprint('xlsxtopdf_bp', __name__, url_prefix='/xlsx-ke-pdf')

ALLOWED_EXT = {'.xlsx', '.xls', '.ods'}

def _find_soffice():
    for cmd in ('soffice', '/usr/bin/soffice', '/usr/local/bin/soffice'):
        path = shutil.which(cmd)
        if path:
            return path
    return None

@xlsxtopdf_bp.route('/', methods=['GET'])
def form():
    try:
        return render_template('xlsxtopdf.html')
    except Exception:
        return """
        <h2>XLSX → PDF</h2>
        <form action="/xlsx-ke-pdf/process" method="post" enctype="multipart/form-data">
            <input type="file" name="file" accept=".xls,.xlsx,.ods" />
            <button type="submit">Convert</button>
        </form>
        """, 200

@xlsxtopdf_bp.route('/process', methods=['POST'])
def process():
    if 'file' not in request.files:
        return "Tidak ada file yang diunggah", 400

    uploaded = request.files['file']
    if uploaded.filename == '':
        return "Nama file kosong", 400

    filename = secure_filename(uploaded.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXT:
        return "Hanya file .xls, .xlsx, atau .ods yang diizinkan", 400

    soffice_path = _find_soffice()
    if not soffice_path:
        current_app.logger.error("soffice (LibreOffice) tidak ditemukan di PATH")
        return "Server belum terinstal LibreOffice (soffice). Hubungi admin.", 500

    tmp_input = None
    tmp_out_dir = None
    try:
        # simpan input ke temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tf:
            uploaded.save(tf.name)
            tmp_input = tf.name

        tmp_out_dir = tempfile.mkdtemp(prefix='xlsxtopdf_out_')

        # jalankan soffice headless convert
        cmd = [
            soffice_path,
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', tmp_out_dir,
            tmp_input
        ]
        current_app.logger.info(f"Running soffice convert: {' '.join(cmd)}")
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600)

        if proc.returncode != 0:
            current_app.logger.error(f"soffice error stdout:{proc.stdout[:200]} stderr:{proc.stderr[:200]}")
            err_msg = proc.stderr.decode(errors='ignore') or proc.stdout.decode(errors='ignore') or "Konversi gagal"
            return f"Konversi gagal: {err_msg}", 500

        base = os.path.splitext(os.path.basename(tmp_input))[0]
        out_pdf_path = os.path.join(tmp_out_dir, f"{base}.pdf")
        if not os.path.exists(out_pdf_path):
            pdfs = [p for p in os.listdir(tmp_out_dir) if p.lower().endswith('.pdf')]
            if not pdfs:
                current_app.logger.error("Hasil PDF tidak ditemukan di direktori output")
                return "Gagal: file PDF hasil konversi tidak ditemukan.", 500
            out_pdf_path = os.path.join(tmp_out_dir, pdfs[0])

        return send_file(
            out_pdf_path,
            as_attachment=True,
            download_name=f"xlsx_pdf_web_toolkit.pdf",
            mimetype='application/pdf'
        )

    except subprocess.TimeoutExpired:
        current_app.logger.error("Konversi soffice timeout")
        return "Proses konversi timeout. Coba file lebih kecil atau cek instalasi LibreOffice.", 500
    except Exception as e:
        current_app.logger.exception("Error saat konversi XLSX->PDF")
        return f"Terjadi kesalahan saat konversi: {e}", 500
    finally:
        # cleanup
        try:
            if tmp_input and os.path.exists(tmp_input):
                os.remove(tmp_input)
        except Exception:
            pass
        try:
            if tmp_out_dir and os.path.exists(tmp_out_dir):
                shutil.rmtree(tmp_out_dir, ignore_errors=True)
        except Exception:
            pass
