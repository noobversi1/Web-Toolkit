# blueprints/compresspdf.py
import os
import io
import tempfile
import subprocess
from flask import Blueprint, request, send_file, render_template, current_app
from werkzeug.utils import secure_filename

compresspdf_bp = Blueprint('compresspdf_bp', __name__, url_prefix='/kompres-pdf')


@compresspdf_bp.route('/', methods=['GET'])
def form():
    """Menampilkan halaman HTML Kompres PDF"""
    return render_template('compresspdf.html')


def _map_level_to_pdfsettings(level: str) -> str:
    mapping = {
        'low': '/screen',    # quality rendah, size terkecil
        'medium': '/ebook',  # kualitas sedang
        'high': '/printer'   # kualitas tinggi
    }
    return mapping.get(level, '/ebook')


def _check_ghostscript_available() -> bool:
    try:
        subprocess.run(["gs", "--version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False


@compresspdf_bp.route('/process', methods=['POST'])
def process():
    """Menerima file PDF, mengompresnya menggunakan Ghostscript, dan mengirim kembali"""

    # Validasi dasar
    if 'file' not in request.files:
        return "Tidak ada file yang diunggah", 400

    uploaded_file = request.files['file']
    if uploaded_file.filename == '':
        return "Nama file kosong", 400

    if not uploaded_file.filename.lower().endswith('.pdf'):
        return "Hanya file PDF yang diizinkan", 400

    # Pastikan Ghostscript tersedia
    if not _check_ghostscript_available():
        current_app.logger.error("Ghostscript tidak ditemukan di PATH. Pastikan 'gs' terinstall.")
        return "Ghostscript belum terinstall di server. Hubungi admin.", 500

    level = request.form.get('level', 'medium')
    pdf_setting = _map_level_to_pdfsettings(level)

    # Simpan file upload ke temp file
    in_tmp_path = None
    out_tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="in_pdf_", suffix=".pdf", delete=False) as in_tmp:
            in_tmp_path = in_tmp.name
            uploaded_file.stream.seek(0)
            in_tmp.write(uploaded_file.stream.read())
            in_tmp.flush()

        # buat temp output file path
        fd, out_tmp_path = tempfile.mkstemp(prefix="out_pdf_", suffix=".pdf")
        os.close(fd)

        # command Ghostscript
        # -dPDFSETTINGS controls quality/size
        cmd = [
            "gs",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS={pdf_setting}",
            "-dNOPAUSE",
            "-dBATCH",
            "-dQUIET",
            "-sOutputFile=" + out_tmp_path,
            in_tmp_path
        ]

        # Jalankan Ghostscript (timeout untuk safety)
        # sesuaikan timeout jika file besar atau server lambat
        subprocess.run(cmd, check=True, timeout=60)

        # Baca hasil ke memory buffer agar bisa safe hapus temp file setelahnya
        with open(out_tmp_path, "rb") as f:
            output_bytes = f.read()

        output_buffer = io.BytesIO(output_bytes)
        output_buffer.seek(0)

        # nama file hasil
        new_filename = "kompres_pdf_web_toolkit.pdf"

        return send_file(
            output_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=new_filename
        )

    except subprocess.CalledProcessError as e:
        current_app.logger.error(f"Ghostscript error: {e}")
        return "Gagal mengompres file (Ghostscript error).", 500
    except subprocess.TimeoutExpired:
        current_app.logger.error("Proses Ghostscript timeout.")
        return "Proses kompresi melebihi batas waktu.", 500
    except Exception as e:
        current_app.logger.error(f"Error saat memproses PDF: {e}")
        return f"Terjadi kesalahan saat kompresi: {e}", 500
