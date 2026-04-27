// ============================================================
//  APP — Logique principale, rendu UI, gestion des modes
// ============================================================

let mode = "simple";
const STOPS = ["A", "B", "C"];

// ---- Copier en 1 clic ----
function copyAddress(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l4 4 6-7"/></svg> Copié !`;
    btn.style.color = "#1D9E75";
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; }, 1800);
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l4 4 6-7"/></svg> Copié !`;
    btn.style.color = "#1D9E75";
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; }, 1800);
  });
}

function copyBtn(address) {
  const esc = address.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  return `<button class="btn-copy" onclick="copyAddress('${esc}', this)">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7">
      <rect x="5" y="2" width="9" height="11" rx="2"/><path d="M11 2V1a1 1 0 0 0-1-1H3a2 2 0 0 0-2 2v10a1 1 0 0 0 1 1h1"/>
    </svg>
    Copier
  </button>`;
}

// Lien Maps par adresse textuelle (plus fiable que les coords)
function mapsLink(originAddr, destAddr, label) {
  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originAddr)}&destination=${encodeURIComponent(destAddr)}&travelmode=walking`;
  return `<a class="maps-link" href="${url}" target="_blank">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L8 8"/></svg>
    ${label || "Maps"}
  </a>`;
}

// Lien Maps avec waypoint (A→B→C)
function mapsLinkWaypoint(originAddr, waypointAddr, destAddr, label) {
  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originAddr)}&waypoints=${encodeURIComponent(waypointAddr)}&destination=${encodeURIComponent(destAddr)}&travelmode=walking`;
  return `<a class="maps-link" href="${url}" target="_blank">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L8 8"/></svg>
    ${label || "Maps A→B→C"}
  </a>`;
}

// ---- Mode switch ----
function setMode(m) {
  mode = m;
  document.getElementById("tab-simple").classList.toggle("active", m === "simple");
  document.getElementById("tab-multiple").classList.toggle("active", m === "multiple");
  updateHint();
  document.getElementById("output").innerHTML = "";
  document.getElementById("mapContainer").innerHTML =
    '<div class="map-placeholder"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".3"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>La carte apparaîtra après génération</div>';
}

function updateHint() {
  document.getElementById("modeHint").innerHTML = mode === "simple"
    ? "Génère <b>1 adresse</b> à <b>300–500 m à pied</b> depuis votre départ. Jamais deux fois la même."
    : "<b>A</b> (base) → <b>B</b> (mid, ~450 m de A) → <b>C</b> (éloignée, ~940 m de A) sur une ligne droite";
}

function setStatus(out, msg) {
  out.innerHTML = `<div class="status-row"><span class="spinner"></span>${msg}</div>`;
}

