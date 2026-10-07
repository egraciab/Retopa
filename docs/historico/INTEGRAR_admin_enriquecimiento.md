# Integrar "Enriquecimiento" al panel admin

Tres archivos a copiar y tres ediciones. Diez minutos.

---

## 1. Copiar archivos

```bash
cp admin.enrichment.routes.js /opt/retopa/backend/src/routes/
cp enrichment.js              /opt/retopa/frontend/admin/js/
```

---

## 2. Montar la ruta en `backend/src/app.js`

Junto a las otras líneas de `require` (cerca de la 43):

```js
const adminEnrichmentRoutes = require('./routes/admin.enrichment.routes');
```

Y junto a los `app.use` (cerca de la 53):

```js
app.use('/api/v2/admin/enrichment', adminEnrichmentRoutes);
```

---

## 3. Item en el menú lateral de `frontend/admin/index.html`

Pegar junto a los otros `sidebar-item` (por ejemplo debajo del de `semaforo`):

```html
<a href="#" onclick="showSection('enrichment')"
   class="sidebar-item flex items-center gap-3 px-6 py-3 text-sm font-medium" id="nav-enrichment">
    <i class="fas fa-wand-magic-sparkles w-5"></i>
    <span>Enriquecimiento</span>
    <span id="enrichmentBadge"
          class="ml-auto bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full hidden">0</span>
</a>
```

---

## 4. La sección, junto a los otros `<div id="section-...">`

```html
<div id="section-enrichment" class="hidden fade-in">

    <div class="flex items-center justify-between mb-6">
        <div>
            <h2 class="text-2xl font-bold text-gray-900">Enriquecimiento de fichas</h2>
            <p class="text-sm text-gray-500 mt-0.5">
                Revisión por lotes. Nada se aplica sin tu aprobación y todo se puede revertir.
            </p>
        </div>
        <button onclick="enrVerCorridas()"
                class="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700">
            <i class="fas fa-clock-rotate-left mr-1"></i>Corridas
        </button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" id="enrichmentKpis"></div>

    <div class="flex gap-2 mb-4">
        <button data-enr-tab="0.95" onclick="enrSetTab('0.95')"
                class="px-4 py-2 text-sm font-medium rounded-lg bg-[#0ea5e9] text-white">
            Reformateo directo
        </button>
        <button data-enr-tab="0.70" onclick="enrSetTab('0.70')"
                class="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
            Prefijo por ciudad
        </button>
        <button data-enr-tab="0.50" onclick="enrSetTab('0.50')"
                class="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
            Revisión manual
        </button>
    </div>

    <div id="enrichmentContent"></div>
</div>
```

---

## 5. Cargar el script

Junto a los otros `<script src="js/...">` al final del `index.html`:

```html
<script src="js/enrichment.js"></script>
```

---

## 6. Enganchar en `showSection`

En `frontend/admin/js/config.js`, dentro de `showSection()`, donde se despachan
las secciones, agregar:

```js
if (section === 'enrichment') loadEnrichment();
```

---

## 7. Reiniciar

```bash
cd /opt/retopa && docker compose restart backend
```

---

## Cómo se usa

**Reformateo directo (1.932)** — `+595986110192` → `0986110192`. Es el mismo
número, sin inferencias. Mirás 10 al azar y aprobás el tramo entero.

**Prefijo por ciudad (1.183)** — acá sí hay una suposición: el prefijo de área
salió de la ciudad. Se agrupa por ciudad, ves 10 de Luque, y si están bien
aprobás las de Luque juntas. Estás validando una regla, no fichas.

**Revisión manual (248)** — quedaron dígitos sueltos. Van de a una, con `A` y `R`.

Todo lo aplicado queda en "Corridas" con su botón de revertir. `phone_raw`
conserva el original pase lo que pase.
