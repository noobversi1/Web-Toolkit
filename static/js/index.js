// static/js/index.js
// Versi: simple + highlight options
// Modes: "random" | "daily" | "per_user" | "weighted"
const TOOL_HIGHLIGHT_MODE = "daily"; // ganti sesuai kebutuhan
const PER_USER_DAYS = 3; // kalau mode "per_user", simpan selama X hari

// OPTIONAL: bobot untuk mode "weighted". Key = teks unik tool (misal path atau title).
// Jika tidak mau weighted, kosongkan object.
const WEIGHTS = {
  // contoh: '/convert-image': 3, 'Perbesar Gambar': 5
};

// Utility: ambil elemen grid
function getToolGrid() {
  // sesuai struktur index.html: .grid adalah container
  return document.querySelector('.grid.grid-cols-1') || document.querySelector('.grid');
}

// Fisher–Yates shuffle (in-place) — reliable
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pilih indeks deterministik dari string seed (simple hash)
function seededIndex(seed, n) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % n;
}

// Dapatkan "id" unik per card — prioritas: data-tool-id, href, text
function getCardId(card) {
  if (card.dataset && card.dataset.toolId) return card.dataset.toolId;
  const a = card.querySelector('a') || card;
  if (a && a.getAttribute && a.getAttribute('href')) return a.getAttribute('href');
  return card.innerText.slice(0, 60).replace(/\s+/g, ' ').trim();
}

// Weighted random selection based on WEIGHTS map
function weightedPick(cards) {
  // build weight array
  const items = [];
  cards.forEach(card => {
    const id = getCardId(card);
    const w = Math.max(1, (WEIGHTS[id] || WEIGHTS[card.querySelector('h2')?.innerText] || 1));
    for (let i = 0; i < w; i++) items.push(card);
  });
  if (items.length === 0) return null;
  const pick = items[Math.floor(Math.random() * items.length)];
  return pick;
}

// Core: place highlight on top depending mode, then append rest (shuffled)
function arrangeTools() {
  const grid = getToolGrid();
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.feature-card'));

  if (cards.length <= 1) return;

  let highlightCard = null;

  if (TOOL_HIGHLIGHT_MODE === "random") {
    // no special highlight, just shuffle
    const shuffled = shuffleArray(cards.slice());
    shuffled.forEach(c => grid.appendChild(c));
    return;
  }

  if (TOOL_HIGHLIGHT_MODE === "daily") {
    // deterministic by date (YYYY-MM-DD)
    const today = new Date();
    const seed = today.getFullYear() + "-" + (today.getMonth()+1) + "-" + today.getDate();
    const idx = seededIndex(seed, cards.length);
    highlightCard = cards[idx];
  } else if (TOOL_HIGHLIGHT_MODE === "per_user") {
    // try localStorage first
    try {
      const key = "wt:highlight";
      const raw = localStorage.getItem(key);
      if (raw) {
        const obj = JSON.parse(raw);
        const expiry = new Date(obj.expiry);
        if (new Date() < expiry) {
          const existing = cards.find(c => getCardId(c) === obj.id);
          if (existing) highlightCard = existing;
        }
      }
      if (!highlightCard) {
        // pick random and save
        const pick = cards[Math.floor(Math.random() * cards.length)];
        const id = getCardId(pick);
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + PER_USER_DAYS);
        localStorage.setItem(key, JSON.stringify({ id, expiry: expiry.toISOString() }));
        highlightCard = pick;
      }
    } catch (e) {
      // fallback to random if localStorage error
      highlightCard = cards[Math.floor(Math.random() * cards.length)];
    }
  } else if (TOOL_HIGHLIGHT_MODE === "weighted") {
    highlightCard = weightedPick(cards) || cards[Math.floor(Math.random() * cards.length)];
  } else {
    // default fallback: random
    highlightCard = cards[Math.floor(Math.random() * cards.length)];
  }

  // if we have a highlightCard, style it and put on top
  if (highlightCard) {
    // add class for styling (you can style .tool-highlight in CSS)
    highlightCard.classList.add('tool-highlight');
    // Optionally add a badge
    if (!highlightCard.querySelector('.tool-badge')) {
      const badge = document.createElement('div');
      badge.className = 'tool-badge absolute top-3 left-3 bg-yellow-300 text-xs font-semibold px-2 py-1 rounded';
      badge.innerText = 'Tool Hari Ini';
      badge.style.pointerEvents = 'none';
      // ensure card is positioned relatively
      highlightCard.style.position = 'relative';
      highlightCard.appendChild(badge);
    }
  }

  // prepare remaining cards without the highlighted
  const rest = cards.filter(c => c !== highlightCard);
  shuffleArray(rest);

  // append highlight first (if exists), then rest
  if (highlightCard) grid.appendChild(highlightCard);
  rest.forEach(c => grid.appendChild(c));
}

// Keep search function (if it's inline in template, this is safe; otherwise re-declare)
function filterToolsFromIndex(query) {
  const q = (query || document.getElementById('toolSearch')?.value || '').toLowerCase();
  const cards = document.querySelectorAll('.feature-card');
  cards.forEach(card => {
    const text = card.innerText.toLowerCase();
    card.style.display = text.includes(q) ? "block" : "none";
  });
}

// initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    arrangeTools();
  } catch (e) {
    console.error('arrangeTools error', e);
  }

  // rebind search if needed (if template already had filterTools function, fine)
  const search = document.getElementById('toolSearch');
  if (search) {
    search.removeEventListener('input', window._wt_search_handler);
    const handler = () => filterToolsFromIndex();
    window._wt_search_handler = handler;
    search.addEventListener('input', handler);
  }
});
