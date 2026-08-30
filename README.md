# Médias Rename

Application de bureau (Electron) qui trie et renomme des photos et des vidéos
à partir de leurs métadonnées, avec conversion HEIC intégrée.

Elle lit la date de prise de vue via **ExifTool**, range chaque fichier dans un
dossier daté et le renomme selon un modèle configurable — le tout en une seule
passe, avec un mode simulation activé par défaut.

---

## Sommaire

- [Installer l'application (utilisateur)](#installer-lapplication-utilisateur)
- [Installer le projet (développement)](#installer-le-projet-développement)
- [Utiliser l'application](#utiliser-lapplication)
- [Structure du projet](#structure-du-projet)
- [Icône](#icône)
- [Packager en local](#packager-en-local)
- [Publier une release](#publier-une-release)
- [Licence](#licence)

---

## Installer l'application (utilisateur)

Aucun prérequis : les binaires sont autonomes. ExifTool est embarqué dans
l'application, il n'y a rien à installer à côté.

1. Aller sur la page [Releases](https://github.com/Brangerieau/medias-rename/releases).
2. Télécharger le fichier correspondant à son système :

| Système | Fichier | Installation |
| --- | --- | --- |
| macOS (Intel et Apple Silicon) | `Médias Rename-x.y.z.dmg` | Ouvrir le `.dmg`, glisser l'app dans **Applications** |
| Windows | `Médias Rename Setup x.y.z.exe` | Lancer l'installeur NSIS |
| Linux (universel) | `Médias Rename-x.y.z.AppImage` | `chmod +x` puis exécuter |
| Linux (Debian / Ubuntu) | `medias-rename_x.y.z_amd64.deb` | `sudo dpkg -i medias-rename_*.deb` |

### Premier lancement

Les binaires ne sont **pas signés** (pas de certificat Developer ID ni de
signature Authenticode) — le système affiche donc un avertissement au premier
lancement.

- **macOS** : clic droit sur l'application → *Ouvrir* → *Ouvrir*. Si le message
  « l'application est endommagée » apparaît, lever la mise en quarantaine :

  ```bash
  xattr -dr com.apple.quarantine "/Applications/Médias Rename.app"
  ```

- **Windows** : SmartScreen affiche « Windows a protégé votre ordinateur » →
  *Informations complémentaires* → *Exécuter quand même*.

---

## Installer le projet (développement)

### Prérequis

| Outil | Version | Remarque |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | **24.x** | Version utilisée par la CI |
| npm | 11.x | Fourni avec Node 24 |
| Git | — | |
| Docker *(optionnel)* | — | Uniquement pour packager Linux et Windows depuis macOS |

ExifTool n'a pas à être installé : le paquet `exiftool-vendored` embarque le
binaire adapté à la plateforme (l'exécutable autonome sous Windows, le script
Perl sous macOS et Linux). De même, la conversion HEIC passe par `heic-convert`,
qui utilise libheif compilé en WebAssembly — aucune dépendance native.

### Mise en place

```bash
git clone git@github.com:Brangerieau/medias-rename.git
cd medias-rename
npm install          # ou : make install
```

### Lancer l'application

```bash
npm start            # ou : make start
```

### Commandes disponibles

```bash
make help            # liste toutes les cibles
```

| Commande | Effet |
| --- | --- |
| `make install` | Installe les dépendances sur l'hôte |
| `make start` | Lance l'application |
| `make build-mac` | Package le `.dmg` (nécessite un hôte macOS) |
| `make build-linux` | Package `.AppImage` et `.deb` via Docker |
| `make build-win` | Package l'installeur `.exe` via Docker (hôte amd64) |
| `make build-win-zip` | Package Windows en `.zip` (fonctionne sur Apple Silicon) |
| `make image` | Construit l'image Docker de packaging |
| `make terminal` | Ouvre un shell dans le conteneur de packaging |
| `make clean` | Supprime `dist/` et les volumes Docker |

Le `Makefile` charge `.env` et `.env.local` s'ils existent. `PROJECT_NAME` y
définit le nom de projet Docker Compose :

```bash
cp .env.dist .env
# puis remplacer __PROJECT_NAME__ par medias-rename
```

---

## Utiliser l'application

L'interface se lit de haut en bas, en cinq étapes.

**1 · Source** — le dossier à traiter, les types de fichiers retenus (images :
`jpg, jpeg, png, heic, heif, tiff` ; vidéos : `mp4, avi, mov, mkv, wmv`), la
récursion dans les sous-dossiers, et d'éventuelles extensions additionnelles.

**2 · Conversion** — convertit les HEIC en PNG ou JPEG au passage. Le fichier
converti est classé et renommé comme les autres, en une seule passe. On choisit
le sort de l'original (conservé à côté, laissé en place, ou supprimé), le report
des métadonnées EXIF, et l'ignorance des HEIC déjà convertis.

**3 · Date de référence** — l'ordre de priorité des tags interrogés :
`DateTimeOriginal`, puis `MediaCreateDate`, puis `CreateDate`, et en dernier
recours la date de modification du fichier. Les fichiers sans date exploitable
sont soit laissés en place, soit regroupés dans un dossier « sans date ».

**4 · Renommage** — le modèle de nom des dossiers (`jour DDMM`, `AAAA/MM`,
`AAAA-MM-JJ`, aucun, ou personnalisé) et des fichiers (`HHhMMminSSs`,
`AAAAMMJJ-HHMMSS`, nom d'origine conservé, ou personnalisé), plus la stratégie
en cas de doublon (compteur `-1`, `-2`… / ignorer / écraser).

Les modèles personnalisés acceptent les jetons suivants :

| Jeton | Valeur | Jeton | Valeur |
| --- | --- | --- | --- |
| `%Y` | année (4 chiffres) | `%H` | heures |
| `%m` | mois | `%M` | minutes |
| `%d` | jour | `%S` | secondes |
| `%%` | un `%` littéral | | |

Un modèle de dossier peut contenir des `/` pour créer une hiérarchie
(`%Y/%m` → `2026/08`). Chaque segment est assaini pour rester valide sur macOS,
Windows et Linux.

**5 · Destination** — soit une réorganisation dans le dossier source, soit une
copie vers un autre dossier (la source reste intacte). Option de suppression des
dossiers devenus vides à la fin.

> **Simulation.** La case *Simulation* en bas est **cochée par défaut** : aucun
> fichier n'est touché, la console liste ce qui serait fait. Toujours lancer une
> simulation avant un traitement réel, en particulier avec la suppression des
> originaux HEIC ou l'écrasement des doublons, qui sont irréversibles.

---

## Structure du projet

```
src/
├── main.js              Processus principal Electron : fenêtre, dialogues, IPC
├── preload.js           Pont contextuel exposé au renderer (window.mediasRename)
├── index.html           Interface
├── renderer.js          Collecte des options, affichage de la progression
├── styles.css
└── pipeline/
    ├── run.js           Orchestration : lecture des dates, nommage, déplacement
    ├── scan.js          Parcours du dossier source, filtrage par extension
    ├── dates.js         Analyse des dates EXIF, modèles de nommage, assainissement
    └── tools.js         Résolution et appel du binaire ExifTool embarqué

build/                   Ressources de packaging, hors bundle applicatif
├── icon.svg             Source vectorielle de l'icône
├── icon.png             1024×1024 — Linux, et source des conversions
├── icon.icns            macOS, 10 résolutions de 16 à 1024 px
└── icon.ico             Windows, 7 tailles de 16 à 256 px

docker/Dockerfile        Image de packaging Linux / Windows (avec Wine)
compose.yml              Service « builder » pour les builds cross-plateformes
.github/workflows/       CI de release
Makefile
```

Le traitement tourne entièrement dans le processus principal ; le renderer ne
fait que composer un objet d'options et afficher les événements reçus
(`start`, `progress`, `log`, `done`).

---

## Icône

L'icône est dessinée en SVG dans [`build/icon.svg`](build/icon.svg) : une
pellicule perforée dont la fenêtre centrale porte un cadran, les deux moitiés
du produit — des médias, une date.

Le fichier suit la grille macOS : canevas de 1024 px, tuile de 824 px centrée
(100 px de marge) au rayon de 185 px. C'est **la seule source à modifier** ; les
trois formats binaires en dérivent.

### Régénérer les formats

Nécessite `librsvg` et `iconutil` (fourni avec macOS) :

```bash
brew install librsvg
```

**PNG 1024 — Linux, et source des autres conversions :**

```bash
rsvg-convert -w 1024 -h 1024 build/icon.svg -o build/icon.png
```

**ICNS — macOS.** Chaque résolution est rendue depuis le SVG plutôt que réduite
depuis le PNG : les traits fins restent nets aux petites tailles.

```bash
ICONSET=$(mktemp -d)/icon.iconset && mkdir -p "$ICONSET"
for spec in 16:icon_16x16 32:icon_16x16@2x 32:icon_32x32 64:icon_32x32@2x \
            128:icon_128x128 256:icon_128x128@2x 256:icon_256x256 \
            512:icon_256x256@2x 512:icon_512x512 1024:icon_512x512@2x; do
  rsvg-convert -w "${spec%%:*}" -h "${spec%%:*}" build/icon.svg \
    -o "$ICONSET/${spec#*:}.png"
done
iconutil -c icns "$ICONSET" -o build/icon.icns
```

**ICO — Windows.** Produit par le convertisseur d'electron-builder, qui génère
les 7 tailles attendues (16 à 256 px) :

```bash
node -e "
require('./node_modules/app-builder-lib/out/util/iconConverter.js').convertIcon({
  sources: ['build/icon.png'], fallbackSources: [], roots: [process.cwd()],
  format: 'ico', outDir: 'build',
}).then(r => console.log(r.icons));
"
```

> Les trois fichiers dérivés sont **versionnés** : la CI n'a donc ni conversion
> à faire ni toolset à télécharger. Après toute retouche du SVG, régénérer les
> trois et les commiter ensemble.

---

## Packager en local

### macOS

Le `.dmg` ne peut être produit que depuis un hôte macOS :

```bash
make build-mac
```

### Linux et Windows

Via le conteneur de packaging (image `electronuserland/builder:wine`) :

```bash
make image           # une seule fois
make build-linux
make build-win
```

> **Apple Silicon.** L'image est forcée en `linux/amd64` car Wine n'existe qu'en
> x86, et tourne donc en émulation QEMU. L'installeur NSIS demande à Wine
> d'exécuter le setup généré, ce qui crashe sous cette émulation (pages mémoire
> de 16 Ko). Sur un Mac ARM, utiliser `make build-win-zip`, ou laisser la CI
> produire le `.exe`.

Les artefacts sortent dans `dist/`.

---

## Publier une release

La release est entièrement automatisée : **pousser un tag `v*` suffit**.

Le workflow [`.github/workflows/release.yml`](.github/workflows/release.yml)
construit les binaires macOS (x64 + arm64), Linux et Windows en parallèle, puis
crée — ou met à jour — une release GitHub portant le nom du tag, avec des notes
générées automatiquement.

### Procédure

```bash
# 1. Le travail est commité et poussé sur main
git status
git push origin main

# 2. Créer le tag
git tag v1.0.0

# 3. Le pousser — c'est ce push qui déclenche la CI
git push origin v1.0.0
```

Suivre ensuite l'avancement dans l'onglet **Actions** du dépôt. Une fois les
trois jobs de build terminés, la release apparaît dans **Releases** avec les
`.dmg`, `.AppImage`, `.deb` et `.exe` attachés.

### Points à connaître

- **La version n'a pas à être modifiée à la main.** Le workflow exécute
  `npm pkg set version="${GITHUB_REF_NAME#v}"` avant le packaging : le numéro de
  version des binaires est déduit du tag. Le champ `version` de `package.json`
  reste néanmoins la référence côté dépôt, autant le garder synchronisé.
- **Le tag doit commencer par `v`** — le déclencheur est `tags: ['v*']`.
- **Aucune signature de code.** `CSC_IDENTITY_AUTO_DISCOVERY: false` désactive
  la signature macOS, faute de certificat Developer ID. Les utilisateurs devront
  contourner Gatekeeper ou SmartScreen (voir
  [Premier lancement](#premier-lancement)).
- **`fail-fast: false`** : si une plateforme échoue, les deux autres vont au
  bout et la release est publiée avec ce qui a réussi. Il suffit de corriger
  puis de repousser le tag — le job de release détecte la release existante et
  y téléverse les fichiers avec `--clobber`.

### Rejouer un tag existant

```bash
git tag -f v1.0.0            # déplace le tag sur le commit courant
git push --force-with-lease origin refs/tags/v1.0.0
```

Attention : cela réécrit un tag déjà publié. À réserver à une release dont les
binaires n'ont pas encore été diffusés.

---

## Licence

MIT — Thibaud Brangerieau
