# blueprints/convertimage.py
import io
from flask import Blueprint, request, send_file, current_app, jsonify
from PIL import Image, ImageSequence, UnidentifiedImageError

convert_bp = Blueprint('convert_bp', __name__, url_prefix='/convert-image')

@convert_bp.route('/', methods=['GET'])
def form():
    from flask import render_template
    return render_template('convertimage.html')

# server menerima MIME target ini
ALLOWED = {
    'image/png', 'image/jpeg', 'image/webp',
    'image/bmp', 'image/tiff', 'image/gif'
}

@convert_bp.route('/process', methods=['POST'])
def process():
    # proteksi dasar
    if 'image' not in request.files:
        return "Tidak ada file", 400
    f = request.files['image']
    target = request.form.get('target')
    try:
        quality = int(request.form.get('quality', 90))
    except:
        quality = 90

    if not target or target not in ALLOWED:
        return "Target format tidak didukung di server.", 415

    try:
        img = Image.open(f.stream)
    except UnidentifiedImageError:
        return "File bukan gambar yang valid.", 400
    except Exception as e:
        current_app.logger.exception("Open image error")
        return f"Gagal membuka gambar: {e}", 500

    buf = io.BytesIO()

    # handle animated GIF specially
    if target == 'image/gif':
        try:
            frames = [frame.convert('RGBA').copy() for frame in ImageSequence.Iterator(img)]
            # jika hanya 1 frame, simpan single GIF
            if len(frames) == 1:
                frames[0].save(buf, format='GIF')
            else:
                frames[0].save(buf, format='GIF', save_all=True, append_images=frames[1:], loop=0)
            buf.seek(0)
            return send_file(buf, mimetype='image/gif', as_attachment=True, download_name='converted.gif')
        except Exception as e:
            current_app.logger.exception("GIF save error")
            return f"Error saat menyimpan GIF: {e}", 500

    # persiapkan save kwargs
    save_kwargs = {}
    if target in ('image/jpeg', 'image/webp'):
        save_kwargs['quality'] = max(10, min(95, quality))
        if target == 'image/webp':
            save_kwargs['quality'] = max(10, min(100, quality))

    # jika format tujuan tidak mendukung alpha, handle alpha -> fill background
    out_img = img
    try:
        if target in ('image/jpeg', 'image/bmp') and img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255,255,255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[-1])
            out_img = bg
        elif img.mode == 'P':
            out_img = img.convert('RGBA')
    except Exception:
        out_img = img.convert('RGBA')

    out_format = {
        'image/png':'PNG','image/jpeg':'JPEG','image/webp':'WEBP',
        'image/bmp':'BMP','image/tiff':'TIFF'
    }.get(target, 'PNG')

    try:
        out_img.save(buf, format=out_format, **save_kwargs)
        buf.seek(0)
        ext = out_format.lower()
        return send_file(buf, mimetype=target, as_attachment=True, download_name=f'converted.{ext}')
    except Exception as e:
        current_app.logger.exception("Save converted image error")
        return f"Gagal menyimpan hasil: {e}", 500
