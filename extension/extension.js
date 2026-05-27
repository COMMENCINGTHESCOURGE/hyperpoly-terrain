const vscode = require('vscode');
const { FracNode, FracTable } = require('../../bridge/fractype_schema.js');

// ── single-fraction parser: split on first / only ──
function parseFracInput(text) {
    const normalized = text.replace(/\r?\n/g, ' ').trim();
    const slashIndex = normalized.indexOf('/');
    if (slashIndex === -1) return null;
    const top = normalized.substring(0, slashIndex).trim();
    const bottom = normalized.substring(slashIndex + 1).trim();
    if (!top || !bottom) return null;
    return { top, bottom };
}

// ── multi-line detector: returns FracTable if ≥2 non-empty lines each parse as fraction ──
function tryParseBlock(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    try {
        return FracTable.fromBlock(text);
    } catch {
        return null;
    }
}

// ── shared processor: route single vs. multi-line to correct builder ──
function processSelections(editor, buildSingle, buildBlock) {
    let anyProcessed = false;
    editor.edit(editBuilder => {
        for (const selection of editor.selections) {
            const text = editor.document.getText(selection);
            // try multi-line block first
            const block = tryParseBlock(text);
            if (block) {
                editBuilder.replace(selection, buildBlock(block));
                anyProcessed = true;
                continue;
            }
            // fall through to single-fraction
            const parsed = parseFracInput(text);
            if (parsed) {
                editBuilder.replace(selection, buildSingle(parsed));
                anyProcessed = true;
            }
        }
    });
    return anyProcessed;
}

// ── single-fraction builders ──
function buildReact({ top, bottom }) {
    return `<VinculumTypography top="${top}" bottom="${bottom}" scale="normal" />`;
}

function buildLaTeX({ top, bottom }) {
    return `\\compressTwo{${top}}{${bottom}}`;
}

// ── multi-fraction block builders ──
function buildReactBlock(table) {
    return table.toReact();
}

function buildLaTeXBlock(table) {
    return table.toLaTeX();
}

function activate(context) {
    // Command 1: React wrap
    const cmdReact = vscode.commands.registerCommand('fractype.wrapReact', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const ok = processSelections(editor, buildReact, buildReactBlock);
        if (!ok) vscode.window.showWarningMessage('FracType: No valid "TOP / BOTTOM" selection found.');
    });

    // Command 2: LaTeX wrap
    const cmdLaTeX = vscode.commands.registerCommand('fractype.wrapLaTeX', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const ok = processSelections(editor, buildLaTeX, buildLaTeXBlock);
        if (!ok) vscode.window.showWarningMessage('FracType: No valid "TOP / BOTTOM" selection found.');
    });

    // Command 3: Language-aware auto-wrap
    const isJSX = (langId) => ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'].includes(langId);
    const isTex = (langId) => ['latex', 'tex', 'bibtex'].includes(langId);

    const cmdAuto = vscode.commands.registerCommand('fractype.wrapAuto', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const langId = editor.document.languageId;
        if (isJSX(langId)) {
            processSelections(editor, buildReact, buildReactBlock);
        } else if (isTex(langId)) {
            processSelections(editor, buildLaTeX, buildLaTeXBlock);
        } else {
            vscode.window.showQuickPick(['React <VinculumTypography>', 'LaTeX \\compressTwo'])
                .then(choice => {
                    if (!choice) return;
                    const [single, block] = choice.startsWith('React')
                        ? [buildReact, buildReactBlock]
                        : [buildLaTeX, buildLaTeXBlock];
                    processSelections(editor, single, block);
                });
        }
    });

    context.subscriptions.push(cmdReact, cmdLaTeX, cmdAuto);
}

function deactivate() {}

module.exports = { activate, deactivate };
