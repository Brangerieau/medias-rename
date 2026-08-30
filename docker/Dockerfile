# Image de packaging uniquement : elle ne sert pas a executer l'application.
# electronuserland/builder embarque Node, electron-builder et Wine
# (necessaire pour produire les binaires Windows depuis Linux).
# Wine n'existe qu'en x86 : l'image est forcee en amd64 et tourne en
# emulation sur les Mac Apple Silicon (plus lent, mais fonctionnel).
FROM --platform=linux/amd64 electronuserland/builder:wine

# Les caches sont montes en volumes nommes par compose.yml pour eviter
# de retelecharger les binaires Electron a chaque build.
ENV ELECTRON_CACHE=/root/.cache/electron \
    ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder

WORKDIR /app