// ---- Generate ----
async function generate() {
  const input = document.getElementById("addressInput").value.trim();
  if (!input) return;

  if (CONFIG.ANTHROPIC_API_KEY === "VOTRE_CLE_API_ICI") {
    document.getElementById("output").innerHTML =
      `<div class="error-box">Clé Anthropic manquante — ouvrez <code>config.js</code> et remplacez <b>VOTRE_CLE_API_ICI</b> par votre clé (sur <a href="https://console.anthropic.com/" target="_blank">console.anthropic.com</a>).</div>`;
    return;
  }
  if (CONFIG.MAPBOX_TOKEN === "VOTRE_TOKEN_MAPBOX_ICI") {
    document.getElementById("output").innerHTML =
      `<div class="error-box">Token Mapbox manquant — ouvrez <code>config.js</code> et ajoutez votre token Mapbox (gratuit sur <a href="https://account.mapbox.com/auth/signup/" target="_blank">mapbox.com</a>, 100k requêtes/mois).</div>`;
    return;
  }

  const btn = document.getElementById("genBtn");
  btn.disabled = true;
  const out = document.getElementById("output");

  // Reset debug log
  const dbg = document.getElementById("debugLog");
  if (dbg) dbg.innerHTML = "";

  try {
    setStatus(out, "Géocodage de l'adresse de départ…");
    const originGeo = await Api.geocode(input);
    if (!originGeo) throw new Error("Adresse de départ introuvable. Précisez le numéro, la rue et la ville.");

    const excluded = History.getAll();

    if (mode === "simple") {
      await generateSimple(input, originGeo.lat, originGeo.lon, excluded, out);
    } else {
      await generateMultiple(input, originGeo.lat, originGeo.lon, excluded, out);
    }
  } catch (e) {
    out.innerHTML = `<div class="error-box">Erreur : ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    History.updateUI();
  }
}

// ---- Simple ----
async function generateSimple(input, oLat, oLon, excluded, out) {
  setStatus(out, "Recherche d'une adresse à 300–500 m à pied…");
  const r = await Api.getSimpleAddress(input, oLat, oLon, excluded);

  const COLORS = MapManager.getColors();
  const c = COLORS["A"];

  MapManager.init(oLat, oLon, 15);
  MapManager.addOrigin(oLat, oLon, input);
  MapManager.addResult(r.lat, r.lon, "A", r.adresse, r.dist_pied_m, r.duree_min);
  MapManager.fitBounds([[oLat, oLon], [r.lat, r.lon]]);
  History.add(r.adresse);

  const estim = r.dist_source === "estimation" ? " <span style='font-size:11px;opacity:.6'>(estimé)</span>" : "";

  out.innerHTML = `
    <div class="origin-tag"><span class="origin-dot"></span>Départ : ${input}</div>
    <div class="cards-grid single">
      <div class="addr-card single-card active" onclick="focusMarker(0)">
        <div class="pin pin-large" style="background:${c.bg};color:${c.txt}">A</div>
        <div class="single-info">
          <div class="single-big-dist">${r.dist_pied_m} m${estim}</div>
          <div class="single-big-label">à pied · ${r.duree_min} min de marche</div>
          <div class="card-address">${r.adresse}</div>
          <div class="card-actions">
            ${copyBtn(r.adresse)}
            ${mapsLink(input, r.adresse, "Maps")}
          </div>
        </div>
      </div>
    </div>
    <div class="footer-row"><button class="btn-regen" onclick="generate()">↻ Regénérer</button></div>`;
}

// ---- Multiple ----
async function generateMultiple(input, oLat, oLon, excluded, out) {
  setStatus(out, "Génération de B puis C…");
  const results = await Api.getMultipleAddresses(input, oLat, oLon, excluded);

  const COLORS = MapManager.getColors();
  MapManager.init(oLat, oLon, 15);
  MapManager.addOrigin(oLat, oLon, input);

  const pts = [];
  results.forEach((r, i) => {
    MapManager.addResult(r.lat, r.lon, STOPS[i], r.adresse, r.dist_pied_m, r.duree_min);
    pts.push([r.lat, r.lon]);
  });
  MapManager.addChainLine([[oLat, oLon], ...pts]);
  MapManager.fitBounds([[oLat, oLon], ...pts]);
  History.addMany(results.slice(1).map(r => r.adresse));

  // Chain bar
  let chainHtml = `<div class="chain-row">
    <span class="chain-stop">
      <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#E24B4A;margin-right:3px;flex-shrink:0"></span>
      Origine
    </span>`;
  results.forEach((r, i) => {
    const c = COLORS[STOPS[i]];
    const estim = (r.dist_source === "estimation" && r.dist_pied_m > 0) ? "~" : "";
    const distLabel = r.dist_pied_m > 0 ? `${estim}${r.dist_pied_m} m` : "0 m";
    chainHtml += `
      <span class="chain-arr">──${distLabel}──›</span>
      <span class="chain-stop">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c.pin};margin-right:3px;flex-shrink:0"></span>
        ${STOPS[i]}
      </span>`;
  });
  chainHtml += "</div>";

  const chainLabels = ["A (base)", "B (mid)", "C (éloignée)"];
  let cardsHtml = '<div class="cards-grid triple">';
  results.forEach((r, i) => {
    const letter = STOPS[i];
    const c = COLORS[letter];
    const isOrigin = i === 0;
    const estim = r.dist_source === "estimation" ? "~" : "";

    // Lien Maps : toujours depuis A (texte), B comme waypoint pour C
    let mapsBtnHtml = "";
    if (i === 1) {
      // B : A → B (adresses textuelles)
      mapsBtnHtml = mapsLink(input, r.adresse, "Maps A→B");
    } else if (i === 2) {
      // C : A → B → C (waypoint B en texte)
      mapsBtnHtml = mapsLinkWaypoint(input, results[1].adresse, r.adresse, "Maps A→B→C");
    }

    let distInfo = isOrigin
      ? `<span class="pill pill-origin">Adresse de base</span>`
      : `<span class="pill pill-crow">${estim}${r.dist_pied_m} m à pied</span>
         <span class="pill pill-time-walk">${r.duree_min} min</span>`;

    cardsHtml += `
      <div class="addr-card${isOrigin ? " card-origin" : ""}" onclick="focusMarker(${i})">
        <div class="card-top">
          <div class="pin" style="background:${c.bg};color:${c.txt}">${letter}</div>
          <span class="card-label">${chainLabels[i]}</span>
        </div>
        <div class="card-address">${r.adresse}</div>
        <div class="card-meta">${distInfo}</div>
        <div class="card-actions">
          ${copyBtn(r.adresse)}
          ${mapsBtnHtml}
        </div>
      </div>`;
  });
  cardsHtml += "</div>";

  out.innerHTML = `${chainHtml}${cardsHtml}
    <div class="footer-row"><button class="btn-regen" onclick="generate()">↻ Regénérer</button></div>`;
}

function focusMarker(i) {
  document.querySelectorAll(".addr-card").forEach((c, j) => c.classList.toggle("active", i === j));
  MapManager.focusMarker(i);
}

document.addEventListener("DOMContentLoaded", () => {
  updateHint();
  History.updateUI();
  Favorites.render();
  document.getElementById("addressInput").addEventListener("keydown", e => {
    if (e.key === "Enter") generate();
  });
});
