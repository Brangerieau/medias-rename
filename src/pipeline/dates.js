// Les dates EXIF arrivent au format "AAAA:MM:JJ HH:MM:SS", parfois suffixees
// d'un fuseau ou de sous-secondes que l'on ignore.
const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

const parseExifDate = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const match = EXIF_DATE.exec(value.trim());

    if (match === null) {
        return null;
    }

    const [, year, month, day, hours, minutes, seconds] = match;

    // Une date EXIF est une heure locale sans fuseau : on la reconstruit telle
    // quelle, sans conversion, pour que le nom de dossier corresponde a la
    // prise de vue et non au fuseau de la machine.
    const date = new Date(
        Number(year), Number(month) - 1, Number(day),
        Number(hours), Number(minutes), Number(seconds),
    );

    // exiftool rend "0000:00:00 00:00:00" quand le tag existe mais est vide, et
    // Date() accepte sans broncher un 31 fevrier en le decalant : on verifie
    // donc que les composants ressortent identiques.
    const consistent = date.getFullYear() === Number(year)
        && date.getMonth() === Number(month) - 1
        && date.getDate() === Number(day);

    if (Number.isNaN(date.getTime()) || !consistent || date.getFullYear() < 1900) {
        return null;
    }

    return date;
};

const pad = (value, length = 2) => String(value).padStart(length, '0');

const tokens = (date) => ({
    '%Y': String(date.getFullYear()),
    '%m': pad(date.getMonth() + 1),
    '%d': pad(date.getDate()),
    '%H': pad(date.getHours()),
    '%M': pad(date.getMinutes()),
    '%S': pad(date.getSeconds()),
});

const formatPattern = (pattern, date) => {
    const table = tokens(date);

    return pattern.replace(/%[YmdHMS%]/g, (token) => (token === '%%' ? '%' : table[token] ?? token));
};

const FOLDER_PATTERNS = {
    'jour DDMM': 'jour %d%m',
    'YYYY/MM': '%Y/%m',
    'YYYY-MM-DD': '%Y-%m-%d',
};

const FILE_PATTERNS = {
    HHhMMminSSs: '%Hh%Mmin%Ss',
    'YYYYMMDD-HHMMSS': '%Y%m%d-%H%M%S',
};

const folderNameFor = ({ folderPattern, folderCustom }, date) => {
    if (folderPattern === 'none') {
        return '';
    }

    const pattern = folderPattern === 'custom' ? folderCustom : FOLDER_PATTERNS[folderPattern];

    return pattern ? formatPattern(pattern, date) : '';
};

const baseNameFor = ({ filePattern, fileCustom }, date, originalBaseName) => {
    if (filePattern === 'keep') {
        return originalBaseName;
    }

    const pattern = filePattern === 'custom' ? fileCustom : FILE_PATTERNS[filePattern];

    return pattern ? formatPattern(pattern, date) : originalBaseName;
};

// Windows refuse \ / : * ? " < > | dans un nom, ainsi que les points et
// espaces finaux ; macOS refuse les deux-points. On assainit sur toutes les
// plateformes pour qu'un dossier trie reste transferable entre systemes.
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const sanitizeSegment = (segment) => {
    const cleaned = segment.replace(ILLEGAL, '_').replace(/[. ]+$/, '').trim();

    if (cleaned === '' || cleaned === '.' || cleaned === '..') {
        return '_';
    }

    return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
};

// Un modele de dossier peut contenir des separateurs volontaires (AAAA/MM) :
// on assainit chaque niveau sans toucher a la hierarchie.
const sanitizePath = (value) => value
    .split(/[\\/]+/)
    .filter((segment) => segment !== '')
    .map(sanitizeSegment)
    .join('/');

module.exports = { parseExifDate, formatPattern, folderNameFor, baseNameFor, sanitizeSegment, sanitizePath };
