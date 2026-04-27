# Générateur d'adresses

Application web légère pour générer des adresses françaises à distance précise d'un point de départ.

## Configuration (2 minutes)

Avant utilisation, configurez **2 clés API** dans `config.js` :

### 1. Clé Anthropic (Claude)
- Inscrivez-vous sur https://console.anthropic.com/
- Créez une clé API (commence par `sk-ant-...`)
- Remplacez `VOTRE_CLE_API_ICI` dans `config.js`

### 2. Token Mapbox (géocodage exact)
- Inscrivez-vous **GRATUITEMENT** sur https://account.mapbox.com/auth/signup/
- Allez sur https://account.mapbox.com/access-tokens/
- Copiez votre **Default public token** (commence par `pk.eyJ...`)
- Remplacez `VOTRE_TOKEN_MAPBOX_ICI` dans `config.js`

> 💡 Mapbox offre **100 000 requêtes gratuites par mois** — largement suffisant pour cet outil.

## Installation

1. Configurez `config.js` (voir ci-dessus)
2. Déposez le dossier `generateur-adresses/` dans votre `/www`
3. Accédez à `http://votre-domaine/generateur-adresses/`

## Modes

| Mode | Distance | Résultat |
|------|----------|----------|
| **Simple** | 300–500 m à pied | 1 adresse |
| **Multiple A→B→C** | 800–1000 m par étape | 3 adresses en chaîne |

## Architecture

- **Claude** génère des noms d'adresses françaises plausibles
- **Mapbox Geocoding** convertit chaque nom en coordonnées GPS exactes (avec validation du numéro de rue)
- **Mapbox Directions** calcule la vraie distance piétonne sur le réseau de rues
- **Validation** : si la distance n'est pas dans la plage (300–500m ou 800–1000m), Claude propose d'autres candidats

## Anti-doublons

Toutes les adresses générées sont mémorisées dans le `localStorage` du navigateur. Le bouton "Effacer l'historique" remet à zéro.
