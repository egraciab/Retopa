function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isNumericOrEmpty(value) {
  if (value === '' || value === null || value === undefined) return true;
  return !Number.isNaN(Number(value));
}

function validateBusinessForm(payload) {
  if (!payload.name || !payload.name.trim()) {
    return 'El nombre es requerido.';
  }
  if (!isValidEmail(payload.email)) {
    return 'El email no tiene un formato válido.';
  }
  if (!isNumericOrEmpty(payload.latitude) || !isNumericOrEmpty(payload.longitude)) {
    return 'Latitud y longitud deben ser valores numéricos.';
  }
  return null;
}

function normalizeBusinessPayload(raw) {
  return {
    name: raw.name.trim(),
    address: raw.address?.trim() || null,
    phone: raw.phone?.trim() || null,
    email: raw.email?.trim() || null,
    website: raw.website?.trim() || null,
    ruc: raw.ruc?.trim() || null,
    city_id: raw.city_id || null,
    category_id: raw.category_id || null,
    source: raw.source?.trim() || 'manual',
    claimed: !!raw.claimed,
    latitude: raw.latitude === '' ? null : Number(raw.latitude),
    longitude: raw.longitude === '' ? null : Number(raw.longitude)
  };
}

window.BusinessForm = {
  validateBusinessForm,
  normalizeBusinessPayload
};
