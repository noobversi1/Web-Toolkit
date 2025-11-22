# Panduan cepat — **Deploy Web Toolkit (versi stabil)** ke server (Ubuntu/Debian)

# 1) Ringkasan yang perlu dipersiapkan

* Sistem: Ubuntu/Debian (instruksi paket di bawah).
* Python (disarankan 3.10+) + virtualenv.
* Install paket pip dari `requirements.txt`. 
* Dependencies system (image/pdf/ocr/opencv/ghostscript/poppler/tesseract). Instruksi instal ada di bawah.
* Jika fitur **perbesar gambar (FSRCNN)** dipakai: letakkan file model `.pb` pada folder yang dipoint ke `UPSCALE_MODEL_DIR` di konfigurasi Flask — blueprint upscale membaca itu. 
* Jika fitur **paraphraser** digunakan: membutuhkan `transformers`, `torch`, `sentencepiece` dan model besar (di-load runtime). Bisa jalan CPU, tapi kenceng kalau ada GPU. 
* Untuk **summarizer**: perlu NLTK data (tokenizers) atau fallbacks; sediakan `nltk_data` jika ingin hasil optimal. 

---

# 2) Paket system yang umum diperlukan (Ubuntu/Debian)

Jalankan sebagai root / sudo:

```bash
sudo apt update && sudo apt install -y \
    build-essential python3 python3-venv python3-pip \
    libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
    poppler-utils ghostscript tesseract-ocr tesseract-ocr-ind \
    ffmpeg
```

Penjelasan singkat:

* `libgl1` & keluarga: buat OpenCV headless nyaman.
* `poppler-utils`: `pdftoppm` untuk pdf2image.
* `ghostscript`: manipulasi PDF.
* `tesseract-ocr` + language pack: OCR feature.
* `ffmpeg`: beberapa konversi gambar/video bila perlu.

---

# 3) Deploy aplikasi Python (recommended steps)

(anggap repo sudah di server)

```bash
# masuk ke folder project
cd /srv/webtoolkit

# buat virtualenv
python3 -m venv .venv
source .venv/bin/activate

# upgrade pip & install requirements
pip install --upgrade pip
pip install -r requirements.txt
```

(Requirements utama ada di `requirements.txt` — termasuk `Flask`, `gunicorn`, `opencv-contrib-python-headless`, `torch`/`transformers` jika kamu tambahkan). 

---

# 4) Konfigurasi Flask (contoh `config.py`)

Buat file `config.py` atau gunakan env vars. Contoh minimal:

```py
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'ganti_ini_dengan_strong_key')
    DEBUG = False
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024   # 16 MB upload limit (sesuaikan)
    UPSCALE_MODEL_DIR = os.environ.get('UPSCALE_MODEL_DIR', '/srv/webtoolkit/models/fsrcnn')
```

> Penting: blueprint **upscale** membaca `UPSCALE_MODEL_DIR` untuk model FSRCNN — pastikan folder itu ada dan berisi `FSRCNN_x2.pb`, `FSRCNN_x3.pb`, `FSRCNN_x4.pb` sesuai kebutuhan. 

---

# 5) Download / letakkan model AI

* Untuk fungsi perbesar (FSRCNN) taruh file `.pb` di folder `UPSCALE_MODEL_DIR`. Nama file yang dicari di kode: `FSRCNN_x{scale}.pb` (mis. `FSRCNN_x4.pb`). 
* Untuk paraphraser: jika mau gunakan offline, pastikan model `Wikidepia/IndoT5-base-paraphrase` (atau yang kamu tetapkan) sudah di-cache / di-predownload (transformers akan otomatis download jika ada akses internet). Perlu banyak disk & RAM. 

---

# 6) Menjalankan (development & production)

**Development (quick test):**

```bash
export FLASK_APP=run.py   # atau nama app factory mu
export FLASK_ENV=development
flask run --host=0.0.0.0 --port=5000
```

**Production (Gunicorn + systemd):**
Contoh command (dijalankan di virtualenv):

```bash
# di folder project, virtualenv sudah active
gunicorn "app:create_app()" -w 3 -b 127.0.0.1:8000 --timeout 120
```

* `-w 3` worker: pakai (2 x cpu_cores + 1) sebagai guideline.
* `--timeout` perlu dinaikkan jika ada proses berat (upscale bisa lama).
  Gunakan `systemd` service file untuk auto-restart.

Contoh ` /etc/systemd/system/webtoolkit.service`:

```
[Unit]
Description=Web Toolkit Gunicorn
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/srv/webtoolkit
Environment="PATH=/srv/webtoolkit/.venv/bin"
Environment="FLASK_ENV=production"
ExecStart=/srv/webtoolkit/.venv/bin/gunicorn "app:create_app()" -w 3 -b 127.0.0.1:8000 --timeout 120
Restart=on-failure
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

---

# 7) Nginx sebagai reverse proxy (contoh)

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 32M; # harus >= MAX_CONTENT_LENGTH
}
```

Jangan lupa pasang SSL (certbot) untuk production.

---

# 8) Permissions & security

* Jangan jalankan aplikasi sebagai `root`. Gunakan user terpisah (`www-data` atau `webtoolkit`).
* Batasi `MAX_CONTENT_LENGTH` di Flask agar server tidak mudah kehabisan memori.
* Pastikan upload folder (jika ada penyimpanan sementara) punya permission yang benar dan tidak world-writeable.

---

# 9) Tips perf & troubleshooting

* Fitur **upscale** dan model ML lain bisa makan memori (OOM) — pantau `dmesg`/`journalctl`. Untuk OpenCV superres, jika gambar besar kemungkinan memori tinggi. 
* Paraphraser (`transformers` + `torch`) berat: jika tidak punya GPU, set ekspektasi waktu dan gunakan chunking — kode bawaan sudah mendeteksi CPU/GPU dan menyesuaikan. 
* Jika summarizer error karena NLTK tokenizer tidak tersedia, library ada fallback (simple splitter). Namun untuk hasil terbaik, sediakan NLTK data (tokenizers). 
* Static & frontend: semua `static/js` dan `templates` disertakan — pastikan nginx melayani static (opsional) atau biarkan Flask (untuk dev). File global app.js mengatur overlay & maksimal ukuran yang dipakai UI. 
