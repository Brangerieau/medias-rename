const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { exiftoolPath } = require('exiftool-vendored');

const execFileAsync = promisify(execFile);

// exiftool-vendored embarque le binaire adapte a la plateforme courante :
// le .exe autonome sous Windows, le script Perl sous macOS et Linux. Plus
// besoin de compter sur une installation systeme ni de sonder le PATH.
let binary = null;

const resolveExiftool = async () => {
    if (binary === null) {
        binary = await exiftoolPath();
    }

    return binary;
};

// exiftool renvoie un code de sortie non nul des qu'un seul fichier pose
// probleme, meme si les autres ont ete lus : on garde alors sa sortie.
const runExiftool = async (args, { tolerant = false } = {}) => {
    try {
        const { stdout } = await execFileAsync(await resolveExiftool(), args, {
            maxBuffer: 64 * 1024 * 1024,
            windowsHide: true,
        });

        return stdout;
    } catch (error) {
        if (tolerant && typeof error.stdout === 'string' && error.stdout !== '') {
            return error.stdout;
        }

        throw error;
    }
};

module.exports = { resolveExiftool, runExiftool };
