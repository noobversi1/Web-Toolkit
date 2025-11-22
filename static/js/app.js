// static/js/app.js

/* --- Global Upload Constants --- */
const GLOBAL_MAX_FILE_SIZE_MB = 16;
const GLOBAL_MAX_TOTAL_SIZE_MB = 100; // Untuk fungsi upload banyak file
// Otomatis menghitung byte
const GLOBAL_MAX_FILE_SIZE_BYTES = GLOBAL_MAX_FILE_SIZE_MB * 1024 * 1024;
const GLOBAL_MAX_TOTAL_SIZE_BYTES = GLOBAL_MAX_TOTAL_SIZE_MB * 1024 * 1024;

/* --- Global Alert Function --- */
function alertUser(message) {
    let alertBox = document.getElementById("customAlert");
    if (!alertBox) {
        alertBox = document.createElement("div");
        alertBox.id = "customAlert";
        document.body.appendChild(alertBox);
    }
    alertBox.textContent = message;
    alertBox.classList.add("show");

    // Sembunyikan setelah 3 detik
    setTimeout(() => {
        alertBox.classList.remove("show");
    }, 3000);
}

/** * Memvalidasi ukuran file secara global.
 * @param {File} file - Objek file yang akan divalidasi.
 * @returns {boolean} - True jika valid, false jika tidak.
 */
function validateFileSize(file) {
    // Fungsi ini sekarang otomatis menggunakan konstanta global
    if (file.size > GLOBAL_MAX_FILE_SIZE_BYTES) {
        alertUser(`❌ Ukuran file terlalu besar. Batas maksimal ${GLOBAL_MAX_FILE_SIZE_MB} MB.`);
        return false;
    }
    return true;
}

/* --- Global Loading Overlay Functions --- */
function showLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('show');
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}


/* --- Doodle Parallax Script (replace the old IIFE) --- */
(function(){
    const wrap = document.querySelector('.doodle-wrap');
    if (!wrap) return;

    const svg = wrap.querySelector('svg');
    const groups = Array.from(svg.querySelectorAll('g[data-depth]')).map(g => ({
        el: g,
        depth: parseFloat(g.getAttribute('data-depth')) || 0
    })).filter(Boolean);

    // Safety: no groups => nothing to animate
    if (!groups.length) return;

    let pointer = { x: 0, y: 0 };
    let target = { x: 0, y: 0 };
    let rafId = null;
    let running = true;
    let idleTime = 0;
    let last = performance.now();

    function setPointer(clientX, clientY) {
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        target.x = (clientX / w) - 0.5;
        target.y = (clientY / h) - 0.5;
    }

    // Input listeners (passive where appropriate)
    window.addEventListener('mousemove', e => setPointer(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', e => {
        if (e.touches && e.touches[0]) {
            setPointer(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    function updateIdle(dt) {
        // dt in ms — keep the idle motion very subtle
        idleTime += dt;
        const floatX = Math.sin(idleTime * 0.00035) * 0.02;
        const floatY = Math.cos(idleTime * 0.00028) * 0.02;
        // gently nudge target with idle motion
        target.x = target.x * 0.98 + floatX * 0.02;
        target.y = target.y * 0.98 + floatY * 0.02;
    }

    function animate(now) {
        if (!running) { rafId = null; return; } // guard, shouldn't run if stopped

        const dt = Math.max(0, now - last);
        last = now;
        updateIdle(dt);

        // smooth pointer interpolation
        pointer.x += (target.x - pointer.x) * 0.12;
        pointer.y += (target.y - pointer.y) * 0.12;

        // apply transforms
        groups.forEach(g => {
            const moveX = pointer.x * (g.depth * 60);
            const moveY = pointer.y * (g.depth * 40);
            const rot = pointer.x * (g.depth * 4);
            // use translate3d to keep GPU-friendly
            g.el.style.transform = `translate3d(${moveX}px, ${moveY}px, 0) rotate(${rot}deg)`;
        });

        // schedule next frame
        rafId = requestAnimationFrame(animate);
    }

    function startAnimation() {
        if (rafId !== null) return; // already running
        running = true;
        last = performance.now();
        rafId = requestAnimationFrame(animate);
    }

    function stopAnimation() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        running = false;
    }

    // Prefer modern events: pagehide for final cleanup (replaces unload)
    window.addEventListener('pagehide', () => {
        stopAnimation();
    }, { passive: true });

    // visibilitychange to pause/resume when tab hidden (CPU & battery friendly)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            stopAnimation();
        } else if (document.visibilityState === 'visible') {
            startAnimation();
        }
    }, { passive: true });

    // Start once on load (existing behavior)
    startAnimation();
})();

/* --- Global SortableJS Helper --- */
/**
 * @param {HTMLElement} el - Elemen <ul> yang akan diurutkan.
 * @param {object} component - Instans komponen Alpine (didapat dari $data).
 */
function initGlobalSortable(el, component) {
    if (typeof Sortable === 'undefined') {
        console.error("SortableJS belum dimuat. Pastikan file-nya diimpor di HTML.");
        return;
    }
    
    new Sortable(el, {
        animation: 150,
        ghostClass: 'sortable-ghost', // Mengambil style dari global.css
        onUpdate: (evt) => {
            // 1. Buat salinan array saat ini
            let newFiles = [...component.files];

            // 2. Ambil item yang dipindahkan
            const [movedItem] = newFiles.splice(evt.oldIndex, 1);

            // 3. Masukkan ke posisi baru
            newFiles.splice(evt.newIndex, 0, movedItem);

            // --- PERBAIKAN LEBIH KUAT ---
            // 4. Kosongkan array untuk memaksa Alpine menghapus <li>
            component.files = [];

            // 5. Tunggu sesaat (agar DOM update), lalu isi kembali
            setTimeout(() => {
                component.files = newFiles;
            }, 0); // setTimeout 0 akan menjalankannya di 'tick' berikutnya
        }
    });
}