# app.py

import os
from flask import Flask, render_template, send_from_directory, make_response
from datetime import datetime
# Import Blueprints yang baru dibuat
from blueprints.ocr import ocr_bp
from blueprints.combine import combine_bp
from blueprints.imagetopdf import imagetopdf_bp
from blueprints.sharpen import sharpen_bp
from blueprints.upscale import upscale_bp
from blueprints.compresspdf import compresspdf_bp
from blueprints.pdftoimage import pdftoimage_bp
from blueprints.pdftodocx import pdftodocx_bp
from blueprints.pdf_to_xlsx import pdf_to_xlsx_bp
from blueprints.docxtopdf import docxtopdf_bp
from blueprints.xlsxtopdf import xlsxtopdf_bp
from blueprints.summarizer import summ_bp
from blueprints.convertimage import convert_bp
from blueprints.paraphraser import para_bp

app = Flask(__name__)

# --- Konfigurasi Global ---
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # Maks 16 MB untuk semua upload

# --- TAMBAHKAN KONFIGURASI MODEL AI ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config['UPSCALE_MODEL_DIR'] = os.path.join(BASE_DIR, 'models')
app.config['AI_CPU_MAX_SIDE'] = 2500


# --- Pendaftaran Blueprints ---
app.register_blueprint(ocr_bp)
app.register_blueprint(combine_bp)
app.register_blueprint(imagetopdf_bp)
app.register_blueprint(sharpen_bp)
app.register_blueprint(upscale_bp)
app.register_blueprint(compresspdf_bp)
app.register_blueprint(pdftoimage_bp)
app.register_blueprint(pdftodocx_bp)
app.register_blueprint(pdf_to_xlsx_bp)
app.register_blueprint(docxtopdf_bp)
app.register_blueprint(xlsxtopdf_bp)
app.register_blueprint(summ_bp)
app.register_blueprint(convert_bp)
app.register_blueprint(para_bp)

# --- Routing Halaman Utama (Homepage) ---
@app.route('/')
def index():
    return render_template('index.html')
@app.route('/about')
def about():
    return render_template('about.html')
@app.route('/contact')
def contact():
    return render_template('contact.html')
@app.route('/privacy')
def privacy():
    return render_template('privacy.html')

# --- Routing fitur yang menggunakan Js (Statik/Client-Side) ---
@app.route('/qr-generator')
def qr_generator():
    return render_template('qrcode.html')
@app.route('/compress-image')
def compress_image():
    return render_template('compressimage.html')
@app.route('/downscale-image')
def downscale_image():
    return render_template('resizeimage.html')
@app.route('/password-generator')
def password_generator():
    return render_template('password_generator.html')

# --- Routing Robots.txt ---
@app.route('/robots.txt')
def robots_txt():
    # Mengirim file 'robots.txt' dari folder 'static'
    return send_from_directory(app.static_folder, 'robots.txt')

# --- Routing Sitemap.xml ---
@app.route('/sitemap.xml')
def sitemap():
    # URL dasar situs Anda
    BASE_URL = "https://toolkit.jhoniarifintarigan.id" 
    today = datetime.now().strftime('%Y-%m-%d')

    # Kumpulkan URL Statis
    # Ini adalah route-route yang Anda definisikan secara manual
    static_routes = [
        '/',
        '/about',
        '/contact',
        '/privacy',
        '/qr-generator',
        '/compress-image',
        '/ocr/',
        '/gabung-pdf/',
        '/image-to-pdf/',
        '/pertajam-gambar/',
        '/peningkatan-hd/',
        '/downscale-image',
        '/kompres-pdf/',
        '/pdf-ke-gambar/',
        '/pdf-ke-docx/',
        '/pdf-to-xlsx/',
        '/docx-ke-pdf/',
        '/xlsx-ke-pdf/',
        '/password-generator',
        '/summarizer/',
        '/convert-image/',
        '/paraphraser/',
        # Tambahkan halaman statis lainnya di sini
    ]

    xml_content = render_template(
        'sitemap.xml',
        base_url=BASE_URL,
        routes=static_routes,  # <-- INI PERBAIKANNYA
        lastmod_date=today
    )

    response = make_response(xml_content)
    response.headers["Content-Type"] = "application/xml"
    return response

# --- Handler Error 413 (File Terlalu Besar) ---
@app.errorhandler(413)
def request_entity_too_large(error):
    # Mengarahkan ke halaman utama dengan pesan error
    return render_template('index.html', error_message="Ukuran file terlalu besar. Maksimum yang diizinkan adalah 16 MB."), 413
