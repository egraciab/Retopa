/**
 * RetoPA Admin — js/media.js
 * Upload imágenes, Google Maps
 */

// ================================================================
// IMAGE UPLOAD — Drag & Drop (admin)
// ================================================================

// Sube una imagen al backend y actualiza el hidden input + preview
async function adminUploadImage(file, type, businessId) {
    if (!file) return null;

    const ACCEPTED = ['image/jpeg','image/png','image/webp','image/gif','image/avif'];
    if (!ACCEPTED.includes(file.type)) {
        showToast('Formato no soportado. Usá JPG, PNG o WebP.', 'error');
        return null;
    }
    if (file.size > 10 * 1024 * 1024) {
        showToast('La imagen es muy grande (máx 10MB).', 'error');
        return null;
    }

    // Mostrar spinner en la zona
    const zoneId = type === 'logo' ? `logoZone_${businessId}` : `coverZone_${businessId}`;
    const previewId = type === 'logo' ? `logoPreview_${businessId}` : `coverPreview_${businessId}`;
    const zone = document.getElementById(zoneId);
    const preview = document.getElementById(previewId);
    if (preview) preview.innerHTML = `<i class="fas fa-spinner fa-spin text-[#0ea5e9] text-2xl"></i><p class="text-xs text-gray-400 mt-2">Subiendo y comprimiendo...</p>`;
    if (zone) { zone.style.borderColor = '#0ea5e9'; zone.style.background = '#f0f9ff'; }

    const formData = new FormData();
    formData.append(type, file);
    if (businessId) formData.append('business_id', businessId);

    try {
        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAdminToken()}` },
            body: formData
        });

        // Capturar el texto crudo antes de parsear JSON
        const rawText = await res.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch(e) {
            // La respuesta no es JSON — probablemente 404 o error de servidor
            console.error('[Upload] Respuesta no-JSON:', res.status, rawText.substring(0, 300));
            showToast(`Error ${res.status}: ruta de upload no encontrada. ¿Rebuildeaste el backend?`, 'error');
            if (preview) preview.innerHTML = `<i class="fas fa-exclamation-triangle text-red-400 text-xl mb-1"></i><p class="text-xs text-red-400">Error ${res.status}</p>`;
            if (zone) { zone.style.borderColor = '#fca5a5'; zone.style.background = 'white'; }
            return null;
        }

        if (!data.success) {
            showToast('Error al subir imagen: ' + data.error, 'error');
            if (preview) preview.innerHTML = `<i class="fas fa-exclamation-triangle text-red-400 text-xl mb-1"></i><p class="text-xs text-red-400">${escapeHtml(data.error || 'Error')}</p>`;
            if (zone) { zone.style.borderColor = '#fca5a5'; zone.style.background = 'white'; }
            return null;
        }

        const url = type === 'logo' ? (data.data.image_url || data.data.logo_url) : data.data.cover_url;

        // Actualizar hidden input
        const hiddenId = type === 'logo' ? `imageUrlHidden_${businessId}` : `coverUrlHidden_${businessId}`;
        const hidden = document.getElementById(hiddenId);
        if (hidden) hidden.value = url;

        // Actualizar preview
        if (preview) {
            const imgClass = type === 'logo'
                ? 'w-20 h-20 object-cover rounded-xl mx-auto mb-2'
                : 'w-full h-16 object-cover rounded-lg mx-auto mb-2';
            preview.innerHTML = `
                <img src="${url}" class="${imgClass}" onerror="this.style.display='none'">
                <p class="text-xs text-green-600"><i class="fas fa-check mr-1"></i>Subida correctamente</p>
                <p class="text-xs text-gray-400">Clic o arrastrá para cambiar</p>
            `;
        }
        if (zone) { zone.style.borderColor = '#86efac'; zone.style.background = '#f0fdf4'; }
        showToast(`${type === 'logo' ? 'Logo' : 'Portada'} subida correctamente`, 'success');
        return url;
    } catch (err) {
        console.error('[Upload] Error de red:', err);
        showToast('Error de red al subir imagen: ' + err.message, 'error');
        if (preview) preview.innerHTML = `<i class="fas fa-exclamation-triangle text-red-400 text-xl mb-1"></i><p class="text-xs text-red-400">Error de red</p>`;
        if (zone) { zone.style.borderColor = '#d1d5db'; zone.style.background = 'white'; }
        return null;
    }
}

function handleAdminImageSelect(input, type, businessId) {
    const file = input.files[0];
    if (file) adminUploadImage(file, type, businessId);
}

function handleAdminImageDrop(event, type, businessId) {
    event.preventDefault();
    const zoneId = type === 'logo' ? `logoZone_${businessId}` : `coverZone_${businessId}`;
    const zone = document.getElementById(zoneId);
    if (zone) { zone.style.borderColor = '#d1d5db'; zone.style.background = 'white'; }
    const file = event.dataTransfer?.files?.[0];
    if (file) adminUploadImage(file, type, businessId);
}

// ================================================================
// MAPA DE UBICACIÓN — Modal de Empresa
// ================================================================
const adminMaps = {}; // cache de instancias de mapa por businessId

function initAdminMap(businessId, lat, lng) {
    const container = document.getElementById(`adminMap_${businessId}`);
    const placeholder = document.getElementById(`adminMapPlaceholder_${businessId}`);
    if (!container) return;

    // Si Google Maps no está disponible aún, esperar
    if (typeof google === 'undefined' || !google.maps) {
        container.innerHTML = '<div class="flex items-center justify-center h-full text-gray-400 text-xs"><i class="fas fa-spinner fa-spin mr-2"></i>Cargando mapa...</div>';
        setTimeout(() => initAdminMap(businessId, lat, lng), 800);
        return;
    }

    const hasCoords = lat && lng && parseFloat(lat) !== 0 && parseFloat(lng) !== 0;
    const center = hasCoords
        ? { lat: parseFloat(lat), lng: parseFloat(lng) }
        : { lat: -25.2867, lng: -57.6478 }; // Asunción por defecto

    if (placeholder) placeholder.style.display = 'none';
    container.style.display = 'block';

    const map = new google.maps.Map(container, {
        center,
        zoom: hasCoords ? 15 : 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
    });

    const marker = new google.maps.Marker({
        position: center,
        map,
        draggable: true,
        visible: hasCoords,
        title: 'Ubicación de la empresa',
        animation: google.maps.Animation.DROP,
    });

    // Al arrastrar el marcador → actualizar inputs
    marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        document.getElementById(`latInput_${businessId}`).value = pos.lat().toFixed(7);
        document.getElementById(`lngInput_${businessId}`).value = pos.lng().toFixed(7);
    });

    // Clic en el mapa → mover marcador
    map.addListener('click', (e) => {
        marker.setPosition(e.latLng);
        marker.setVisible(true);
        document.getElementById(`latInput_${businessId}`).value = e.latLng.lat().toFixed(7);
        document.getElementById(`lngInput_${businessId}`).value = e.latLng.lng().toFixed(7);
    });

    adminMaps[businessId] = { map, marker };
}

function updateAdminMapPin(businessId) {
    const m = adminMaps[businessId];
    if (!m) return;
    const lat = parseFloat(document.getElementById(`latInput_${businessId}`)?.value);
    const lng = parseFloat(document.getElementById(`lngInput_${businessId}`)?.value);
    if (isNaN(lat) || isNaN(lng)) return;
    const pos = { lat, lng };
    m.marker.setPosition(pos);
    m.marker.setVisible(true);
    m.map.setCenter(pos);
    m.map.setZoom(15);
}

function clearBusinessMap(businessId) {
    document.getElementById(`latInput_${businessId}`).value = '';
    document.getElementById(`lngInput_${businessId}`).value = '';
    const m = adminMaps[businessId];
    if (m) m.marker.setVisible(false);
}

async function geocodeBusinessAddress(businessId) {
    if (typeof google === 'undefined' || !google.maps) {
        showToast('Google Maps aún no cargó, esperá un momento', 'error'); return;
    }

    // Leer dirección y ciudad del formulario
    const form = document.getElementById('editBusinessForm');
    if (!form) return;
    const address = form.querySelector('[name="address"]')?.value?.trim() || '';
    const city    = form.querySelector('[name="city"]')?.value?.trim() || '';
    const query   = [address, city, 'Paraguay'].filter(Boolean).join(', ');

    if (!address && !city) {
        showToast('Completá la dirección o ciudad primero', 'error'); return;
    }

    showToast('Buscando coordenadas...', 'info');

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const loc = results[0].geometry.location;
            document.getElementById(`latInput_${businessId}`).value = loc.lat().toFixed(7);
            document.getElementById(`lngInput_${businessId}`).value = loc.lng().toFixed(7);
            updateAdminMapPin(businessId);
            showToast(`Ubicación encontrada: ${results[0].formatted_address}`, 'success');
        } else {
            showToast('No se encontró la dirección. Probá siendo más específico.', 'error');
        }
    });
}

