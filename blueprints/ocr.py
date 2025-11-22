# blueprints/ocr.py

from flask import Blueprint, request, render_template, send_file, current_app
import pytesseract
from PIL import Image
from pdf2image import convert_from_bytes, pdfinfo_from_bytes
import io
import re
import os

pytesseract.tesseract_cmd = r'/usr/bin/tesseract'
poppler_path_var = r'/usr/bin'

ocr_bp = Blueprint('ocr_bp', __name__, url_prefix='/ocr')

def sanitize_text(text):
    cleaned_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return cleaned_text

@ocr_bp.route('/', methods=['GET'])
def form():
    return render_template('ocr.html')

@ocr_bp.route('/convert', methods=['POST'])
def convert_file():
    if 'file' not in request.files:
        return "Tidak ada file yang diunggah", 400

    file = request.files['file']
    if file.filename == '':
        return "Tidak ada file terpilih", 400

    try:
        file_bytes = file.read()
        file_mimetype = file.mimetype
        full_text = ""

        if 'pdf' in file_mimetype:
            info = pdfinfo_from_bytes(file_bytes, poppler_path=poppler_path_var)
            total_pages = info.get('Pages', 1)
            for i in range(1, total_pages + 1):
                page_img_list = convert_from_bytes(
                    file_bytes,
                    dpi=150,
                    poppler_path=poppler_path_var,
                    thread_count=2,
                    first_page=i,
                    last_page=i
                )
                if page_img_list:
                    page_img = page_img_list[0]
                    text = pytesseract.image_to_string(page_img, lang='ind')
                    full_text += f"\n\n--- PAGE {i} ---\n\n" + text
                    del page_img

        elif 'image' in file_mimetype or file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.webp', '.bmp', '.gif')):
            img = Image.open(io.BytesIO(file_bytes))
            full_text = pytesseract.image_to_string(img, lang='ind')
        else:
            return "Format file tidak didukung. Harap unggah PNG, JPG, atau PDF.", 415

        sanitized_text = sanitize_text(full_text).strip()
        if not sanitized_text:
            sanitized_text = " "  # agar file .txt tidak kosong (frontend akan menampilkan peringatan)

        file_stream = io.BytesIO(sanitized_text.encode('utf-8'))
        file_stream.seek(0)

        return send_file(
            file_stream,
            as_attachment=True,
            download_name='ocr_web_toolkit.txt',
            mimetype='text/plain'
        )

    except Exception as e:
        current_app.logger.error(f"OCR Error: {e}")
        if "MemoryError" in str(e) or "Cannot allocate memory" in str(e):
            return "Gagal memproses (Error Memori). File terlalu berat/besar.", 500
        return f"Terjadi kesalahan dalam pemrosesan file: {e}", 500
