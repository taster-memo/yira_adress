// ============================================================
//  API — Approche "alignement linéaire"
//
//  1. On choisit une direction aléatoire θ (0–360°)
//  2. On calcule les points GPS à 380m (B) et 900m (C) de A dans cette direction
//  3. Mapbox cherche les adresses les plus proches de ces 2 points
//  4. Résultat : A → B → C alignés sur une ligne droite
// ============================================================

const Api = (() => {

  function log(...args) {
    console.log("[Generateur]", ...args);
    const dbg = document.getElementById("debugLog");
    if (dbg) {
      const line = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
      dbg.innerHTML += `<div>${line}</div>`;
      dbg.scrollTop = dbg.scrollHeight;
    }
  }

  // ---- Claude API ----
  async function callClaude(prompt) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        max_tokens: CONFIG.MAX_TOKENS,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "Erreur Claude");
    if (!d.content) throw new Error("Pas de contenu");
    return d.content.map(b => b.text || "").join("");
  }

  function extractJSON(raw) {
    try { return JSON.parse(raw.trim()); } catch (_) {}
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
    const arr = raw.match(/\[[\s\S]*\]/);
    if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
    const obj = raw.match(/\{[\s\S]*\}/);
    if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
    throw new Error("JSON introuvable");
  }

  // ---- Helpers géo ----
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000, toR = x => x * Math.PI / 180;
    const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon/2)**2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  // Calcule un point GPS à `distanceM` mètres dans la direction `bearingDeg` (0=N, 90=E)
  function destinationPoint(lat, lon, distanceM, bearingDeg) {
    const R = 6371000;
    const δ = distanceM / R;
    const θ = bearingDeg * Math.PI / 180;
    const φ1 = lat * Math.PI / 180;
    const λ1 = lon * Math.PI / 180;

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

    return { lat: φ2 * 180 / Math.PI, lon: ((λ2 * 180 / Math.PI) + 540) % 360 - 180 };
  }

  function extractStreetName(address) {
    if (!address) return "";
    return address
      .replace(/^\d+\s*(bis|ter|quater)?\s*/i, "")
      .replace(/,.*$/, "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---- Mapbox reverse geocode : trouve l'adresse réelle la plus proche d'un point GPS ----
  async function mapboxReverse(lat, lon) {
    if (!CONFIG.MAPBOX_TOKEN || CONFIG.MAPBOX_TOKEN === "VOTRE_TOKEN_MAPBOX_ICI") {
      throw new Error("Token Mapbox manquant");
    }
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json` +
                `?access_token=${CONFIG.MAPBOX_TOKEN}&country=fr&language=fr&types=address&limit=5`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.features || !data.features.length) return null;

      // Cherche le 1er résultat avec un numéro de rue
      for (const f of data.features) {
        if (!f.address) continue;
        const [flon, flat] = f.center;
        const ctx = (f.context || []).reduce((acc, c) => {
          if (c.id.startsWith("postcode")) acc.cp = c.text;
          if (c.id.startsWith("place"))    acc.ville = c.text;
          return acc;
        }, {});
        const display = `${f.address} ${f.text}, ${ctx.cp || ""} ${ctx.ville || ""}`.replace(/\s+/g, " ").trim();
        return { lat: flat, lon: flon, display };
      }
    } catch (e) {
      log("Reverse error:", e.message);
    }
    return null;
  }

  // ---- Mapbox forward geocode (pour A) ----
  async function geocode(address) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
                `?access_token=${CONFIG.MAPBOX_TOKEN}&country=fr&language=fr&limit=1`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.features && data.features.length) {
        const [lon, lat] = data.features[0].center;
        return { lat, lon };
      }
    } catch (e) {}
    return null;
  }

  // Cherche autour d'un point GPS en testant plusieurs offsets pour éviter les doublons
  async function findAddressNearPoint(targetLat, targetLon, excludedStreets, refLat, refLon, expectedDistM, tolerance) {
    const triedStreets = new Set(excludedStreets.map(s => extractStreetName(s)));

    // Essai principal + 4 offsets autour pour avoir des alternatives
    const offsets = [
      { dLat: 0, dLon: 0 },
      { dLat: 0.0007, dLon: 0 },     // ~75m N
      { dLat: -0.0007, dLon: 0 },    // ~75m S
      { dLat: 0, dLon: 0.0010 },     // ~75m E
      { dLat: 0, dLon: -0.0010 }     // ~75m O
    ];

    const results = await Promise.all(
      offsets.map(o => mapboxReverse(targetLat + o.dLat, targetLon + o.dLon).catch(() => null))
    );

    // Filtre rues exclues + valide la distance
    const valid = [];
    for (const r of results) {
      if (!r) continue;
      const street = extractStreetName(r.display);
      if (triedStreets.has(street)) continue;

      const distFromRef = haversine(refLat, refLon, r.lat, r.lon);
      const distPied = Math.round(distFromRef * 1.35);
      const diffFromExpected = Math.abs(distPied - expectedDistM);

      if (diffFromExpected > tolerance) continue;

      valid.push({ ...r, distFromRef, distPied, score: diffFromExpected });
    }

    // Garde le candidat dont la distance est la plus proche de l'attendu
    valid.sort((a, b) => a.score - b.score);
    return valid[0] || null;
  }

  // ---- Mode Simple : 1 adresse à 300–500m à pied de A ----
  async function getSimpleAddress(originInput, originLat, originLon, excluded) {
    // Plage 300–500m à pied = ~280m vol d'oiseau (milieu)
    const targetCrowM = 290;
    const directions = [];
    // 8 directions cardinales en ordre aléatoire
    const baseDirs = [0, 45, 90, 135, 180, 225, 270, 315];
    baseDirs.sort(() => Math.random() - 0.5);

    for (const dir of baseDirs) {
      const target = destinationPoint(originLat, originLon, targetCrowM, dir);
      const result = await findAddressNearPoint(
        target.lat, target.lon,
        [originInput, ...excluded],
        originLat, originLon,
        400, // distance attendue à pied
        200  // tolérance ±200m
      );
      if (result) {
        log(`✓ Simple trouvé direction ${dir}°: ${result.display} à ${result.distPied}m`);
        return {
          adresse: result.display,
          lat: result.lat, lon: result.lon,
          dist_pied_m: result.distPied,
          duree_min: Math.max(1, Math.round(result.distPied / 75)),
          dist_source: "estimation"
        };
      }
    }
    throw new Error("Aucune adresse trouvée. Réessayez.");
  }

  // ---- Mode Multiple : A → B (380m) → C (900m) sur la même ligne ----
  async function getMultipleAddresses(originInput, originLat, originLon, excluded) {
    const A = {
      adresse: originInput, lat: originLat, lon: originLon,
      dist_pied_m: 0, duree_min: 0, dist_source: "origin"
    };

    // Choisit une direction aléatoire et essaie. Si échec, on essaie une autre direction.
    const allDirs = [0, 45, 90, 135, 180, 225, 270, 315];
    allDirs.sort(() => Math.random() - 0.5);

    for (const baseDir of allDirs) {
      log(`=== Tentative direction ${baseDir}° ===`);

      // Point B : à 290m vol d'oiseau (~ 380m à pied) dans cette direction
      const targetB = destinationPoint(originLat, originLon, 290, baseDir);
      // Point C : à 670m vol d'oiseau (~ 900m à pied) dans la même direction
      const targetC = destinationPoint(originLat, originLon, 670, baseDir);

      // Cherche B et C en parallèle (gain de temps !)
      const [B_result, C_result] = await Promise.all([
        findAddressNearPoint(targetB.lat, targetB.lon, [originInput, ...excluded],
                             originLat, originLon, 400, 200),
        findAddressNearPoint(targetC.lat, targetC.lon, [originInput, ...excluded],
                             originLat, originLon, 900, 250)
      ]);

      if (!B_result || !C_result) {
        log(`✗ Échec direction ${baseDir}° (B=${!!B_result}, C=${!!C_result})`);
        continue;
      }

      // Vérifie que B et C sont dans des rues différentes
      if (extractStreetName(B_result.display) === extractStreetName(C_result.display)) {
        log(`✗ B et C dans la même rue`);
        continue;
      }

      log(`✓ Succès direction ${baseDir}° : B=${B_result.distPied}m, C=${C_result.distPied}m`);

      const B = {
        adresse: B_result.display, lat: B_result.lat, lon: B_result.lon,
        dist_pied_m: B_result.distPied,
        duree_min: Math.max(1, Math.round(B_result.distPied / 75)),
        dist_source: "estimation"
      };

      const C = {
        adresse: C_result.display, lat: C_result.lat, lon: C_result.lon,
        dist_pied_m: C_result.distPied,
        duree_min: Math.max(1, Math.round(C_result.distPied / 75)),
        dist_from_other_m: C_result.distPied,
        dist_source: "estimation"
      };

      return [A, B, C];
    }

    throw new Error("Impossible de trouver B et C alignés. Réessayez.");
  }

  return { geocode, getSimpleAddress, getMultipleAddresses };
})();
