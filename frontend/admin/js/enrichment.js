/**
 * RetoPA Admin — js/enrichment.js
 * Revisión de candidatos de enriquecimiento por LOTES.
 *
 * Idea de fondo: no revisás fichas, revisás reglas.
 *   0.95 → reformateo determinístico  → muestra de 10, aprobás las 1.932
 *   0.70 → prefijo inferido de ciudad → muestra por ciudad, aprobás la ciudad
 *   0.50 → algo raro                  → una por una, con teclado
 */

const ENR_API = '/enrichment';
let enrTab = '0.95';
let enrSeleccion = new Set();

function enrFmt(n) { return (n ?? 0).toLocaleString('es-PY'); }

// ── Carga principal ──────────────────────────────────────────────────────
async function loadEnrichment() {
  const cont = document.getElementById('enrichmentContent');
  cont.innerHTML = '<p class="text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Cargando...</p>';
  try {
    const r = await apiAdminGet(`${ENR_API}/resumen`);
    if (!r.success) throw new Error(r.error);
    enrRenderResumen(r.data);
    enrRenderTab();
  } catch (e) {
    cont.innerHTML = `<p class="text-red-500 text-sm">Error: ${e.message}</p>`;
  }
}

function enrRenderResumen({ tramos, hoy }) {
  const t = c => tramos.find(x => parseFloat(x.confianza) === c) || {};
  const kpis = document.getElementById('enrichmentKpis');
  const card = (label, val, sub, color) => `
    <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <p class="text-xs text-gray-500 font-medium">${label}</p>
      <p class="text-2xl font-bold ${color} mt-1">${enrFmt(val)}</p>
      <p class="text-[11px] text-gray-400 mt-0.5">${sub}</p>
    </div>`;
  kpis.innerHTML =
      card('Reformateo directo', t(0.95).pendientes, `${enrFmt(t(0.95).cruzan_umbral)} cruzan el umbral`, 'text-emerald-600')
    + card('Prefijo inferido',   t(0.70).pendientes, 'revisar por ciudad', 'text-amber-600')
    + card('Requiere revisión',  t(0.50).pendientes, 'una por una', 'text-rose-600')
    + card('Aplicados 24h',      hoy.aplicados_24h,  `${enrFmt(hoy.rechazados_24h)} rechazados`, 'text-sky-600');
}

function enrSetTab(tab) {
  enrTab = tab;
  enrSeleccion.clear();
  document.querySelectorAll('[data-enr-tab]').forEach(b => {
    const on = b.dataset.enrTab === tab;
    b.className = 'px-4 py-2 text-sm font-medium rounded-lg transition ' +
      (on ? 'bg-[#0ea5e9] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200');
  });
  enrRenderTab();
}

function enrRenderTab() {
  if (enrTab === '0.70') return enrRenderGrupos();
  return enrRenderLista(enrTab, null, enrTab === '0.95');
}

// ── Tramo 0.70: por ciudad ───────────────────────────────────────────────
async function enrRenderGrupos() {
  const c = document.getElementById('enrichmentContent');
  c.innerHTML = '<p class="text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Agrupando...</p>';
  const r = await apiAdminGet(`${ENR_API}/grupos?confianza=0.70`);
  if (!r.success) { c.innerHTML = `<p class="text-red-500">${r.error}</p>`; return; }

  c.innerHTML = `
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
      <p class="text-sm text-amber-800">
        <i class="fas fa-info-circle mr-1"></i>
        Acá el prefijo de área se dedujo de la ciudad. Mirá una muestra de cada
        ciudad: si el prefijo está bien, lo está para todas las fichas de esa ciudad.
      </p>
    </div>
    <div class="grid gap-3">
      ${r.data.map(g => `
        <div class="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
          <div>
            <p class="font-semibold text-gray-900">${g.ciudad}</p>
            <p class="text-xs text-gray-500">${enrFmt(g.total)} fichas · prefijo <code class="bg-gray-100 px-1 rounded">${g.prefijo_ejemplo}…</code></p>
          </div>
          <div class="flex gap-2">
            <button onclick="enrVerMuestra('${g.ciudad.replace(/'/g,"\\'")}')"
              class="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
              <i class="fas fa-eye mr-1"></i>Ver 10
            </button>
            <button onclick="enrAprobarGrupo('${g.ciudad.replace(/'/g,"\\'")}', ${g.total})"
              class="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
              Aprobar ${enrFmt(g.total)}
            </button>
          </div>
        </div>`).join('')}
    </div>
    <div id="enrMuestra" class="mt-4"></div>`;
}

