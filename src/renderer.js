const consoleElement = document.getElementById('console');

const log = (message, modifier = '') => {
    const line = document.createElement('p');
    line.className = `console__line${modifier ? ` console__line--${modifier}` : ''}`;
    line.textContent = message;
    consoleElement.append(line);
    consoleElement.scrollTop = consoleElement.scrollHeight;
};

const toggle = (element, visible) => element.classList.toggle('is-hidden', !visible);

/* ------------------------------------------------------------------ */
/* Selecteurs de dossier                                              */
/* ------------------------------------------------------------------ */

for (const button of document.querySelectorAll('[data-pick]')) {
    button.addEventListener('click', async () => {
        const target = document.getElementById(button.dataset.pick);
        const directory = await window.mediasRename.pickDirectory('Choisir un dossier');

        if (directory !== null) {
            target.value = directory;
            target.dispatchEvent(new Event('change'));
        }
    });
}

/* ------------------------------------------------------------------ */
/* Conversion                                                         */
/* ------------------------------------------------------------------ */

const convertEnabled = document.getElementById('convert-enabled');
const convertOptions = document.getElementById('convert-options');

convertEnabled.addEventListener('change', () => toggle(convertOptions, convertEnabled.checked));

const convertFormat = document.getElementById('convert-format');
const convertQualityRow = document.getElementById('convert-quality-row');
const convertQuality = document.getElementById('convert-quality');
const convertQualityValue = document.getElementById('convert-quality-value');

const syncConvertFormat = () => toggle(convertQualityRow, convertFormat.value === 'jpeg');

convertFormat.addEventListener('change', syncConvertFormat);
convertQuality.addEventListener('input', () => {
    convertQualityValue.textContent = convertQuality.value;
});

const convertOriginal = document.getElementById('convert-original');
const convertOriginalWarning = document.getElementById('convert-original-warning');

convertOriginal.addEventListener('change', () => {
    toggle(convertOriginalWarning, convertOriginal.value === 'delete');
});

syncConvertFormat();

/* ------------------------------------------------------------------ */
/* Renommage et destination                                           */
/* ------------------------------------------------------------------ */

// Un <select> dont l'option "custom" revele son champ libre.
for (const select of document.querySelectorAll('select[data-custom]')) {
    const field = document.getElementById(select.dataset.custom);
    const sync = () => toggle(field, select.value === 'custom');

    select.addEventListener('change', sync);
    sync();
}

const targetRow = document.getElementById('target-row');

for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () => toggle(targetRow, radio.value === 'copy' && radio.checked));
}

/* ------------------------------------------------------------------ */
/* Lancement                                                          */
/* ------------------------------------------------------------------ */

const source = document.getElementById('source');
const dryRun = document.getElementById('dry-run');
const runButton = document.getElementById('run');

const syncRunButton = () => {
    runButton.disabled = source.value === '';
    runButton.textContent = dryRun.checked ? 'Simuler' : 'Lancer';
};

source.addEventListener('change', syncRunButton);
dryRun.addEventListener('change', syncRunButton);

runButton.addEventListener('click', () => {
    log(`Tri par date — ${source.value}`);
    log(
        convertEnabled.checked
            ? `Conversion HEIC vers ${convertFormat.value.toUpperCase()} incluse dans la passe.`
            : 'Conversion HEIC desactivee.',
        'muted',
    );
    log(dryRun.checked ? 'Mode simulation actif.' : 'Mode reel.', 'muted');
    log("Traitement non encore implemente : seule l'interface est en place.", 'warn');
});

syncRunButton();
