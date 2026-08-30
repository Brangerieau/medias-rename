const fs = require('node:fs/promises');
const path = require('node:path');

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'tiff', 'tif'];
const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'mkv', 'wmv'];

const extensionsFor = ({ types, extraExtensions }) => {
    const wanted = [
        ...(types.images ? IMAGE_EXTENSIONS : []),
        ...(types.videos ? VIDEO_EXTENSIONS : []),
        ...extraExtensions,
    ];

    return new Set(wanted.map((extension) => extension.replace(/^\./, '').toLowerCase()).filter(Boolean));
};

const extensionOf = (file) => path.extname(file).replace(/^\./, '').toLowerCase();

// Parcours iteratif : une pile plutot qu'une recursion, pour ne pas exploser
// sur une arborescence tres profonde.
const scan = async (root, { recursive, extensions, exclude = [] }) => {
    const excluded = new Set(exclude.filter(Boolean).map((directory) => path.resolve(directory)));
    const found = [];
    const pending = [root];

    while (pending.length > 0) {
        const directory = pending.pop();
        let entries;

        try {
            entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const full = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                if (recursive && !excluded.has(path.resolve(full))) {
                    pending.push(full);
                }
                continue;
            }

            if (entry.isFile() && extensions.has(extensionOf(entry.name))) {
                found.push(full);
            }
        }
    }

    return found.sort();
};

module.exports = { scan, extensionsFor, extensionOf, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS };
