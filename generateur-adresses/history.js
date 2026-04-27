// ============================================================
//  HISTORY — Stockage des adresses déjà générées (localStorage)
//  Garantit qu'aucune adresse n'est proposée deux fois.
// ============================================================

const History = (() => {
  const STORAGE_KEY = "generateur_adresses_history";

  function normalize(address) {
    return address
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function getAll() {
    return load();
  }

  function has(address) {
    const norm = normalize(address);
    return load().some(entry => normalize(entry) === norm);
  }

  function add(address) {
    if (has(address)) return;
    const list = load();
    list.push(address);
    save(list);
    updateUI();
  }

  function addMany(addresses) {
    const list = load();
    addresses.forEach(addr => {
      const norm = normalize(addr);
      if (!list.some(e => normalize(e) === norm)) {
        list.push(addr);
      }
    });
    save(list);
    updateUI();
  }

  function clear() {
    save([]);
    updateUI();
  }

  function count() {
    return load().length;
  }

  function updateUI() {
    const bar = document.getElementById("historyBar");
    const cnt = document.getElementById("historyCount");
    const n = count();
    if (bar) bar.style.display = n > 0 ? "flex" : "none";
    if (cnt) cnt.textContent = n;
  }

  // Expose pour le HTML
  window.clearHistory = () => {
    clear();
  };

  return { has, add, addMany, clear, count, getAll, updateUI, normalize };
})();
