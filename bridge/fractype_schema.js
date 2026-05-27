/** Canonical FracType schema — Node.js mirror of fractype_schema.py */

const Scale = Object.freeze({
    SMALL: "small",
    NORMAL: "normal",
    LARGE: "large",
});

class FracNode {
    /**
     * @param {string} top
     * @param {string} bottom
     * @param {string} [title=""]
     * @param {string} [scale="normal"]
     * @param {string} [colorHint="nominal"]
     */
    constructor(top, bottom, title = "", scale = Scale.NORMAL, colorHint = "nominal") {
        this.top = top;
        this.bottom = bottom;
        this.title = title;
        this.scale = scale;
        this.colorHint = colorHint;
    }

    toReact() {
        return `<VinculumTypography top="${this.top}" bottom="${this.bottom}" scale="${this.scale}" />`;
    }

    toLaTeX() {
        return `\\compressTwo{${this.top}}{${this.bottom}}`;
    }

    toTerminalLines() {
        const width = Math.max(this.top.length, this.bottom.length, this.title.length) + 2;
        const lines = [];
        if (this.title) lines.push(`[${this.title}]`);
        lines.push(this.top.padStart(Math.floor((width + this.top.length) / 2)).padEnd(width));
        lines.push("─".repeat(width));
        lines.push(this.bottom.padStart(Math.floor((width + this.bottom.length) / 2)).padEnd(width));
        return lines;
    }

    static fromShorthand(raw) {
        const idx = raw.indexOf("/");
        if (idx === -1) throw new Error(`Invalid FracType shorthand: ${raw}`);
        return new FracNode(raw.substring(0, idx).trim(), raw.substring(idx + 1).trim());
    }
}

/** Multi-fraction container — renders compact aligned vinculum blocks. */
class FracTable {
    /**
     * @param {FracNode[]} nodes
     */
    constructor(nodes = []) {
        this.nodes = nodes;
    }

    /**
     * Parse multi-line block: one 'Top / Bottom' fraction per non-empty line.
     * @param {string} text
     * @returns {FracTable}
     */
    static fromBlock(text) {
        const nodes = [];
        for (const line of text.trim().split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            nodes.push(FracNode.fromShorthand(trimmed));
        }
        if (nodes.length === 0) throw new Error(`No valid FracType shorthands in block: ${text}`);
        return new FracTable(nodes);
    }

    get _colWidth() {
        let maxW = 0;
        for (const n of this.nodes) {
            maxW = Math.max(maxW, n.top.length, n.bottom.length);
        }
        return maxW + 2;
    }

    // ── terminal: stacked, aligned vinculum bars ──
    toTerminalLines() {
        const w = this._colWidth;
        const lines = [];
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (i > 0) lines.push("");  // blank separator
            if (node.title) lines.push(`[${node.title}]`);
            lines.push(node.top.padStart(Math.floor((w + node.top.length) / 2)).padEnd(w));
            lines.push("─".repeat(w));
            lines.push(node.bottom.padStart(Math.floor((w + node.bottom.length) / 2)).padEnd(w));
        }
        return lines;
    }

    // ── terminal: side-by-side table (horizontal compression) ──
    toTerminalTable() {
        const w = this._colWidth;
        const tops = this.nodes.map(n => n.top.padStart(Math.floor((w + n.top.length) / 2)).padEnd(w));
        const bars = this.nodes.map(() => "─".repeat(w));
        const bottoms = this.nodes.map(n => n.bottom.padStart(Math.floor((w + n.bottom.length) / 2)).padEnd(w));
        const sep = " │ ";
        return [
            tops.join(sep),
            bars.join(sep),
            bottoms.join(sep),
        ];
    }

    // ── React: fragment-wrapped VinculumTypography group ──
    toReact() {
        const inner = this.nodes
            .map(n => `  <VinculumTypography top="${n.top}" bottom="${n.bottom}" scale="${n.scale}" />`)
            .join("\n");
        return `<>\n${inner}\n</>`;
    }

    // ── LaTeX: compact-stacked \compressTwo with reduced line spacing ──
    toLaTeX() {
        return this.nodes
            .map(n => `\\compressTwo{${n.top}}{${n.bottom}}`)
            .join("\\\\[2pt]\n");
    }
}

module.exports = { FracNode, FracTable, Scale };
