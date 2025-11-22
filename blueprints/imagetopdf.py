# blueprints/imagetopdf.py

import io
from flask import Blueprint, request, render_template, send_file, current_app
from PIL import Image # Import library Pillow

# 1. Inisialisasi Blueprint
imagetopdf_bp = Blueprint('imagetopdf_bp', __name__, url_prefix='/image-to-pdf')

# Daftar mimetype gambar yang diizinkan
ALLOWED_MIMETYPES = {'image/jpeg', 'image/png', 'image/webp'}

def create_pdf_from_images(image_files):
    pil_images = []
    MAX_WIDTH = 1600 # Batasi lebar gambar (hemat RAM!)
    
    for file in image_files:
        try:
            # Buka gambar dari stream file
            img = Image.open(file.stream)

            # --- TAMBAHAN OPTIMASI ---
            if img.width > MAX_WIDTH:
                scale = MAX_WIDTH / img.width
                new_height = int(img.height * scale)
                img = img.resize((MAX_WIDTH, new_height), Image.Resampling.LANCZOS)
            # --- AKHIR OPTIMASI ---
            
            # Konversi ke RGB. 
            if img.mode != 'RGB':
                img = img.convert('RGB')
                
            pil_images.append(img)
            
        except Exception as e:
            current_app.logger.error(f"Gagal memproses gambar: {file.filename}. Error: {e}")
            raise Exception(f"Gagal memproses file '{file.filename}'. Pastikan file gambar valid.")

    if not pil_images:
        raise Exception("Tidak ada gambar valid yang ditemukan.")

    # Ambil gambar pertama dan sisa gambar
    first_image = pil_images[0]
    other_images = pil_images[1:]

    # Buat PDF di memori
    output_buffer = io.BytesIO()
    
    # Simpan gambar pertama, dan tambahkan gambar lainnya
    first_image.save(
        output_buffer,
        "PDF",
        resolution=100.0,
        save_all=True,
        append_images=other_images # Tambahkan sisa gambar
    )
    
    output_buffer.seek(0)
    return output_buffer

# 2. Routing untuk Halaman Form (GET)
@imagetopdf_bp.route('/', methods=['GET'])
def form():
    # Menggunakan nama file HTML yang akan kita buat (imagetopdf.html)
    return render_template('imagetopdf.html')

# 3. Routing untuk Proses Konversi (POST)
@imagetopdf_bp.route('/convert', methods=['POST'])
def convert():
    uploaded_files = request.files.getlist('images[]')
    
    # Filter hanya file yang valid (ada nama & mimetype diizinkan)
    valid_files = [
        file for file in uploaded_files 
        if file.filename and file.mimetype in ALLOWED_MIMETYPES
    ]

    if not valid_files:
        return "Harap unggah minimal satu file gambar (JPG, PNG, WebP)", 400

    try:
        pdf_output = create_pdf_from_images(valid_files)

        return send_file(
            pdf_output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='gambar_ke_pdf_toolkit.pdf'
        )

    except Exception as e:
        return str(e), 500