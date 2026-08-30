const fs = require('node:fs/promises');
const path = require('node:path');

const heicConvert = require('heic-convert');

const { runExiftool } = require('./tools');
const { parseExifDate, folderNameFor, baseNameFor, sanitizePath, sanitizeSegment } = require('./dates');
const { scan, extensionsFor, extensionOf } = require('./scan');

const NO_DATE_FOLDER = 'sans date';
const EXIFTOOL_BATCH = 200;

/* ------------------------------------------------------------------ */
/* Lecture des dates                                                  */
/* ------------------------------------------------------------------ */

const TAG_BY_OPTION = {
    original: 'DateTimeOriginal',
    media: 'MediaCreateDate',
    create: 'CreateDate',
};

// Un seul appel exiftool par lot : l'invoquer fichier par fichier coute
// ~40 ms de demarrage de l'interpreteur Perl a chaque fois.
const readDates = async (files, dateTags) => {
    const tags = Object.entries(TAG_BY_OPTION)
        .filter(([option]) => dateTags[option])
        .map(([, tag]) => tag);

    const wanted = [...tags, 'FileModifyDate'];
    const byFile = new Map();

    for (let index = 0; index < files.length; index += EXIFTOOL_BATCH) {
        const chunk = files.slice(index, index + EXIFTOOL_BATCH);
        const args = ['-json', '-charset', 'filename=utf8', ...wanted.map((tag) => `-${tag}`), ...chunk];
        const stdout = await runExiftool(args, { tolerant: true });

        let parsed;

        try {
            parsed = JSON.parse(stdout);
        } catch {
            parsed = [];
        }

        for (const entry of parsed) {
            byFile.set(path.resolve(entry.SourceFile), entry);
        }
    }

    return (file) => {
        const entry = byFile.get(path.resolve(file)) ?? {};

        for (const tag of tags) {
            const date = parseExifDate(entry[tag]);

            if (date !== null) {
                return { date, source: tag };
            }
        }

        if (dateTags.mtime) {
            const date = parseExifDate(entry.FileModifyDate);

            if (date !== null) {
                return { date, source: 'FileModifyDate' };
            }
        }

        return { date: null, source: null };
    };
};

/* ------------------------------------------------------------------ */
/* Nommage et collisions                                              */
/* ------------------------------------------------------------------ */

const exists = async (target) => {
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
};

// `planned` retient les chemins deja attribues pendant cette passe : sans lui,
// deux photos prises la meme seconde viseraient le meme nom en simulation,
// ou la seconde ecraserait la premiere.
//
// `self` est le fichier en cours de traitement : il ne doit pas se considerer
// lui-meme comme un obstacle, sinon une seconde passe sur un dossier deja trie
// renommerait en boucle chaque fichier en -1, -2, -3.
const resolveCollision = async (directory, base, extension, collision, registry, self) => {
    const candidate = (suffix) => path.join(directory, `${base}${suffix}.${extension}`);
    const isSelf = (target) => self !== undefined && path.resolve(target) === path.resolve(self);
    const taken = async (target) => !isSelf(target) && (registry.planned.has(target) || await exists(target));

    const first = candidate('');

    if (!await taken(first)) {
        return first;
    }

    if (collision === 'overwrite') {
        return first;
    }

    if (collision === 'skip') {
        return null;
    }

    // Une rafale produit des dizaines de photos a la meme seconde, donc au meme
    // nom. Reprendre le compteur la ou il en etait evite de re-tester -1, -2, -3…
    // depuis le debut a chaque fichier, ce qui serait quadratique.
    const key = `${directory}\u0000${base}\u0000${extension}`;
    let counter = registry.counters.get(key) ?? 1;

    for (; counter < 100000; counter += 1) {
        const next = candidate(`-${counter}`);

        if (!await taken(next)) {
            registry.counters.set(key, counter + 1);
            return next;
        }
    }

    return null;
};

/* ------------------------------------------------------------------ */
/* Operations sur les fichiers                                        */
/* ------------------------------------------------------------------ */

const transfer = async (from, to, mode) => {
    if (mode === 'copy') {
        await fs.copyFile(from, to);
        return;
    }

    try {
        await fs.rename(from, to);
    } catch (error) {
        // Un rename ne franchit pas une frontiere de volume : on recopie.
        if (error.code !== 'EXDEV') {
            throw error;
        }

        await fs.copyFile(from, to);
        await fs.unlink(from);
    }
};

// heic-convert decode via libheif compile en WebAssembly et reencode en JS pur :
// aucun binaire natif, donc le meme code tourne sur macOS, Windows et Linux.
const convert = async (from, to, { format, quality }) => {
    const buffer = await fs.readFile(from);

    const decoded = await heicConvert({
        buffer,
        format: format === 'jpeg' ? 'JPEG' : 'PNG',
        // heic-convert attend une qualite entre 0 et 1, l'interface expose 1 a 100.
        quality: quality / 100,
    });

    await fs.writeFile(to, Buffer.from(decoded));
};

const copyMetadata = async (from, to) => {
    await runExiftool(['-TagsFromFile', from, '-all:all', '-overwrite_original', to], { tolerant: true });
};

/* ------------------------------------------------------------------ */
/* Nettoyage                                                          */
/* ------------------------------------------------------------------ */

