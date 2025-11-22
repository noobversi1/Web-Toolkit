# blueprints/docxtopdf.py
import os
import io
import zipfile
import tempfile
import shutil
import subprocess
from pathlib import Path
from flask import Blueprint, request, send_file, render_template, current_app, abort
from werkzeug.utils import secure_filename

# blueprint
docxtopdf_bp = Blueprint('docxtopdf_bp', __name__, url_prefix='/docx-ke-pdf')

# allowed extensions
ALLOWED_EXT = {'.docx', '.doc'}

# --------------------
# helper: find soffice
# --------------------
def _find_soffice():
    for cmd in ('soffice', '/usr/bin/soffice', '/usr/local/bin/soffice'):
        path = shutil.which(cmd)
        if path:
            return path
    return None

# ------------------------------------------------
# helper: extract embedded fonts from a .docx (zip)
# ------------------------------------------------
def extract_embedded_fonts_from_docx(docx_path, target_fonts_dir):
    """
    Cari font di dalam docx (word/embeddings atau word/fonts).
    Kembalikan list path dari font yang diekstrak.
    """
    extracted = []
    try:
        with zipfile.ZipFile(docx_path, 'r') as z:
            for name in z.namelist():
                if name.startswith('word/embeddings') or name.startswith('word/fonts'):
                    if name.lower().endswith(('.ttf', '.otf', '.ttc', '.pfb', '.pfm')):
                        basename = os.path.basename(name)
                        dest = os.path.join(target_fonts_dir, basename)
                        with open(dest, 'wb') as f:
                            f.write(z.read(name))
                        extracted.append(dest)
    except zipfile.BadZipFile:
        current_app.logger.debug("Uploaded file is not a valid zip/docx for font extraction.")
    return extracted

# ------------------------------------------
# helper: install fonts at user-level directory
# ------------------------------------------
def install_fonts_user_level(font_paths):
    """
    Install fonts to user-level folder:
      ~/.local/share/fonts/webtoolkit_temp
    Returns the installed font directory path.
    """
    user_font_dir = os.path.expanduser("~/.local/share/fonts/webtoolkit_temp")
    os.makedirs(user_font_dir, exist_ok=True)
    for f in font_paths:
        try:
            shutil.copy(f, user_font_dir)
        except Exception as e:
            current_app.logger.warning(f"Failed copy font {f}: {e}")
    # rebuild font cache (best-effort)
    try:
        subprocess.run(["fc-cache", "-f", "-v"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        current_app.logger.debug(f"fc-cache failed: {e}")
    return user_font_dir

def cleanup_fonts_user_level(dirpath):
    try:
        shutil.rmtree(dirpath, ignore_errors=True)
        subprocess.run(["fc-cache", "-f", "-v"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        current_app.logger.debug(f"cleanup_fonts_user_level error: {e}")

# --------------------
# routes
# --------------------
@docxtopdf_bp.route('/', methods=['GET'])
def form():
    # buat template sederhana atau gunakan template proyekmu
    # kalau tidak ada template, render teks sederhana (developer: replace with real template)
    try:
        return render_template('docxtopdf.html')
    except Exception:
        # fallback: simple html
        return """
        <h2>DOCX → PDF</h2>
        <form action="/docx-ke-pdf/process" method="post" enctype="multipart/form-data">
            <input type="file" name="file" accept=".doc,.docx" />
            <button type="submit">Convert</button>
        </form>
        """, 200

@docxtopdf_bp.route('/process', methods=['POST'])
def process():
    if 'file' not in request.files:
        return "Tidak ada file yang diunggah", 400

    uploaded = request.files['file']
    if uploaded.filename == '':
        return "Nama file kosong", 400

    filename = secure_filename(uploaded.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXT:
        return "Hanya file .docx atau .doc yang diizinkan", 400

    soffice_path = _find_soffice()
    if not soffice_path:
        current_app.logger.error("soffice (LibreOffice) tidak ditemukan di PATH")
        return "Server belum terinstal LibreOffice (soffice). Hubungi admin.", 500

    tmp_input = None
    tmp_out_dir = None
    temp_font_extract_dir = None
    installed_font_dir = None

    try:
        # simpan input ke temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tf:
            uploaded.save(tf.name)
            tmp_input = tf.name

        # prepare out dir
        tmp_out_dir = tempfile.mkdtemp(prefix='docxtopdf_out_')

        # 1) ekstrak font embedded (hanya untuk .docx)
        if ext == '.docx':
            temp_font_extract_dir = tempfile.mkdtemp(prefix='docx_fonts_')
            extracted = extract_embedded_fonts_from_docx(tmp_input, temp_font_extract_dir)
            if extracted:
                # install ke user-level fonts
                installed_font_dir = install_fonts_user_level(extracted)
                current_app.logger.info(f"Embedded fonts installed to: {installed_font_dir}")
            else:
                # no embedded fonts
                shutil.rmtree(temp_font_extract_dir, ignore_errors=True)
                temp_font_extract_dir = None

        # 2) jalankan soffice untuk convert
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
            # tampilkan pesan error yang bersih ke user
            err_msg = proc.stderr.decode(errors='ignore') or proc.stdout.decode(errors='ignore') or "Konversi gagal"
            return f"Konversi gagal: {err_msg}", 500

        # hasil file biasanya sama nama tapi .pdf
        base = os.path.splitext(os.path.basename(tmp_input))[0]
        out_pdf_path = os.path.join(tmp_out_dir, f"{base}.pdf")
        if not os.path.exists(out_pdf_path):
            # kadang libreoffice memberi nama lain — cari file .pdf di folder output
            pdfs = [p for p in os.listdir(tmp_out_dir) if p.lower().endswith('.pdf')]
            if not pdfs:
                current_app.logger.error("Hasil PDF tidak ditemukan di direktori output")
                return "Gagal: file PDF hasil konversi tidak ditemukan.", 500
            out_pdf_path = os.path.join(tmp_out_dir, pdfs[0])

        # kirim file ke client
        return send_file(
            out_pdf_path,
            as_attachment=True,
            download_name=f"docx_pdf_web_toolkit.pdf",
            mimetype='application/pdf'
        )

    except subprocess.TimeoutExpired:
        current_app.logger.error("Konversi soffice timeout")
        return "Proses konversi timeout. Coba file lebih kecil atau cek instalasi LibreOffice.", 500
    except Exception as e:
        current_app.logger.exception("Error saat konversi DOCX->PDF")
        return f"Terjadi kesalahan saat konversi: {e}", 500
    finally:
        # cleanup temp input
        try:
            if tmp_input and os.path.exists(tmp_input):
                os.remove(tmp_input)
        except Exception:
            pass

        # cleanup output dir
        try:
            if tmp_out_dir and os.path.exists(tmp_out_dir):
                shutil.rmtree(tmp_out_dir, ignore_errors=True)
        except Exception:
            pass

        # cleanup extracted fonts
        try:
            if temp_font_extract_dir and os.path.exists(temp_font_extract_dir):
                shutil.rmtree(temp_font_extract_dir, ignore_errors=True)
        except Exception:
            pass

        # cleanup installed fonts
        try:
            if installed_font_dir:
                cleanup_fonts_user_level(installed_font_dir)
        except Exception:
            pass
