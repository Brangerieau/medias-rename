const consoleElement = document.getElementById('console');
const progress = document.getElementById('progress');
const runButton = document.getElementById('run');
const dryRun = document.getElementById('dry-run');
const source = document.getElementById('source');

const MAX_LINES = 2000;

const log = (message, level = 'info') => {
    const line = document.createElement('p');
    line.className = `console__line${level === 'info' ? '' : ` console__line--${level}`}`;
    line.textContent = message;
    consoleElement.append(line);

    // Un dossier de plusieurs milliers de photos noierait le DOM.
    while (consoleElement.childElementCount > MAX_LINES) {
        consoleElement.firstElementChild.remove();
    }

    consoleElement.scrollTop = consoleElement.scrollHeight;
};

const clearConsole = () => {
    consoleElement.replaceChildren();
};

const toggle = (element, visible) => element.classList.toggle('is-hidden', !visible);

const field = (id) => document.getElementById(id);
const value = (id) => field(id).value;
const checked = (id) => field(id).checked;

/* ------------------------------------------------------------------ */
/* Selecteurs de dossier                                              */
/* ------------------------------------------------------------------ */

for (const button of document.querySelectorAll('[data-pick]')) {
    button.addEventListener('click', async () => {
        const target = field(button.dataset.pick);
        const directory = await window.mediasRename.pickDirectory('Choisir un dossier');

        if (directory !== null) {
            target.value = directory;
            target.dispatchEvent(new Event('change'));
        }
    });
}

/* ------------------------------------------------------------------ */
/* Affichage conditionnel                                             */
/* ------------------------------------------------------------------ */

const convertEnabled = field('convert-enabled');
const convertOptions = field('convert-options');

convertEnabled.addEventListener('change', () => toggle(convertOptions, convertEnabled.checked));

const convertFormat = field('convert-format');
const convertQualityRow = field('convert-quality-row');
const convertQuality = field('convert-quality');

const syncConvertFormat = () => toggle(convertQualityRow, convertFormat.value === 'jpeg');

convertFormat.addEventListener('change', syncConvertFormat);
convertQuality.addEventListener('input', () => {
    field('convert-quality-value').textContent = convertQuality.value;
});
syncConvertFormat();

const convertOriginal = field('convert-original');

convertOriginal.addEventListener('change', () => {
    toggle(field('convert-original-warning'), convertOriginal.value === 'delete');
});

// Un <select> dont l'option "custom" revele son champ libre.
for (const select of document.querySelectorAll('select[data-custom]')) {
    const custom = field(select.dataset.custom);
    const sync = () => toggle(custom, select.value === 'custom');

    select.addEventListener('change', sync);
    sync();
}

const targetRow = field('target-row');

for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () => toggle(targetRow, radio.value === 'copy' && radio.checked));
}

/* ------------------------------------------------------------------ */
/* Options                                                            */
/* ------------------------------------------------------------------ */

const collectOptions = () => ({
    source: value('source'),
    recursive: checked('recursive'),
    types: { images: checked('type-images'), videos: checked('type-videos') },
    extraExtensions: value('extra-extensions').split(',').map((item) => item.trim()).filter(Boolean),
    convert: {
        enabled: checked('convert-enabled'),
        format: value('convert-format'),
        quality: Number(value('convert-quality')),
        original: value('convert-original'),
        keepExif: checked('convert-keep-exif'),
        skipExisting: checked('convert-skip-existing'),
    },
    dateTags: {
        original: checked('tag-original'),
        media: checked('tag-media'),
        create: checked('tag-create'),
        mtime: checked('tag-mtime'),
    },
    noDate: value('no-date'),
    folderPattern: value('folder-pattern'),
    folderCustom: value('folder-custom'),
    filePattern: value('file-pattern'),
    fileCustom: value('file-custom'),
    collision: value('collision'),
    mode: document.querySelector('input[name="mode"]:checked').value,
    target: value('target'),
    prune: checked('prune'),
    dryRun: checked('dry-run'),
});

const problemsWith = (options) => {
    const problems = [];

    if (options.source === '') {
        problems.push('Choisis un dossier source.');
    }

    if (options.mode === 'copy' && options.target === '') {
        problems.push('Choisis un dossier de sortie, ou repasse en mode « réorganiser dans le dossier source ».');
    }

    if (!options.types.images && !options.types.videos && options.extraExtensions.length === 0) {
        problems.push('Aucun type de fichier sélectionné.');
    }

    if (!Object.values(options.dateTags).some(Boolean)) {
        problems.push('Aucune source de date sélectionnée.');
    }

    if (options.folderPattern === 'custom' && options.folderCustom.trim() === '') {
        problems.push('Le modèle de dossier personnalisé est vide.');
    }

    if (options.filePattern === 'custom' && options.fileCustom.trim() === '') {
        problems.push('Le modèle de nom de fichier personnalisé est vide.');
    }

    return problems;
};

/* ------------------------------------------------------------------ */
/* Execution                                                          */
/* ------------------------------------------------------------------ */

let busy = false;

const setBusy = (state) => {
    busy = state;

    for (const control of document.querySelectorAll('.content input, .content select, .content button, #dry-run')) {
        control.disabled = state;
    }

    runButton.disabled = false;
    runButton.textContent = state ? 'Arrêter' : (dryRun.checked ? 'Simuler' : 'Lancer');
    runButton.classList.toggle('button--danger', state);

    if (!state) {
        progress.textContent = '';
    }
};

const syncRunButton = () => {
    if (busy) {
        return;
    }

    runButton.disabled = source.value === '';
    runButton.textContent = dryRun.checked ? 'Simuler' : 'Lancer';
};

source.addEventListener('change', syncRunButton);
dryRun.addEventListener('change', syncRunButton);

window.mediasRename.onEvent((event) => {
    if (event.kind === 'log') {
        log(event.message, event.level);
        return;
    }

    if (event.kind === 'progress') {
        progress.textContent = `${event.current} / ${event.total}`;
        return;
    }

    if (event.kind === 'done') {
        const { processed, converted, skipped, failed } = event.summary;
        const parts = [`${processed} traité(s)`];

        if (converted > 0) parts.push(`${converted} converti(s)`);
        if (skipped > 0) parts.push(`${skipped} ignoré(s)`);
        if (failed > 0) parts.push(`${failed} en échec`);

        log(`Terminé — ${parts.join(', ')}.`, failed > 0 ? 'warn' : 'muted');
    }
});

runButton.addEventListener('click', async () => {
    if (busy) {
        window.mediasRename.cancel();
        log('Arrêt demandé…', 'warn');
        return;
    }

    const options = collectOptions();
    const problems = problemsWith(options);

    if (problems.length > 0) {
        clearConsole();
        for (const problem of problems) {
            log(problem, 'error');
        }
        return;
    }

    clearConsole();
    log(options.dryRun ? 'Simulation — aucun fichier ne sera modifié.' : 'Traitement réel.', 'muted');

    setBusy(true);

    try {
        await window.mediasRename.run(options);
    } catch (error) {
        log(`Erreur : ${error.message}`, 'error');
    } finally {
        setBusy(false);
    }
});

syncRunButton();