const pruneEmptyDirectories = async (root) => {
    let removed = 0;

    const walk = async (directory) => {
        let entries;

        try {
            entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
            return false;
        }

        let empty = true;

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const childRemoved = await walk(path.join(directory, entry.name));
                empty = empty && childRemoved;
            } else {
                empty = false;
            }
        }

        // La racine n'est jamais supprimee, meme vide.
        if (empty && directory !== root) {
            try {
                await fs.rmdir(directory);
                removed += 1;
                return true;
            } catch {
                return false;
            }
        }

        return false;
    };

    await walk(root);
    return removed;
};

/* ------------------------------------------------------------------ */
/* Orchestration                                                      */
/* ------------------------------------------------------------------ */

const runPipeline = async (options, { onEvent, shouldStop = () => false } = {}) => {
    const emit = (level, message) => onEvent?.({ kind: 'log', level, message });
    const summary = { total: 0, processed: 0, converted: 0, skipped: 0, failed: 0, pruned: 0 };

    const root = options.source;
    const destinationRoot = options.mode === 'copy' ? options.target : root;

    const files = await scan(root, {
        recursive: options.recursive,
        extensions: extensionsFor(options),
        // En mode copie vers un sous-dossier de la source, on evite de relire
        // ce qui vient d'etre ecrit.
        exclude: options.mode === 'copy' ? [destinationRoot] : [],
    });

    summary.total = files.length;
    onEvent?.({ kind: 'start', total: files.length });
    emit('info', `${files.length} fichier(s) trouvé(s).`);

    if (files.length === 0) {
        onEvent?.({ kind: 'done', summary });
        return summary;
    }

    emit('muted', 'Lecture des métadonnées…');
    const dateOf = await readDates(files, options.dateTags);

    const registry = { planned: new Set(), counters: new Map() };
    const convertibles = new Set(options.convert.enabled ? ['heic', 'heif'] : []);
    const targetExtension = options.convert.format === 'jpeg' ? 'jpg' : options.convert.format;

    let index = 0;

    for (const file of files) {
        if (shouldStop()) {
            emit('warn', 'Interrompu.');
            break;
        }

        index += 1;
        onEvent?.({ kind: 'progress', current: index, total: files.length });

        const label = path.relative(root, file) || path.basename(file);
        const extension = extensionOf(file);
        const willConvert = convertibles.has(extension);

        try {
            const { date } = dateOf(file);

            if (date === null && options.noDate === 'skip') {
                emit('warn', `Aucune date — laissé en place : ${label}`);
                summary.skipped += 1;
                continue;
            }

            const originalBase = path.basename(file, path.extname(file));

            const folder = date === null
                ? NO_DATE_FOLDER
                : sanitizePath(folderNameFor(options, date));
            const base = date === null
                ? sanitizeSegment(originalBase)
                : sanitizeSegment(baseNameFor(options, date, originalBase));

            const directory = path.join(destinationRoot, folder);
            const extensionOut = willConvert ? targetExtension : extension;

            // Un HEIC deja converti a cote de lui : on le laisse tranquille.
            if (willConvert && options.convert.skipExisting) {
                const sibling = path.join(path.dirname(file), `${originalBase}.${targetExtension}`);

                if (await exists(sibling)) {
                    emit('muted', `Déjà converti — ignoré : ${label}`);
                    summary.skipped += 1;
                    continue;
                }
            }

            const destination = await resolveCollision(directory, base, extensionOut, options.collision, registry, file);

            if (destination === null) {
                emit('warn', `Doublon — ignoré : ${label}`);
                summary.skipped += 1;
                continue;
            }

            if (path.resolve(destination) === path.resolve(file)) {
                emit('muted', `Déjà en place : ${label}`);
                summary.skipped += 1;
                continue;
            }

            registry.planned.add(destination);

            const arrow = path.relative(destinationRoot, destination);

            if (options.dryRun) {
                const verb = willConvert ? 'convertirait' : (options.mode === 'copy' ? 'copierait' : 'déplacerait');
                emit('info', `${verb} : ${label} → ${arrow}`);
                summary.processed += 1;
                summary.converted += willConvert ? 1 : 0;
                continue;
            }

            await fs.mkdir(directory, { recursive: true });

            if (willConvert) {
                await convert(file, destination, options.convert);

                if (options.convert.keepExif) {
                    await copyMetadata(file, destination);
                }

                if (options.convert.original === 'delete') {
                    await fs.unlink(file);
                } else if (options.convert.original === 'beside') {
                    const kept = await resolveCollision(directory, base, extension, options.collision, registry, file);

                    if (kept !== null) {
                        registry.planned.add(kept);
                        await transfer(file, kept, options.mode);
                    }
                }

                summary.converted += 1;
            } else {
                await transfer(file, destination, options.mode);
            }

            emit('info', `${label} → ${arrow}`);
            summary.processed += 1;
        } catch (error) {
            emit('error', `Échec sur ${label} : ${error.message}`);
            summary.failed += 1;
        }
    }

    if (options.prune && options.mode === 'move' && !options.dryRun && !shouldStop()) {
        summary.pruned = await pruneEmptyDirectories(root);

        if (summary.pruned > 0) {
            emit('muted', `${summary.pruned} dossier(s) vide(s) supprimé(s).`);
        }
    }

    onEvent?.({ kind: 'done', summary });
    return summary;
};

module.exports = { runPipeline };
