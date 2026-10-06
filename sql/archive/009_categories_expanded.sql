-- ============================================
-- RETOPA — Taxonomía expandida de categorías
-- 39 categorías organizadas en 10 grupos
-- Usa ON CONFLICT para no romper las existentes
-- ============================================

INSERT INTO categories (slug, name, icon, color, bg_color, display_order)
VALUES
-- ── ALIMENTACIÓN ─────────────────────────────────────────────────────────────
('restaurantes',    'Restaurantes',                 'fa-utensils',          'text-orange-500',  'bg-orange-50',    1),
('supermercados',   'Supermercados',                'fa-shopping-cart',     'text-orange-600',  'bg-orange-100',   2),
('alimentos',       'Alimentos y Bebidas',          'fa-apple-alt',         'text-yellow-600',  'bg-yellow-50',    3),
('agropecuario',    'Agropecuario',                 'fa-tractor',           'text-lime-600',    'bg-lime-50',      4),

-- ── SALUD ────────────────────────────────────────────────────────────────────
('salud',           'Salud',                        'fa-heartbeat',         'text-rose-500',    'bg-rose-50',     10),
('farmacias',       'Farmacias',                    'fa-pills',             'text-red-500',     'bg-red-50',      11),
('hospitales',      'Hospitales y Clínicas',        'fa-hospital',          'text-red-600',     'bg-red-100',     12),
('veterinarias',    'Veterinarias',                 'fa-paw',               'text-green-600',   'bg-green-50',    13),

-- ── FINANZAS ─────────────────────────────────────────────────────────────────
('bancos',          'Bancos',                       'fa-university',        'text-blue-700',    'bg-blue-100',    20),
('financieras',     'Financieras y Crédito',        'fa-hand-holding-usd',  'text-blue-600',    'bg-blue-50',     21),
('seguros',         'Seguros',                      'fa-shield-alt',        'text-indigo-600',  'bg-indigo-50',   22),
('cooperativas',    'Cooperativas',                 'fa-handshake',         'text-teal-600',    'bg-teal-50',     23),

-- ── CONSTRUCCIÓN ─────────────────────────────────────────────────────────────
('construccion',    'Construcción',                 'fa-hard-hat',          'text-amber-600',   'bg-amber-50',    30),
('inmobiliarias',   'Inmobiliarias',                'fa-home',              'text-amber-700',   'bg-amber-100',   31),
('ferreterias',     'Ferreterías',                  'fa-tools',             'text-stone-600',   'bg-stone-50',    32),
('materiales',      'Materiales de Construcción',   'fa-warehouse',         'text-stone-500',   'bg-stone-100',   33),

-- ── TECNOLOGÍA ───────────────────────────────────────────────────────────────
('tecnologia',      'Tecnología',                   'fa-laptop-code',       'text-violet-500',  'bg-violet-50',   40),
('telecomunicaciones','Telecomunicaciones',          'fa-signal',            'text-purple-600',  'bg-purple-50',   41),

-- ── TRANSPORTE Y LOGÍSTICA ───────────────────────────────────────────────────
('transporte',      'Transporte',                   'fa-truck',             'text-sky-600',     'bg-sky-50',      50),
('logistica',       'Logística y Com. Exterior',    'fa-boxes',             'text-sky-700',     'bg-sky-100',     51),
('automotriz',      'Automotriz',                   'fa-car',               'text-red-600',     'bg-red-50',      52),
('combustibles',    'Combustibles y Energía',       'fa-gas-pump',          'text-gray-700',    'bg-gray-100',    53),

-- ── SERVICIOS PROFESIONALES ──────────────────────────────────────────────────
('profesionales',   'Servicios Profesionales',      'fa-briefcase',         'text-emerald-600', 'bg-emerald-50',  60),
('juridico',        'Jurídico y Notarial',          'fa-balance-scale',     'text-emerald-700', 'bg-emerald-100', 61),
('contabilidad',    'Contabilidad y Auditoría',     'fa-calculator',        'text-teal-500',    'bg-teal-50',     62),
('consultoras',     'Consultoría y Gestión',        'fa-chart-line',        'text-cyan-600',    'bg-cyan-50',     63),
('seguridad',       'Seguridad Privada',            'fa-user-shield',       'text-gray-600',    'bg-gray-50',     64),
('limpieza',        'Limpieza y Mantenimiento',     'fa-broom',             'text-blue-400',    'bg-blue-50',     65),

-- ── INDUSTRIA ────────────────────────────────────────────────────────────────
('industria',       'Industria y Manufactura',      'fa-industry',          'text-slate-600',   'bg-slate-50',    70),
('agroquimica',     'Agroquímica',                  'fa-seedling',          'text-green-700',   'bg-green-100',   71),

-- ── COMERCIO ─────────────────────────────────────────────────────────────────
('importadoras',    'Importación',                  'fa-ship',              'text-pink-500',    'bg-pink-50',     80),
('exportadoras',    'Exportación',                  'fa-globe-americas',    'text-pink-600',    'bg-pink-100',    81),
('comercios',       'Comercios',                    'fa-shopping-bag',      'text-pink-400',    'bg-pink-50',     82),

-- ── LIFESTYLE ────────────────────────────────────────────────────────────────
('educacion',       'Educación',                    'fa-graduation-cap',    'text-blue-500',    'bg-blue-50',     90),
('turismo',         'Turismo y Hotelería',          'fa-plane',             'text-cyan-500',    'bg-cyan-50',     91),
('belleza',         'Belleza y Cuidado Personal',   'fa-spa',               'text-fuchsia-500', 'bg-fuchsia-50',  92),
('moda',            'Moda y Calzado',               'fa-tshirt',            'text-fuchsia-600', 'bg-fuchsia-100', 93),
('publicidad',      'Marketing y Publicidad',       'fa-bullhorn',          'text-orange-400',  'bg-orange-50',   94),
('medios',          'Medios y Comunicación',        'fa-newspaper',         'text-slate-500',   'bg-slate-50',    95)

ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  icon          = EXCLUDED.icon,
  color         = EXCLUDED.color,
  bg_color      = EXCLUDED.bg_color,
  display_order = EXCLUDED.display_order;

SELECT COUNT(*) || ' categorías en total' AS status FROM categories;
