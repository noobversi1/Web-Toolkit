# blueprints/paraphraser.py
import re
from flask import Blueprint, request, render_template, jsonify, current_app
try:
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    import torch
except Exception:
    AutoTokenizer = None
    AutoModelForSeq2SeqLM = None
    torch = None

para_bp = Blueprint('para_bp', __name__, url_prefix='/paraphraser')

MODEL_ID = "Wikidepia/IndoT5-base-paraphrase"

_models = None

def ensure_models():
    global _models
    if _models is not None:
        return _models

    if AutoTokenizer is None or AutoModelForSeq2SeqLM is None:
        raise RuntimeError("Install transformers, torch, sentencepiece")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    current_app.logger.info(f"Loading paraphrase model {MODEL_ID} on {device}")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID).to(device)
    _models = {"device": device, "tokenizer": tokenizer, "model": model}
    return _models

# --- Improved chunking by sentence to avoid mid-clause splits ---
_sentence_split_re = re.compile(r'(?<=[\.\!\?])\s+')

def chunk_text_by_sentence(text, max_words=120):
    sents = _sentence_split_re.split(text.strip())
    chunks = []
    cur = []
    cur_words = 0
    for s in sents:
        s = s.strip()
        if not s:
            continue
        wcount = len(s.split())
        if cur_words + wcount <= max_words:
            cur.append(s)
            cur_words += wcount
        else:
            if cur:
                chunks.append(" ".join(cur).strip())
            # if the sentence itself is too long, break by words
            if wcount > max_words:
                words = s.split()
                i = 0
                while i < len(words):
                    chunk = " ".join(words[i:i+max_words])
                    chunks.append(chunk)
                    i += max_words
                cur = []
                cur_words = 0
            else:
                cur = [s]
                cur_words = wcount
    if cur:
        chunks.append(" ".join(cur).strip())
    return chunks

# --- Sanitization: remove sentinel tokens and collapse weird punctuation/whitespace ---
def sanitize_output(s):
    if not s:
        return s
    # remove T5 sentinel tokens like <extra_id_0>
    s = re.sub(r"<extra_id_\d+>", "", s)
    # collapse repeated punctuation sequences (". . ," -> ".")
    s = re.sub(r'([\.!,;:\-\?])\s*([\.!,;:\-\?\s]+)+', r'\1 ', s)
    # remove multiple spaces/newlines
    s = re.sub(r"\s+", " ", s).strip()
    # remove awkward leftover repeated punctuation
    s = re.sub(r"([\.!,;:\-]){2,}", r"\1", s)
    return s

# --- Generation helper (safer decode) ---
def generate_chunk(chunk, models, params):
    tokenizer = models["tokenizer"]
    model = models["model"]
    device = models["device"]
    prefix = params.get("prefix", "paraphrase: ")
    prompt = prefix + chunk.strip()

    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, padding=True).to(device)

    with torch.no_grad():
        outs = model.generate(
            **inputs,
            max_length=params.get("max_length", 256),
            min_length=params.get("min_length", 10),
            num_beams=params.get("num_beams", 3),
            temperature=params.get("temperature", 0.7),
            no_repeat_ngram_size=params.get("no_repeat_ngram_size", 3),
            length_penalty=params.get("length_penalty", 1.0),
            early_stopping=True,
        )
    decoded_list = tokenizer.batch_decode(outs, skip_special_tokens=True, clean_up_tokenization_spaces=True)
    decoded = decoded_list[0] if decoded_list else ""
    return sanitize_output(decoded)

# --- Fallback-safe paraphrase: retry with alt params if output looks wrong ---
def looks_bad_output(s):
    if not s:
        return True
    # if contains sentinel token or too short (less than 2 words) or lots of nonalpha characters
    if re.search(r"<extra_id_\d+>", s):
        return True
    if len(s.split()) < 2:
        return True
    # suspicious punctuation-heavy output
    pct_nonalpha = sum(1 for ch in s if not ch.isalnum() and not ch.isspace()) / max(1, len(s))
    if pct_nonalpha > 0.2:
        return True
    return False

def safe_paraphrase(chunk, models, cpu_mode=True):
    # primary params
    base = {
        "prefix": "paraphrase: ",
        "num_beams": 2 if cpu_mode else 4,
        "no_repeat_ngram_size": 3,
        "temperature": 0.6 if cpu_mode else 0.7,
        "length_penalty": 1.0,
        "min_length": max(8, int(len(chunk.split()) * 0.6)),
        "max_length": max(80, int(len(chunk.split()) * 1.2)),
    }
    # generate first pass
    out = generate_chunk(chunk, models, base)
    if not looks_bad_output(out):
        return out

    # retry with more stochastic / longer settings
    alt = {
        "prefix": "",
        "num_beams": 1,
        "no_repeat_ngram_size": 2,
        "temperature": 0.95,
        "length_penalty": 0.9,
        "min_length": max(8, int(len(chunk.split()) * 0.9)),
        "max_length": max(120, int(len(chunk.split()) * 1.6)),
    }
    out2 = generate_chunk(chunk, models, alt)
    if not looks_bad_output(out2):
        return out2

    # last resort: return original chunk (safe fallback)
    return chunk