async function enrVerMuestra(ciudad) {
  const d = document.getElementById('enrMuestra');
  d.innerHTML = '<p class="text-gray-400 text-sm">Cargando muestra...</p>';
  const r = await apiAdminGet(`${ENR_API}/candidatos?confianza=0.70&ciudad=${encodeURIComponent(ciudad)}&limit=10&muestra=1`);
  d.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div class="px-4 py-2 bg-gray-50 border-b text-sm font-semibold">Muestra al azar — ${ciudad}</div>
      ${enrTabla(r.data, false)}
    </div>`;
}

async function enrAprobarGrupo(ciudad, total) {
  if (!confirm(`Aplicar ${total} teléfonos de ${ciudad}?\n\nSe puede revertir desde "Corridas".`)) return;
  const r = await apiAdminPost(`${ENR_API}/aprobar-grupo`, { confianza: 0.70, ciudad });
  alert(r.success ? `✔ ${r.aplicados} aplicados` : `Error: ${r.error}`);
  loadEnrichment();
}

// ── Tramos 0.95 y 0.50: lista ────────────────────────────────────────────
async function enrRenderLista(conf, ciudad, esLote) {
  const c = document.getElementById('enrichmentContent');
  c.innerHTML = '<p class="text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Cargando...</p>';
  const q = `${ENR_API}/candidatos?confianza=${conf}&limit=${esLote ? 10 : 50}${esLote ? '&muestra=1' : ''}`;
  const r = await apiAdminGet(q);
  if (!r.success) { c.innerHTML = `<p class="text-red-500">${r.error}</p>`; return; }

  const banner = esLote ? `
    <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-center justify-between">
      <p class="text-sm text-emerald-800">
        <i class="fas fa-check-circle mr-1"></i>
        Reformateo del mismo número, sin inferencias. Revisá estos 10 al azar
        y si están bien, aprobá el tramo completo.
      </p>
      <button onclick="enrAprobarTramo(0.95)"
        class="ml-4 shrink-0 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
        Aprobar tramo completo
      </button>
    </div>` : `
    <div class="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4">
      <p class="text-sm text-rose-800">
        <i class="fas fa-triangle-exclamation mr-1"></i>
        Quedaron dígitos sueltos o el número es ambiguo. Estas van de a una.
        Teclas: <kbd class="bg-white px-1 rounded border">A</kbd> aprobar ·
        <kbd class="bg-white px-1 rounded border">R</kbd> rechazar
      </p>
    </div>`;

  c.innerHTML = banner + `
    <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
      ${enrTabla(r.data, !esLote)}
    </div>` + (esLote ? '' : `
    <div class="mt-3 flex gap-2">
      <button onclick="enrAccionSeleccion('aprobar')" class="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white">Aprobar seleccionados</button>
      <button onclick="enrAccionSeleccion('rechazar')" class="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white">Rechazar seleccionados</button>
    </div>`);
}

function enrTabla(rows, conCheck) {
  if (!rows.length) return '<p class="p-6 text-center text-gray-400 text-sm">Nada pendiente acá. 🎉</p>';
  return `
  <table class="w-full text-sm">
    <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
      <tr>
        ${conCheck ? '<th class="px-3 py-2"></th>' : ''}
        <th class="px-3 py-2 text-left">Negocio</th>
        <th class="px-3 py-2 text-left">Ciudad</th>
        <th class="px-3 py-2 text-left">Actual</th>
        <th class="px-3 py-2 text-left">Propuesto</th>
        <th class="px-3 py-2 text-left">Impacto</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100">
      ${rows.map(r => `
        <tr class="hover:bg-gray-50" data-enr-id="${r.id}">
          ${conCheck ? `<td class="px-3 py-2"><input type="checkbox" onchange="enrToggle(${r.id}, this.checked)"></td>` : ''}
          <td class="px-3 py-2">
            <a href="/negocio/${r.slug || ''}" target="_blank" class="font-medium text-gray-900 hover:text-sky-600">${r.negocio}</a>
            ${r.phone_extra ? `<span class="ml-1 text-[10px] text-gray-400" title="tiene números secundarios guardados"><i class="fas fa-plus-circle"></i></span>` : ''}
          </td>
          <td class="px-3 py-2 text-gray-500">${r.ciudad || '<span class="text-rose-400">—</span>'}</td>
          <td class="px-3 py-2"><code class="text-gray-400">${r.valor_actual || '—'}</code></td>
          <td class="px-3 py-2"><code class="text-gray-900 font-semibold">${r.propuesto}</code></td>
          <td class="px-3 py-2">
            ${r.cruza_umbral
              ? '<span class="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">se indexa</span>'
              : `<span class="text-[11px] text-gray-400">score ${r.score_actual}</span>`}
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

function enrToggle(id, on) { on ? enrSeleccion.add(id) : enrSeleccion.delete(id); }

async function enrAccionSeleccion(accion) {
  if (!enrSeleccion.size) return alert('No seleccionaste nada');
  const r = await apiAdminPost(`${ENR_API}/${accion}`, { ids: [...enrSeleccion] });
  alert(r.success ? '✔ Listo' : `Error: ${r.error}`);
  loadEnrichment();
}

async function enrAprobarTramo(conf) {
  if (!confirm(`Aplicar TODO el tramo de confianza ${conf}?\n\nRevertible desde "Corridas".`)) return;
  const r = await apiAdminPost(`${ENR_API}/aprobar-grupo`, { confianza: conf });
  alert(r.success ? `✔ ${r.aplicados} aplicados` : `Error: ${r.error}`);
  loadEnrichment();
}

// ── Corridas / rollback ──────────────────────────────────────────────────
async function enrVerCorridas() {
  const r = await apiAdminGet(`${ENR_API}/corridas`);
  const c = document.getElementById('enrichmentContent');
  c.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase"><tr>
          <th class="px-3 py-2 text-left">#</th><th class="px-3 py-2 text-left">Origen</th>
          <th class="px-3 py-2 text-left">Fecha</th><th class="px-3 py-2 text-left">Aplicados</th>
          <th class="px-3 py-2"></th></tr></thead>
        <tbody class="divide-y divide-gray-100">
        ${r.data.map(x => `<tr>
          <td class="px-3 py-2">${x.id}</td>
          <td class="px-3 py-2">${x.filtro_categoria || '—'}</td>
          <td class="px-3 py-2 text-gray-500">${new Date(x.iniciada_at).toLocaleString('es-PY')}</td>
          <td class="px-3 py-2 font-semibold">${enrFmt(x.aplicados)}</td>
          <td class="px-3 py-2 text-right">
            ${x.aplicados > 0 ? `<button onclick="enrRevertir(${x.id}, ${x.aplicados})"
              class="px-3 py-1 text-xs rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100">
              <i class="fas fa-rotate-left mr-1"></i>Revertir</button>` : ''}
          </td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function enrRevertir(id, n) {
  if (!confirm(`Revertir la corrida #${id}?\n\nSe restauran ${n} teléfonos a su valor anterior.`)) return;
  const r = await apiAdminPost(`${ENR_API}/revertir/${id}`, {});
  alert(r.success ? `✔ ${r.revertidos} revertidos` : `Error: ${r.error}`);
  enrVerCorridas();
}

// ── Atajos de teclado en el tramo 0.50 ───────────────────────────────────
document.addEventListener('keydown', e => {
  if (enrTab !== '0.50') return;
  if (document.getElementById('section-enrichment')?.classList.contains('hidden')) return;
  if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key.toLowerCase() === 'a') enrAccionSeleccion('aprobar');
  if (e.key.toLowerCase() === 'r') enrAccionSeleccion('rechazar');
});
