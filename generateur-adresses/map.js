// ============================================================
//  MAP — Gestion de la carte Leaflet
// ============================================================

const MapManager = (() => {
  let leafletMap = null;
  let markers = [];

  const COLORS = {
    A: { pin: "#378ADD", bg: "#E6F1FB", txt: "#0C447C" },
    B: { pin: "#1D9E75", bg: "#E1F5EE", txt: "#085041" },
    C: { pin: "#BA7517", bg: "#FAEEDA", txt: "#633806" }
  };

  function pinIcon(letter) {
    const c = COLORS[letter];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <path d="M17 1C9.82 1 4 6.82 4 14c0 9.5 13 27 13 27S30 23.5 30 14C30 6.82 24.18 1 17 1z" fill="${c.pin}"/>
      <circle cx="17" cy="14" r="9" fill="white"/>
      <text x="17" y="19" text-anchor="middle" font-size="11" font-weight="700" fill="${c.pin}" font-family="sans-serif">${letter}</text>
    </svg>`;
    return L.divIcon({ html: svg, className: "", iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -44] });
  }

  function originIcon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <circle cx="10" cy="10" r="8" fill="#E24B4A" opacity=".25"/>
      <circle cx="10" cy="10" r="5" fill="#E24B4A"/>
      <circle cx="10" cy="10" r="2" fill="white"/>
    </svg>`;
    return L.divIcon({ html: svg, className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
  }

  function init(lat, lon) {
    // 1. Détruire l'ancienne carte AVANT de toucher au DOM
    if (leafletMap) {
      leafletMap.off();
      leafletMap.remove();
      leafletMap = null;
    }
    markers = [];

    // 2. Recréer un conteneur frais
    document.getElementById("mapContainer").innerHTML = '<div id="map"></div>';

    // 3. Initialiser la nouvelle carte
    leafletMap = L.map("map", { zoomControl: true, scrollWheelZoom: false }).setView([lat, lon], 15);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(leafletMap);

    // 4. Force le recalcul de la taille (utile après recréation du DOM)
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 50);
  }

  function addOrigin(lat, lon, label) {
    L.marker([lat, lon], { icon: originIcon() })
      .addTo(leafletMap)
      .bindPopup(`<b>Recherche depuis</b><br>${label}`);
  }

  function addResult(lat, lon, letter, address, distPied, dureeMin) {
    const distLabel = (distPied && distPied > 0)
      ? `${distPied} m à pied · ${dureeMin} min`
      : "Adresse de base";
    const m = L.marker([lat, lon], { icon: pinIcon(letter) })
      .addTo(leafletMap)
      .bindPopup(`<b>${letter}</b> — ${distLabel}<br><span style="font-size:12px">${address}</span>`);
    markers.push(m);
  }

  function addChainLine(points) {
    L.polyline(points, { color: "#378ADD", weight: 2, dashArray: "5,7", opacity: 0.65 }).addTo(leafletMap);
  }

  function fitBounds(points) {
    if (points.length > 1) leafletMap.fitBounds(points, { padding: [45, 45] });
    else if (points.length === 1) leafletMap.setView(points[0], 15);
  }

  function focusMarker(i) {
    if (markers[i]) {
      markers[i].openPopup();
      leafletMap.panTo(markers[i].getLatLng(), { animate: true });
    }
  }

  function getColors() { return COLORS; }

  return { init, addOrigin, addResult, addChainLine, fitBounds, focusMarker, getColors };
})();

function focusMarker(i) {
  document.querySelectorAll(".addr-card").forEach((c, j) => c.classList.toggle("active", i === j));
  MapManager.focusMarker(i);
}