# --- Mode parameter logic (used when generating whole-text single-shot; kept for compatibility if needed) ---
def get_mode_params(mode, input_length, cpu_mode=True):
    # Kept for backward compatibility but process() uses safe_paraphrase + chunking.
    base = {
        "prefix": "paraphrase: ",
        "num_beams": 2 if cpu_mode else 4,
        "no_repeat_ngram_size": 3,
        "temperature": 0.7,
        "length_penalty": 1.0,
        "min_length": 10,
        "max_length": 256
    }

    if mode == "natural":
        base["temperature"] = 0.6
        base["min_length"] = max(8, int(input_length * 0.6))
        base["max_length"] = max(80, int(input_length * 1.1))
        return base

    elif mode == "longer":
        base["temperature"] = 0.8
        base["length_penalty"] = 0.9
        base["num_beams"] = max(2, (2 if cpu_mode else 4) + 1)
        base["min_length"] = max(20, int(input_length * 1.05))
        base["max_length"] = max(200, int(input_length * 1.6))
        return base

    elif mode == "same_length":
        base["temperature"] = 0.55
        base["length_penalty"] = 1.0
        base["min_length"] = max(5, int(input_length * 0.9))
        base["max_length"] = int(input_length * 1.1) + 10
        return base

    return base

# --- Routes ---
@para_bp.route("/", methods=["GET"])
def form():
    return render_template("paraphraser.html")


@para_bp.route("/process", methods=["POST"])
def process():
    text = request.form.get("text", "").strip()
    mode = request.form.get("mode", "natural").strip()

    if not text:
        return "Tidak ada teks yang diberikan.", 400

    try:
        models = ensure_models()
    except Exception as e:
        current_app.logger.exception("Model load error")
        return str(e), 500

    cpu_mode = (models["device"].type == "cpu")

    # decide chunk size: smaller on CPU to reduce memory pressure
    max_words = 100 if cpu_mode else 140

    # Split into paragraphs (kehilangan lebih dari satu baris kosong disamaratakan ke satu pemisah)
    # Ini mempertahankan urutan paragraf; paragraf kosong diabaikan.
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n+', text) if p.strip()]

    output_paragraphs = []
    for para in paragraphs:
        # chunk by sentence inside this paragraph
        chunks = chunk_text_by_sentence(para, max_words=max_words)
        out_chunks = []
        for c in chunks:
            if mode == "natural":
                p = safe_paraphrase(c, models, cpu_mode=cpu_mode)
            elif mode == "longer":
                params = {
                    "prefix": "paraphrase: ",
                    "num_beams": 3 if not cpu_mode else 2,
                    "no_repeat_ngram_size": 2,
                    "temperature": 0.85,
                    "length_penalty": 0.9,
                    "min_length": max(20, int(len(c.split()) * 1.05)),
                    "max_length": max(150, int(len(c.split()) * 1.6))
                }
                try:
                    p = generate_chunk(c, models, params)
                    if looks_bad_output(p):
                        p = safe_paraphrase(c, models, cpu_mode=cpu_mode)
                except Exception:
                    current_app.logger.exception("Longer mode failed, fallback")
                    p = safe_paraphrase(c, models, cpu_mode=cpu_mode)
            elif mode == "same_length":
                params = {
                    "prefix": "paraphrase: ",
                    "num_beams": 2,
                    "no_repeat_ngram_size": 3,
                    "temperature": 0.6,
                    "length_penalty": 1.0,
                    "min_length": max(5, int(len(c.split()) * 0.9)),
                    "max_length": int(len(c.split()) * 1.1) + 10
                }
                try:
                    p = generate_chunk(c, models, params)
                    if looks_bad_output(p):
                        p = safe_paraphrase(c, models, cpu_mode=cpu_mode)
                except Exception:
                    current_app.logger.exception("Same-length mode failed, fallback")
                    p = safe_paraphrase(c, models, cpu_mode=cpu_mode)
            else:
                p = safe_paraphrase(c, models, cpu_mode=cpu_mode)

            out_chunks.append(p)

        # gabungkan kembali chunks jadi 1 paragraf
        para_result = " ".join(out_chunks).strip()
        para_result = sanitize_output(para_result)
        if not para_result:
            para_result = para
        output_paragraphs.append(para_result)

    # gabungkan paragraf dengan dua baris baru agar output tetap memuat paragraf
    final_text = "\n\n".join(output_paragraphs).strip()
    if not final_text:
        final_text = text

    return jsonify({"paraphrased": final_text})
