// static/js/password.js
document.addEventListener('alpine:init', () => {
  Alpine.data('passwordGenerator', () => ({
    password: '',
    opts: {
      length: 16,
      upper: true,
      lower: true,
      digits: true,
      symbols: true
    },

    initialize() {
      // generate default pada load
      this.generate();
    },

    generate() {
      const choices = [];
      const sets = {
        upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        lower: 'abcdefghijklmnopqrstuvwxyz',
        digits: '0123456789',
        symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~`|\\'
      };

      // kumpulkan charset sesuai opsi
      if (this.opts.upper) choices.push(sets.upper);
      if (this.opts.lower) choices.push(sets.lower);
      if (this.opts.digits) choices.push(sets.digits);
      if (this.opts.symbols) choices.push(sets.symbols);

      if (choices.length === 0) {
        // kalau pengguna tak centang apa-apa, fallback ke lower
        choices.push(sets.lower);
        this.opts.lower = true;
      }

      const pool = choices.join('');
      const poolLen = pool.length;
      const length = Math.max(1, Math.min(256, this.opts.length));

      // gunakan crypto untuk random secure
      const array = new Uint32Array(length);
      window.crypto.getRandomValues(array);

      let out = '';
      // Pastikan minimal satu karakter dari tiap set yang dipilih — agar komposisi lebih kuat
      const mustInclude = [];
      if (this.opts.upper) mustInclude.push(sets.upper);
      if (this.opts.lower) mustInclude.push(sets.lower);
      if (this.opts.digits) mustInclude.push(sets.digits);
      if (this.opts.symbols) mustInclude.push(sets.symbols);

      // sisipkan satu dari tiap mustInclude di awal
      for (let i = 0; i < mustInclude.length && i < length; i++) {
        const s = mustInclude[i];
        const idx = Math.floor(Math.abs(window.crypto.getRandomValues(new Uint32Array(1))[0]) / (0xFFFFFFFF + 1) * s.length);
        out += s.charAt(idx);
      }

      // isi sisanya
      for (let i = out.length; i < length; i++) {
        const idx = array[i] % poolLen;
        out += pool.charAt(idx);
      }

      // acak posisi agar pola awal tidak tertebak
      this.password = this._shuffleString(out);
    },

    _shuffleString(str) {
      const arr = str.split('');
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(window.crypto.getRandomValues(new Uint32Array(1))[0] / (0xFFFFFFFF + 1) * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.join('');
    },

    copy() {
      if (!this.password) return;
      navigator.clipboard.writeText(this.password).then(() => {
        alertUser('✅ Kata sandi disalin ke clipboard');
      }).catch(() => {
        alertUser('❌ Gagal menyalin. Silakan salin manual.');
      });
    },

    // Estimasi entropy: entropy = length * log2(poolSize)
    get entropy() {
      let pool = 0;
      if (this.opts.lower) pool += 26;
      if (this.opts.upper) pool += 26;
      if (this.opts.digits) pool += 10;
      if (this.opts.symbols) pool += 32; // perkiraan simbol umum
      if (pool <= 0) pool = 26;
      const e = this.opts.length * Math.log2(pool);
      return Math.round(e * 10) / 10;
    },

    get entropyText() {
      return `${this.entropy} bit entropy`;
    },

    get strengthLabel() {
      const e = this.entropy;
      if (e < 28) return 'Sangat Lemah';
      if (e < 36) return 'Lemah';
      if (e < 60) return 'Cukup';
      if (e < 80) return 'Kuat';
      return 'Sangat Kuat';
    },

    get strengthClass() {
      const label = this.strengthLabel;
      if (label === 'Sangat Lemah' || label === 'Lemah') return 'text-red-600 font-semibold';
      if (label === 'Cukup') return 'text-yellow-600 font-semibold';
      if (label === 'Kuat') return 'text-green-600 font-semibold';
      return 'text-green-800 font-semibold';
    }
  }));
});
