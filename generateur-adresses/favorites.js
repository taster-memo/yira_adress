// ============================================================
//  FAVORITES — Bibliothèque d'adresses de base sauvegardées
// ============================================================

const Favorites = (() => {
  const STORAGE_KEY = "generateur_adresses_favorites";

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch (e) { return []; }
  }

  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
    catch (e) {}
  }

  function getAll() { return load(); }

  function add(label, address) {
    const list = load();
    // Évite les doublons
    if (list.some(f => f.address.toLowerCase().trim() === address.toLowerCase().trim())) return false;
    list.push({ label: label || address, address, createdAt: Date.now() });
    save(list);
    render();
    return true;
  }

  function remove(idx) {
    const list = load();
    list.splice(idx, 1);
    save(list);
    render();
  }

  function render() {
    const container = document.getElementById("favoritesList");
    if (!container) return;
    const list = load();
    if (list.length === 0) {
      container.innerHTML = `<div class="favorites-empty">Aucune adresse enregistrée. Cliquez sur ⭐ pour sauvegarder l'adresse en cours.</div>`;
      return;
    }
    container.innerHTML = list.map((f, i) => `
      <div class="favorite-chip">
        <button class="favorite-use" onclick="useFavorite(${i})" title="Utiliser cette adresse">
          <span class="fav-label">${f.label}</span>
          <span class="fav-address">${f.address}</span>
        </button>
        <button class="favorite-del" onclick="deleteFavorite(${i})" title="Supprimer">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      </div>
    `).join("");
  }

  return { getAll, add, remove, render, load };
})();

// API globale pour les onclick HTML
window.useFavorite = function(idx) {
  const f = Favorites.load()[idx];
  if (f) {
    document.getElementById("addressInput").value = f.address;
    document.getElementById("addressInput").focus();
  }
};

window.deleteFavorite = function(idx) {
  if (confirm("Supprimer cette adresse de la bibliothèque ?")) {
    Favorites.remove(idx);
  }
};

window.saveCurrentAsFavorite = function() {
  const addr = document.getElementById("addressInput").value.trim();
  if (!addr) {
    alert("Tapez d'abord une adresse à sauvegarder.");
    return;
  }
  const label = prompt("Nom court pour cette adresse (ex: 'Maison', 'Bureau') :", addr.split(",")[0]);
  if (label === null) return;
  if (Favorites.add(label.trim() || addr, addr)) {
    const btn = document.getElementById("saveFavBtn");
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.5l-4.5 2.4.9-5L.8 6.2l5-.7L8 1z"/></svg> Enregistré !`;
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }
  } else {
    alert("Cette adresse est déjà dans vos favoris.");
  }
};
