# blueprints/sharpen.py
import io
import os
import traceback
from flask import Blueprint, request, render_template, send_file, current_app
from PIL import Image, ImageFilter

# optional deps
try:
    import numpy as np
    NP_AVAILABLE = True
except Exception:
    NP_AVAILABLE = False

try:
    import cv2
    from cv2 import dnn_superres
    CV2_AVAILABLE = True
except Exception:
    CV2_AVAILABLE = False

sharpen_bp = Blueprint('sharpen_bp', __name__, url_prefix='/pertajam-gambar')

ALLOWED_MIMETYPES = {'image/jpeg', 'image/png', 'image/webp'}
SCALE = 4  # fixed ×4 for AI mode

# ---- Classic UnsharpMask pipeline (fast) ----
def sharpen_classic_pil(image_file_stream):
    img = Image.open(image_file_stream)
    output_format = img.format if img.format in ['JPEG', 'PNG', 'WEBP'] else 'PNG'

    if img.mode != 'RGB':
        img = img.convert('RGB')
        output_format = 'JPEG'

    img_sharpened = img.filter(ImageFilter.UnsharpMask(radius=1, percent=130, threshold=3))

    out_buf = io.BytesIO()
    if output_format == 'JPEG':
        img_sharpened.save(out_buf, format='JPEG', quality=95)
        mimetype = 'image/jpeg'; ext = 'jpg'
    elif output_format == 'WEBP':
        img_sharpened.save(out_buf, format='WEBP', quality=90)
        mimetype = 'image/webp'; ext = 'webp'
    else:
        img_sharpened.save(out_buf, format='PNG')
        mimetype = 'image/png'; ext = 'png'

    out_buf.seek(0)
    return out_buf, mimetype, ext

# ---- AI FSRCNN ×4 pipeline (slower) ----
def enhance_fscrnn_return_pil(image_bytes, model_dir):
    if not CV2_AVAILABLE:
        raise RuntimeError('OpenCV (opencv-contrib-python) tidak tersedia di server.')
    if not NP_AVAILABLE:
        raise RuntimeError('numpy tidak tersedia.')

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError('Gagal membaca input gambar (cv2).')

    sr = dnn_superres.DnnSuperResImpl_create()
    model_file = os.path.join(model_dir, f'FSRCNN_x{SCALE}.pb')
    if not os.path.exists(model_file):
        raise FileNotFoundError(f'Model FSRCNN tidak ditemukan: {model_file}')

    sr.readModel(model_file)
    sr.setModel('fsrcnn', SCALE)

    max_side = current_app.config.get('AI_CPU_MAX_SIDE', 2048)
    h, w = img.shape[:2]
    if max(h, w) > max_side:
        factor = max_side / max(h, w)
        img = cv2.resize(img, (int(w * factor), int(h * factor)), interpolation=cv2.INTER_AREA)

    result = sr.upsample(img)
    result_rgb = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(result_rgb)
    return pil_img

def post_process_downscale_to_original(orig_bytes, processed_pil):
    orig = Image.open(io.BytesIO(orig_bytes))
    orig_size = orig.size
    resized = processed_pil.resize(orig_size, Image.LANCZOS)
    out_buf = io.BytesIO()
    resized.save(out_buf, format='PNG')
    out_buf.seek(0)
    return out_buf, 'image/png', 'png'

# ---- Routes ----
@sharpen_bp.route('/', methods=['GET'])
def form():
    # render template (sharpen.html)
    return render_template('sharpen.html')

@sharpen_bp.route('/process', methods=['POST'])
def process():
    if 'image' not in request.files:
        return "Tidak ada file yang diunggah", 400

    file = request.files['image']
    if not file.filename or file.mimetype not in ALLOWED_MIMETYPES:
        return "Format file tidak didukung. Harap unggah JPG, PNG, atau WebP", 415

    mode = request.form.get('mode', 'classic')  # 'classic' or 'ai'
    model_dir = current_app.config.get('AI_MODEL_DIR') or './models'

    try:
        if mode == 'classic':
            out_buf, mimetype, ext = sharpen_classic_pil(file.stream)
            return send_file(out_buf, mimetype=mimetype, as_attachment=True, download_name=f'pertajam_web_toolkit.{ext}')

        elif mode == 'ai':
            # read bytes first (we need original bytes for resizing back)
            img_bytes = file.read()

            # run FSRCNN x4 -> returns PIL.Image
            processed_pil = enhance_fscrnn_return_pil(img_bytes, model_dir)

            # downscale back to original resolution and return PNG
            out_buf, mimetype, ext = post_process_downscale_to_original(img_bytes, processed_pil)
            return send_file(out_buf, mimetype=mimetype, as_attachment=True, download_name=f'pertajam_web_toolkit.{ext}')

        else:
            return "Mode tidak dikenal.", 400

    except Exception as e:
        current_app.logger.error('Sharpen error: %s', traceback.format_exc())
        return str(e), 500
