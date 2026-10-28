// ═══════════════════════════════════════════════════════════════════════════
// RetoPA — Markdown → HTML para las páginas legales (2026-10-28).
//
// Seguro por construcción: TODO el texto se escapa antes de aplicar el formato,
// así que un <script>, un <img onerror> o un atributo inyectado salen como texto.
// Los únicos tags que existen en la salida son los que genera este archivo.
// Links: solo http(s), mailto, rutas relativas (/…) y anclas (#…).
//
// Soporta lo que usan Términos y Privacidad: ## títulos (id automático o {#id}),
// párrafos, listas (- y 1.), tablas |a|b|, > notas, --- separador, **negrita**,
// *cursiva*, `código` y [texto](url). Devuelve también el índice (h2).
// ═══════════════════════════════════════════════════════════════════════════

const VAR_RX = /\{\{\s*([a-z_]+)\s*\}\}/gi;

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugId(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'seccion';
}

// {{variable}} → valor. Las desconocidas quedan como están (se ven en la vista previa).
function replaceVars(md, vars) {
    return String(md || '').replace(VAR_RX, (m, k) => {
        const key = k.toLowerCase();
        return Object.prototype.hasOwnProperty.call(vars || {}, key) ? String(vars[key] == null ? '' : vars[key]) : m;
    });
}

function safeUrl(raw) {
    const u = String(raw || '').trim();
    if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
    if (/^\/(?!\/)/.test(u) || /^#[\w-]*$/.test(u)) return u;
    return null;
}

// Inline sobre texto YA escapado. El url de los links viene escapado (&amp; etc.):
// se des-escapa para validar y se vuelve a escapar para el atributo.
function inline(escaped) {
    const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const codes = [];
    let s = escaped.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
        const ok = safeUrl(unesc(url));
        if (!ok) return text;
        const ext = /^https?:\/\//i.test(ok);
        return `<a href="${escapeHtml(ok)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
    return s;
}

const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = l => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(l);
const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

function renderMarkdown(md, vars) {
    const lines = replaceVars(md, vars).replace(/\r\n?/g, '\n').split('\n');
    const out = [], toc = [], used = new Set();
    let i = 0;
    const uniq = id => { let u = id, n = 2; while (used.has(u)) u = `${id}-${n++}`; used.add(u); return u; };

    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) { i++; continue; }

        let m = line.match(/^(#{1,4})\s+(.+?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/i);
        if (m) {
            const lvl = m[1].length, text = m[2];
            const id = uniq(m[3] ? m[3].toLowerCase() : slugId(text));
            out.push(`<h${lvl} id="${id}">${inline(escapeHtml(text))}</h${lvl}>`);
            if (lvl === 2) toc.push({ id, text: inline(escapeHtml(text)) });
            i++; continue;
        }
        if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

        if (/^\s*>/.test(line)) {
            const buf = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
            out.push(`<div class="note">${buf.map(b => inline(escapeHtml(b))).join('<br>')}</div>`);
            continue;
        }

        if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
            const head = cells(line); i += 2;
            const rows = [];
            while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
            out.push('<div class="tbl"><table><thead><tr>' + head.map(h => `<th>${inline(escapeHtml(h))}</th>`).join('') +
                '</tr></thead><tbody>' + rows.map(r => '<tr>' + head.map((_, k) => `<td>${inline(escapeHtml(r[k] || ''))}</td>`).join('') + '</tr>').join('') +
                '</tbody></table></div>');
            continue;
        }

        const ul = /^\s*[-*]\s+/, ol = /^\s*\d+[.)]\s+/;
        if (ul.test(line) || ol.test(line)) {
            const ordered = ol.test(line), rx = ordered ? ol : ul, items = [];
            while (i < lines.length && rx.test(lines[i])) {
                let item = lines[i].replace(rx, ''); i++;
                // continuación con sangría
                while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !ul.test(lines[i]) && !ol.test(lines[i])) { item += ' ' + lines[i].trim(); i++; }
                items.push(`<li>${inline(escapeHtml(item))}</li>`);
            }
            out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
            continue;
        }

        // Párrafo. La primera línea se consume siempre (p. ej. una fila "|…|" sin
        // separador de tabla), así el bucle nunca se queda sin avanzar.
        const buf = [line.trim()]; i++;
        while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*>/.test(lines[i]) &&
               !ul.test(lines[i]) && !ol.test(lines[i]) && !isTableRow(lines[i]) && !/^\s*(-{3,}|\*{3,})\s*$/.test(lines[i])) {
            buf.push(lines[i].trim()); i++;
        }
        out.push(`<p>${inline(escapeHtml(buf.join(' ')))}</p>`);
    }
    return { html: out.join('\n'), toc };
}

module.exports = { renderMarkdown, replaceVars, escapeHtml, VAR_RX };
