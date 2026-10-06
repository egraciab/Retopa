-- ============================================
-- RETOPA — Migración 020: Categorías jerárquicas + multi-categoría por empresa
-- ============================================
-- Cambios:
--   1. categories.parent_id  → jerarquía padre/hijo (2 niveles)
--   2. business_categories   → pivot múltiples categorías por empresa
--   3. plans.max_categories  → límite por plan (basic=1, featured=2, premium=5)
--   4. Seed                  → 14 padres + 218 hijos nuevos + 31 existentes
--                              reasignados como hijos
--   5. Datos                 → empresas existentes conservan su categoría como
--                              `is_primary=true` en el pivot
--
-- Política de borrado de padre: ON DELETE SET NULL (hijos quedan huérfanos)
-- ============================================

BEGIN;

-- ── 1. Esquema: parent_id en categories ─────────────────────────────────────
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ── 2. Pivot: business_categories ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_categories (
    business_id INT     NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id INT     NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
    position    INT     NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_bc_business ON business_categories(business_id);
CREATE INDEX IF NOT EXISTS idx_bc_category ON business_categories(category_id);

-- Único `is_primary=true` por empresa (índice parcial)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bc_primary
  ON business_categories(business_id) WHERE is_primary;

-- ── 3. plans.max_categories ─────────────────────────────────────────────────
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_categories INT NOT NULL DEFAULT 1;

UPDATE plans SET max_categories = 1 WHERE id = 'basic';
UPDATE plans SET max_categories = 2 WHERE id = 'featured';
UPDATE plans SET max_categories = 5 WHERE id = 'premium';

-- ── 4. INSERT padres nuevos (6 categorías raíz) ─────────────────────────────
INSERT INTO categories (slug, name, icon, color, bg_color, display_order, parent_id) VALUES
  ('gastronomia',           'Gastronomía',                  'fa-utensils',   'text-orange-500',  'bg-orange-50',   100, NULL),
  ('finanzas',              'Finanzas',                     'fa-coins',      'text-emerald-600', 'bg-emerald-50',  400, NULL),
  ('construccion-hogar',    'Construcción y Hogar',         'fa-hammer',     'text-amber-600',   'bg-amber-50',    500, NULL),
  ('transporte-automotriz', 'Transporte y Automotriz',      'fa-car-side',   'text-sky-600',     'bg-sky-50',      700, NULL),
  ('belleza-lifestyle',     'Belleza, Deporte y Lifestyle', 'fa-spa',        'text-fuchsia-500', 'bg-fuchsia-50',  1200, NULL),
  ('medios-publicidad',     'Medios y Comunicación',        'fa-bullhorn',   'text-purple-500',  'bg-purple-50',   1400, NULL)
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  icon          = EXCLUDED.icon,
  color         = EXCLUDED.color,
  bg_color      = EXCLUDED.bg_color,
  display_order = EXCLUDED.display_order,
  parent_id     = NULL;

-- ── 5. Reasignar display_order de los 8 padres existentes ───────────────────
UPDATE categories SET display_order = 200,  parent_id = NULL WHERE slug = 'comercios';
UPDATE categories SET display_order = 300,  parent_id = NULL WHERE slug = 'salud';
UPDATE categories SET display_order = 600,  parent_id = NULL WHERE slug = 'tecnologia';
UPDATE categories SET display_order = 800,  parent_id = NULL WHERE slug = 'profesionales';
UPDATE categories SET display_order = 900,  parent_id = NULL WHERE slug = 'industria';
UPDATE categories SET display_order = 1000, parent_id = NULL WHERE slug = 'educacion';
UPDATE categories SET display_order = 1100, parent_id = NULL WHERE slug = 'turismo';
UPDATE categories SET display_order = 1300, parent_id = NULL WHERE slug = 'agropecuario';

-- ── 6. Mover los 31 slugs existentes a su nuevo padre ───────────────────────
WITH mapping(slug, parent_slug, display_order) AS (VALUES
  -- Gastronomía
  ('restaurantes',       'gastronomia',          101),
  ('supermercados',      'gastronomia',          102),
  ('alimentos',          'gastronomia',          103),
  -- Comercios
  ('moda',               'comercios',            201),
  ('importadoras',       'comercios',            202),
  ('exportadoras',       'comercios',            203),
  -- Salud
  ('farmacias',          'salud',                301),
  ('hospitales',         'salud',                302),
  ('veterinarias',       'salud',                303),
  -- Finanzas
  ('bancos',             'finanzas',             401),
  ('financieras',        'finanzas',             402),
  ('seguros',            'finanzas',             403),
  ('cooperativas',       'finanzas',             404),
  -- Construcción y Hogar
  ('construccion',       'construccion-hogar',   501),
  ('inmobiliarias',      'construccion-hogar',   502),
  ('ferreterias',        'construccion-hogar',   503),
  ('materiales',         'construccion-hogar',   504),
  -- Tecnología
  ('telecomunicaciones', 'tecnologia',           601),
  -- Transporte y Automotriz
  ('transporte',         'transporte-automotriz',701),
  ('logistica',          'transporte-automotriz',702),
  ('automotriz',         'transporte-automotriz',703),
  ('combustibles',       'transporte-automotriz',704),
  -- Profesionales
  ('juridico',           'profesionales',        801),
  ('contabilidad',       'profesionales',        802),
  ('consultoras',        'profesionales',        803),
  ('seguridad',          'profesionales',        804),
  ('limpieza',           'profesionales',        805),
  -- Belleza/Lifestyle
  ('belleza',            'belleza-lifestyle',    1201),
  -- Agropecuario
  ('agroquimica',        'agropecuario',         1301),
  -- Medios y Publicidad
  ('publicidad',         'medios-publicidad',    1401),
  ('medios',             'medios-publicidad',    1402)
)
UPDATE categories c SET
    parent_id     = p.id,
    display_order = m.display_order
FROM mapping m
JOIN categories p ON p.slug = m.parent_slug
WHERE c.slug = m.slug;

-- ── 7. INSERT 218 hijos nuevos ──────────────────────────────────────────────
WITH new_kids(slug, name, icon, color, bg_color, display_order, parent_slug) AS (VALUES
  -- ── GASTRONOMÍA (104–199) ──────────────────────────────────────────────
  ('cafeterias',             'Cafeterías',                 'fa-mug-saucer',      'text-orange-500','bg-orange-50',104,'gastronomia'),
  ('panaderias',             'Panaderías y confiterías',   'fa-bread-slice',     'text-orange-500','bg-orange-50',105,'gastronomia'),
  ('heladerias',             'Heladerías',                 'fa-ice-cream',       'text-orange-500','bg-orange-50',106,'gastronomia'),
  ('pastelerias',            'Pastelerías',                'fa-cookie',          'text-orange-500','bg-orange-50',107,'gastronomia'),
  ('pizzerias',              'Pizzerías',                  'fa-pizza-slice',     'text-orange-500','bg-orange-50',108,'gastronomia'),
  ('comida-rapida',          'Comida rápida',              'fa-hamburger',       'text-orange-500','bg-orange-50',109,'gastronomia'),
  ('comida-tipica',          'Comida típica paraguaya',    'fa-drumstick-bite',  'text-orange-500','bg-orange-50',110,'gastronomia'),
  ('carnicerias',            'Carnicerías',                'fa-bacon',           'text-orange-500','bg-orange-50',111,'gastronomia'),
  ('pescaderias',            'Pescaderías',                'fa-fish',            'text-orange-500','bg-orange-50',112,'gastronomia'),
  ('fruterias',              'Fruterías y verdulerías',    'fa-apple-alt',       'text-orange-500','bg-orange-50',113,'gastronomia'),
  ('despensas',              'Despensas y minimercados',   'fa-store',           'text-orange-500','bg-orange-50',114,'gastronomia'),
  ('mercados',               'Mercados',                   'fa-store-alt',       'text-orange-500','bg-orange-50',115,'gastronomia'),
  ('delivery-comida',        'Delivery / apps de comida',  'fa-motorcycle',      'text-orange-500','bg-orange-50',116,'gastronomia'),
  ('catering',               'Catering',                   'fa-utensil-spoon',   'text-orange-500','bg-orange-50',117,'gastronomia'),
  ('bares',                  'Bares, pubs y cervecerías',  'fa-beer',            'text-orange-500','bg-orange-50',118,'gastronomia'),
  ('vinotecas',              'Vinotecas y licorerías',     'fa-wine-bottle',     'text-orange-500','bg-orange-50',119,'gastronomia'),
  ('food-trucks',            'Food trucks',                'fa-truck-pickup',    'text-orange-500','bg-orange-50',120,'gastronomia'),

  -- ── COMERCIOS (204–299) ────────────────────────────────────────────────
  ('jugueterias',            'Jugueterías',                'fa-puzzle-piece',    'text-pink-500','bg-pink-50',204,'comercios'),
  ('librerias',              'Librerías',                  'fa-book',            'text-pink-500','bg-pink-50',205,'comercios'),
  ('papelerias',             'Papelerías',                 'fa-pencil-alt',      'text-pink-500','bg-pink-50',206,'comercios'),
  ('mueblerias',             'Mueblerías',                 'fa-couch',           'text-pink-500','bg-pink-50',207,'comercios'),
  ('electrodomesticos',      'Electrodomésticos',          'fa-blender',         'text-pink-500','bg-pink-50',208,'comercios'),
  ('electronica',            'Electrónica',                'fa-tv',              'text-pink-500','bg-pink-50',209,'comercios'),
  ('perfumerias',            'Perfumerías',                'fa-spray-can',       'text-pink-500','bg-pink-50',210,'comercios'),
  ('joyerias',               'Joyerías y relojerías',      'fa-gem',             'text-pink-500','bg-pink-50',211,'comercios'),
  ('opticas',                'Ópticas',                    'fa-glasses',         'text-pink-500','bg-pink-50',212,'comercios'),
  ('mascotas-tienda',        'Tienda de mascotas',         'fa-bone',            'text-pink-500','bg-pink-50',213,'comercios'),
  ('tabaquerias',            'Tabaquerías',                'fa-smoking',         'text-pink-500','bg-pink-50',214,'comercios'),
  ('regaleria',              'Regalería',                  'fa-gift',            'text-pink-500','bg-pink-50',215,'comercios'),
  ('decoracion-hogar',       'Decoración y hogar',         'fa-chair',           'text-pink-500','bg-pink-50',216,'comercios'),
  ('bazar',                  'Bazar',                      'fa-shopping-basket', 'text-pink-500','bg-pink-50',217,'comercios'),
  ('instrumentos-musicales', 'Instrumentos musicales',     'fa-guitar',          'text-pink-500','bg-pink-50',218,'comercios'),
  ('articulos-deportivos',   'Artículos deportivos',       'fa-football-ball',   'text-pink-500','bg-pink-50',219,'comercios'),
  ('bicicleterias',          'Bicicleterías',              'fa-bicycle',         'text-pink-500','bg-pink-50',220,'comercios'),
  ('florerias',              'Florerías',                  'fa-spa',             'text-pink-500','bg-pink-50',221,'comercios'),
  ('ecommerce',              'E-commerce',                 'fa-shopping-cart',   'text-pink-500','bg-pink-50',222,'comercios'),
  ('segunda-mano',           'Segunda mano',               'fa-recycle',         'text-pink-500','bg-pink-50',223,'comercios'),
  ('lenceria',               'Lencería',                   'fa-tshirt',          'text-pink-500','bg-pink-50',224,'comercios'),
  ('calzados',               'Calzados',                   'fa-shoe-prints',     'text-pink-500','bg-pink-50',225,'comercios'),
  ('ropa-infantil',          'Ropa infantil',              'fa-baby',            'text-pink-500','bg-pink-50',226,'comercios'),

  -- ── SALUD (304–399) ────────────────────────────────────────────────────
  ('consultorios-medicos',   'Consultorios médicos',       'fa-stethoscope',     'text-rose-500','bg-rose-50',304,'salud'),
  ('odontologia',            'Odontología',                'fa-tooth',           'text-rose-500','bg-rose-50',305,'salud'),
  ('psicologia',             'Psicología',                 'fa-brain',           'text-rose-500','bg-rose-50',306,'salud'),
  ('kinesiologia',           'Kinesiología y fisioterapia','fa-walking',         'text-rose-500','bg-rose-50',307,'salud'),
  ('nutricion',              'Nutrición',                  'fa-carrot',          'text-rose-500','bg-rose-50',308,'salud'),
  ('laboratorios-clinicos',  'Laboratorios clínicos',      'fa-vial',            'text-rose-500','bg-rose-50',309,'salud'),
  ('imagenes-medicas',       'Imágenes médicas',           'fa-x-ray',           'text-rose-500','bg-rose-50',310,'salud'),
  ('ortopedia',              'Ortopedia',                  'fa-crutch',          'text-rose-500','bg-rose-50',311,'salud'),
  ('geriatricos',            'Geriátricos',                'fa-wheelchair',      'text-rose-500','bg-rose-50',312,'salud'),
  ('medicina-alternativa',   'Medicina alternativa',       'fa-leaf',            'text-rose-500','bg-rose-50',313,'salud'),
  ('cardiologia',            'Cardiología',                'fa-heart',           'text-rose-500','bg-rose-50',314,'salud'),
  ('dermatologia',           'Dermatología',               'fa-hand-sparkles',   'text-rose-500','bg-rose-50',315,'salud'),
  ('ginecologia',            'Ginecología',                'fa-female',          'text-rose-500','bg-rose-50',316,'salud'),
  ('pediatria',              'Pediatría',                  'fa-child',           'text-rose-500','bg-rose-50',317,'salud'),
  ('oftalmologia',           'Oftalmología',               'fa-eye',             'text-rose-500','bg-rose-50',318,'salud'),
  ('traumatologia',          'Traumatología',              'fa-bone',            'text-rose-500','bg-rose-50',319,'salud'),
  ('fonoaudiologia',         'Fonoaudiología',             'fa-comment-medical', 'text-rose-500','bg-rose-50',320,'salud'),

  -- ── FINANZAS (405–499) ─────────────────────────────────────────────────
  ('casas-cambio',           'Casas de cambio',            'fa-money-bill-wave', 'text-emerald-600','bg-emerald-50',405,'finanzas'),
  ('casas-bolsa',            'Casas de bolsa',             'fa-chart-line',      'text-emerald-600','bg-emerald-50',406,'finanzas'),
  ('fintech',                'Fintech',                    'fa-mobile-alt',      'text-emerald-600','bg-emerald-50',407,'finanzas'),
  ('billeteras-electronicas','Billeteras electrónicas',    'fa-wallet',          'text-emerald-600','bg-emerald-50',408,'finanzas'),
  ('prestamos-personales',   'Préstamos personales',       'fa-hand-holding-usd','text-emerald-600','bg-emerald-50',409,'finanzas'),
  ('casas-empeno',           'Casas de empeño',            'fa-ring',            'text-emerald-600','bg-emerald-50',410,'finanzas'),
  ('procesadoras-pago',      'Procesadoras de pago',       'fa-credit-card',     'text-emerald-600','bg-emerald-50',411,'finanzas'),

  -- ── CONSTRUCCIÓN Y HOGAR (505–599) ─────────────────────────────────────
  ('plomeria',               'Plomería',                   'fa-faucet',          'text-amber-600','bg-amber-50',505,'construccion-hogar'),
  ('carpinteria',            'Carpintería',                'fa-hammer',          'text-amber-600','bg-amber-50',506,'construccion-hogar'),
  ('electricidad',           'Electricidad',               'fa-bolt',            'text-amber-600','bg-amber-50',507,'construccion-hogar'),
  ('albanileria',            'Albañilería',                'fa-trowel',          'text-amber-600','bg-amber-50',508,'construccion-hogar'),
  ('pintura',                'Pintura y revestimientos',   'fa-paint-roller',    'text-amber-600','bg-amber-50',509,'construccion-hogar'),
  ('aluminio-vidrio',        'Aluminio y vidrio',          'fa-window-maximize', 'text-amber-600','bg-amber-50',510,'construccion-hogar'),
  ('herreria',               'Herrería',                   'fa-fire',            'text-amber-600','bg-amber-50',511,'construccion-hogar'),
  ('techos',                 'Techos',                     'fa-home',            'text-amber-600','bg-amber-50',512,'construccion-hogar'),
  ('pisos-ceramicas',        'Pisos y cerámicas',          'fa-th',              'text-amber-600','bg-amber-50',513,'construccion-hogar'),
  ('aire-acondicionado',     'Aire acondicionado',         'fa-snowflake',       'text-amber-600','bg-amber-50',514,'construccion-hogar'),
  ('cerrajeria',             'Cerrajería',                 'fa-key',             'text-amber-600','bg-amber-50',515,'construccion-hogar'),
  ('jardineria',             'Jardinería y paisajismo',    'fa-leaf',            'text-amber-600','bg-amber-50',516,'construccion-hogar'),
  ('piscinas',               'Piscinas',                   'fa-swimming-pool',   'text-amber-600','bg-amber-50',517,'construccion-hogar'),
  ('mantenimiento-hogar',    'Mantenimiento de hogar',     'fa-tools',           'text-amber-600','bg-amber-50',518,'construccion-hogar'),
  ('mudanzas',               'Mudanzas',                   'fa-dolly',           'text-amber-600','bg-amber-50',519,'construccion-hogar'),
  ('reformas',               'Reformas y remodelaciones',  'fa-screwdriver',     'text-amber-600','bg-amber-50',520,'construccion-hogar'),
  ('demolicion',             'Demolición',                 'fa-hammer',          'text-amber-600','bg-amber-50',521,'construccion-hogar'),
  ('topografia',             'Topografía',                 'fa-map-marked',      'text-amber-600','bg-amber-50',522,'construccion-hogar'),
  ('loteamientos',           'Loteamientos y desarrollos', 'fa-map',             'text-amber-600','bg-amber-50',523,'construccion-hogar'),
  ('tasaciones',             'Tasaciones',                 'fa-search-dollar',   'text-amber-600','bg-amber-50',524,'construccion-hogar'),
  ('alquileres-temporarios', 'Alquileres temporarios',     'fa-calendar-alt',    'text-amber-600','bg-amber-50',525,'construccion-hogar'),
  ('admin-propiedades',      'Administración de propiedades','fa-clipboard-list','text-amber-600','bg-amber-50',526,'construccion-hogar'),
  ('domotica',               'Domótica',                   'fa-microchip',       'text-amber-600','bg-amber-50',527,'construccion-hogar'),
  ('arquitectura',           'Arquitectura',               'fa-drafting-compass','text-amber-600','bg-amber-50',528,'construccion-hogar'),
  ('ingenieria-civil',       'Ingeniería civil',           'fa-hard-hat',        'text-amber-600','bg-amber-50',529,'construccion-hogar'),

  -- ── TECNOLOGÍA (602–699) ───────────────────────────────────────────────
  ('desarrollo-software',    'Desarrollo de software',     'fa-code',            'text-violet-500','bg-violet-50',602,'tecnologia'),
  ('desarrollo-web',         'Desarrollo web',             'fa-globe',           'text-violet-500','bg-violet-50',603,'tecnologia'),
  ('apps-moviles',           'Apps móviles',               'fa-mobile-alt',      'text-violet-500','bg-violet-50',604,'tecnologia'),
  ('hosting',                'Hosting y dominios',         'fa-server',          'text-violet-500','bg-violet-50',605,'tecnologia'),
  ('soporte-tecnico',        'Soporte técnico y reparación','fa-laptop-medical','text-violet-500','bg-violet-50',606,'tecnologia'),
  ('internet-isp',           'Proveedores de internet',    'fa-wifi',            'text-violet-500','bg-violet-50',607,'tecnologia'),
  ('telefonia-celular',      'Telefonía celular',          'fa-phone',           'text-violet-500','bg-violet-50',608,'tecnologia'),
  ('camaras-seguridad',      'Cámaras de seguridad',       'fa-video',           'text-violet-500','bg-violet-50',609,'tecnologia'),
  ('cloud',                  'Servicios cloud',            'fa-cloud',           'text-violet-500','bg-violet-50',610,'tecnologia'),
  ('ciberseguridad',         'Ciberseguridad',             'fa-shield-virus',    'text-violet-500','bg-violet-50',611,'tecnologia'),
  ('ia-data',                'IA y data',                  'fa-robot',           'text-violet-500','bg-violet-50',612,'tecnologia'),
  ('streaming-av',           'Streaming y AV',             'fa-film',            'text-violet-500','bg-violet-50',613,'tecnologia'),
  ('robotica',               'Robótica',                   'fa-cogs',            'text-violet-500','bg-violet-50',614,'tecnologia'),
  ('e-sports',               'E-sports y gaming',          'fa-gamepad',         'text-violet-500','bg-violet-50',615,'tecnologia'),

  -- ── TRANSPORTE Y AUTOMOTRIZ (705–799) ──────────────────────────────────
  ('taxis',                  'Taxis',                      'fa-taxi',            'text-sky-600','bg-sky-50',705,'transporte-automotriz'),
  ('apps-transporte',        'Apps de transporte',         'fa-mobile-alt',      'text-sky-600','bg-sky-50',706,'transporte-automotriz'),
  ('omnibus',                'Buses y ómnibus',            'fa-bus',             'text-sky-600','bg-sky-50',707,'transporte-automotriz'),
  ('remis',                  'Remís y traslados',          'fa-car',             'text-sky-600','bg-sky-50',708,'transporte-automotriz'),
  ('alquiler-autos',         'Alquiler de autos',          'fa-car-alt',         'text-sky-600','bg-sky-50',709,'transporte-automotriz'),
  ('talleres-mecanicos',     'Talleres mecánicos',         'fa-wrench',          'text-sky-600','bg-sky-50',710,'transporte-automotriz'),
  ('chapa-pintura',          'Chapa y pintura',            'fa-spray-can',       'text-sky-600','bg-sky-50',711,'transporte-automotriz'),
  ('lavaderos',              'Lavaderos de autos',         'fa-soap',            'text-sky-600','bg-sky-50',712,'transporte-automotriz'),
  ('repuestos-automotores',  'Repuestos automotores',      'fa-cog',             'text-sky-600','bg-sky-50',713,'transporte-automotriz'),
  ('gomerias',               'Gomerías',                   'fa-circle-notch',    'text-sky-600','bg-sky-50',714,'transporte-automotriz'),
  ('motos',                  'Motos',                      'fa-motorcycle',      'text-sky-600','bg-sky-50',715,'transporte-automotriz'),
  ('camiones-maquinaria',    'Camiones y maquinaria pesada','fa-truck-loading',  'text-sky-600','bg-sky-50',716,'transporte-automotriz'),
  ('concesionarias',         'Concesionarias',             'fa-handshake',       'text-sky-600','bg-sky-50',717,'transporte-automotriz'),
  ('estaciones-servicio',    'Estaciones de servicio',     'fa-gas-pump',        'text-sky-600','bg-sky-50',718,'transporte-automotriz'),
  ('despachantes-aduana',    'Despachantes de aduana',     'fa-passport',        'text-sky-600','bg-sky-50',719,'transporte-automotriz'),
  ('estacionamientos',       'Estacionamientos',           'fa-parking',         'text-sky-600','bg-sky-50',720,'transporte-automotriz'),
  ('encomiendas',            'Encomiendas y paquetería',   'fa-box',             'text-sky-600','bg-sky-50',721,'transporte-automotriz'),
  ('nautica',                'Náutica',                    'fa-ship',            'text-sky-600','bg-sky-50',722,'transporte-automotriz'),
  ('aeronautica',            'Aeronáutica',                'fa-plane',           'text-sky-600','bg-sky-50',723,'transporte-automotriz'),
  ('lubricentros',           'Lubricentros',               'fa-oil-can',         'text-sky-600','bg-sky-50',724,'transporte-automotriz'),

  -- ── PROFESIONALES (806–899) ────────────────────────────────────────────
  ('diseno-grafico',         'Diseño gráfico',             'fa-palette',         'text-teal-600','bg-teal-50',806,'profesionales'),
  ('traducciones',           'Traducciones e interpretación','fa-language',      'text-teal-600','bg-teal-50',807,'profesionales'),
  ('rrhh',                   'Recursos humanos',           'fa-users',           'text-teal-600','bg-teal-50',808,'profesionales'),
  ('coaching',               'Coaching',                   'fa-user-tie',        'text-teal-600','bg-teal-50',809,'profesionales'),
  ('gestoria',               'Gestoría y trámites',        'fa-folder-open',     'text-teal-600','bg-teal-50',810,'profesionales'),
  ('investigacion-privada',  'Investigación privada',      'fa-user-secret',     'text-teal-600','bg-teal-50',811,'profesionales'),
  ('mensajeria',             'Mensajería y delivery',      'fa-envelope-open-text','text-teal-600','bg-teal-50',812,'profesionales'),
  ('eventos',                'Organización de eventos',    'fa-calendar-check',  'text-teal-600','bg-teal-50',813,'profesionales'),
  ('wedding-planners',       'Wedding planners',           'fa-ring',            'text-teal-600','bg-teal-50',814,'profesionales'),
  ('fotografia-profesional', 'Fotografía profesional',     'fa-camera-retro',    'text-teal-600','bg-teal-50',815,'profesionales'),
  ('produccion-av',          'Producción audiovisual',     'fa-video',           'text-teal-600','bg-teal-50',816,'profesionales'),
  ('investigacion-mercado',  'Investigación de mercado',   'fa-poll',            'text-teal-600','bg-teal-50',817,'profesionales'),
  ('funerarias',             'Funerarias',                 'fa-cross',           'text-teal-600','bg-teal-50',818,'profesionales'),

  -- ── INDUSTRIA (901–999) ────────────────────────────────────────────────
  ('metalurgia',             'Metalurgia',                 'fa-cog',             'text-slate-600','bg-slate-50',901,'industria'),
  ('textil',                 'Textil',                     'fa-tshirt',          'text-slate-600','bg-slate-50',902,'industria'),
  ('plasticos',              'Plásticos',                  'fa-prescription-bottle','text-slate-600','bg-slate-50',903,'industria'),
  ('madera-industrial',      'Madera industrial',          'fa-tree',            'text-slate-600','bg-slate-50',904,'industria'),
  ('imprenta',               'Imprenta',                   'fa-print',           'text-slate-600','bg-slate-50',905,'industria'),
  ('embalaje',               'Embalaje',                   'fa-box-open',        'text-slate-600','bg-slate-50',906,'industria'),
  ('reciclaje',              'Reciclaje y residuos',       'fa-recycle',         'text-slate-600','bg-slate-50',907,'industria'),
  ('quimica-industrial',     'Química industrial',         'fa-flask',           'text-slate-600','bg-slate-50',908,'industria'),
  ('ceramica-cemento',       'Cerámica y cemento',         'fa-cubes',           'text-slate-600','bg-slate-50',909,'industria'),
  ('caucho',                 'Caucho',                     'fa-circle',          'text-slate-600','bg-slate-50',910,'industria'),
  ('cuero',                  'Cuero y curtiduría',         'fa-mitten',          'text-slate-600','bg-slate-50',911,'industria'),
  ('papel-celulosa',         'Papel y celulosa',           'fa-scroll',          'text-slate-600','bg-slate-50',912,'industria'),
  ('bebidas-industria',      'Bebidas (industria)',        'fa-wine-glass',      'text-slate-600','bg-slate-50',913,'industria'),
  ('cosmetica-industria',    'Cosmética (industria)',      'fa-pump-soap',       'text-slate-600','bg-slate-50',914,'industria'),
  ('energias-renovables',    'Energías renovables',        'fa-solar-panel',     'text-slate-600','bg-slate-50',915,'industria'),

  -- ── EDUCACIÓN (1001–1099) ──────────────────────────────────────────────
  ('colegios',               'Escuelas y colegios',        'fa-school',          'text-blue-500','bg-blue-50',1001,'educacion'),
  ('jardines-infantes',      'Jardines de infantes',       'fa-child',           'text-blue-500','bg-blue-50',1002,'educacion'),
  ('universidades',          'Universidades',              'fa-university',      'text-blue-500','bg-blue-50',1003,'educacion'),
  ('institutos-terciarios',  'Institutos terciarios',      'fa-chalkboard-teacher','text-blue-500','bg-blue-50',1004,'educacion'),
  ('academias-idiomas',      'Academias de idiomas',       'fa-language',        'text-blue-500','bg-blue-50',1005,'educacion'),
  ('academias-musica',       'Academias de música',        'fa-music',           'text-blue-500','bg-blue-50',1006,'educacion'),
  ('autoescuelas',           'Autoescuelas',               'fa-car',             'text-blue-500','bg-blue-50',1007,'educacion'),
  ('cursos-online',          'Cursos online',              'fa-laptop',          'text-blue-500','bg-blue-50',1008,'educacion'),
  ('clases-particulares',    'Clases particulares',        'fa-book-reader',     'text-blue-500','bg-blue-50',1009,'educacion'),
  ('capacitacion',           'Capacitación profesional',   'fa-user-graduate',   'text-blue-500','bg-blue-50',1010,'educacion'),
  ('posgrados',              'Posgrados',                  'fa-graduation-cap',  'text-blue-500','bg-blue-50',1011,'educacion'),
  ('test-prep',              'Test prep / Idiomas internacionales','fa-clipboard-check','text-blue-500','bg-blue-50',1012,'educacion'),

  -- ── TURISMO (1101–1199) ────────────────────────────────────────────────
  ('hoteles',                'Hoteles',                    'fa-hotel',           'text-cyan-500','bg-cyan-50',1101,'turismo'),
  ('hostels',                'Hostels y posadas',          'fa-bed',             'text-cyan-500','bg-cyan-50',1102,'turismo'),
  ('apart-hotels',           'Apart-hotels',               'fa-key',             'text-cyan-500','bg-cyan-50',1103,'turismo'),
  ('agencias-viaje',         'Agencias de viaje',          'fa-suitcase',        'text-cyan-500','bg-cyan-50',1104,'turismo'),
  ('tours',                  'Tours y excursiones',        'fa-route',           'text-cyan-500','bg-cyan-50',1105,'turismo'),
  ('guias-turisticos',       'Guías turísticos',           'fa-map-signs',       'text-cyan-500','bg-cyan-50',1106,'turismo'),
  ('camping',                'Camping',                    'fa-campground',      'text-cyan-500','bg-cyan-50',1107,'turismo'),
  ('estancias',              'Estancias turísticas',       'fa-horse',           'text-cyan-500','bg-cyan-50',1108,'turismo'),
  ('operadores-receptivos',  'Operadores receptivos',      'fa-globe-americas',  'text-cyan-500','bg-cyan-50',1109,'turismo'),
  ('cabanas',                'Cabañas y posadas rurales',  'fa-tree',            'text-cyan-500','bg-cyan-50',1110,'turismo'),

  -- ── BELLEZA, DEPORTE Y LIFESTYLE (1202–1299) ───────────────────────────
  ('peluquerias',            'Peluquerías',                'fa-cut',             'text-fuchsia-500','bg-fuchsia-50',1202,'belleza-lifestyle'),
  ('barberias',              'Barberías',                  'fa-cut',             'text-fuchsia-500','bg-fuchsia-50',1203,'belleza-lifestyle'),
  ('esteticas-spa',          'Estética y spa',             'fa-spa',             'text-fuchsia-500','bg-fuchsia-50',1204,'belleza-lifestyle'),
  ('manicuria',              'Manicuría',                  'fa-hand-sparkles',   'text-fuchsia-500','bg-fuchsia-50',1205,'belleza-lifestyle'),
  ('depilacion',             'Depilación',                 'fa-wind',            'text-fuchsia-500','bg-fuchsia-50',1206,'belleza-lifestyle'),
  ('masajes',                'Masajes',                    'fa-hands',           'text-fuchsia-500','bg-fuchsia-50',1207,'belleza-lifestyle'),
  ('tatuajes',               'Tatuajes y piercing',        'fa-feather-alt',     'text-fuchsia-500','bg-fuchsia-50',1208,'belleza-lifestyle'),
  ('maquillaje-profesional', 'Maquillaje profesional',     'fa-magic',           'text-fuchsia-500','bg-fuchsia-50',1209,'belleza-lifestyle'),
  ('personal-trainers',      'Personal trainers',          'fa-dumbbell',        'text-fuchsia-500','bg-fuchsia-50',1210,'belleza-lifestyle'),
  ('gimnasios',              'Gimnasios',                  'fa-dumbbell',        'text-fuchsia-500','bg-fuchsia-50',1211,'belleza-lifestyle'),
  ('yoga-pilates',           'Yoga y pilates',             'fa-spa',             'text-fuchsia-500','bg-fuchsia-50',1212,'belleza-lifestyle'),
  ('crossfit',               'Crossfit',                   'fa-dumbbell',        'text-fuchsia-500','bg-fuchsia-50',1213,'belleza-lifestyle'),
  ('academias-danza',        'Escuelas de danza',          'fa-music',           'text-fuchsia-500','bg-fuchsia-50',1214,'belleza-lifestyle'),
  ('artes-marciales',        'Artes marciales',            'fa-fist-raised',     'text-fuchsia-500','bg-fuchsia-50',1215,'belleza-lifestyle'),
  ('natacion',               'Natación',                   'fa-swimmer',         'text-fuchsia-500','bg-fuchsia-50',1216,'belleza-lifestyle'),
  ('tenis-padel',            'Tenis y pádel',              'fa-table-tennis',    'text-fuchsia-500','bg-fuchsia-50',1217,'belleza-lifestyle'),
  ('clubes-deportivos',      'Clubes deportivos',          'fa-trophy',          'text-fuchsia-500','bg-fuchsia-50',1218,'belleza-lifestyle'),
  ('equitacion',             'Equitación',                 'fa-horse',           'text-fuchsia-500','bg-fuchsia-50',1219,'belleza-lifestyle'),
  ('wellness',               'Wellness y bienestar',       'fa-heart',           'text-fuchsia-500','bg-fuchsia-50',1220,'belleza-lifestyle'),

  -- ── AGROPECUARIO (1302–1399) ───────────────────────────────────────────
  ('produccion-agricola',    'Producción agrícola',        'fa-seedling',        'text-lime-600','bg-lime-50',1302,'agropecuario'),
  ('ganaderia',              'Ganadería',                  'fa-piggy-bank',      'text-lime-600','bg-lime-50',1303,'agropecuario'),
  ('lecheria',               'Lechería',                   'fa-mug-hot',         'text-lime-600','bg-lime-50',1304,'agropecuario'),
  ('avicultura',             'Avicultura',                 'fa-egg',             'text-lime-600','bg-lime-50',1305,'agropecuario'),
  ('apicultura',             'Apicultura',                 'fa-bug',             'text-lime-600','bg-lime-50',1306,'agropecuario'),
  ('piscicultura',           'Piscicultura',               'fa-fish',            'text-lime-600','bg-lime-50',1307,'agropecuario'),
  ('frigorificos',           'Frigoríficos',               'fa-snowflake',       'text-lime-600','bg-lime-50',1308,'agropecuario'),
  ('forestal',               'Forestal',                   'fa-tree',            'text-lime-600','bg-lime-50',1309,'agropecuario'),
  ('yerba-mate',             'Yerba mate y derivados',     'fa-leaf',            'text-lime-600','bg-lime-50',1310,'agropecuario'),
  ('tabaco',                 'Tabaco',                     'fa-smoking',         'text-lime-600','bg-lime-50',1311,'agropecuario'),
  ('granjas-haras',          'Granjas y haras',            'fa-horse',           'text-lime-600','bg-lime-50',1312,'agropecuario'),
  ('insumos-agro',           'Insumos agropecuarios',      'fa-flask',           'text-lime-600','bg-lime-50',1313,'agropecuario'),
  ('maquinaria-agricola',    'Maquinaria agrícola',        'fa-tractor',         'text-lime-600','bg-lime-50',1314,'agropecuario'),
  ('sistemas-riego',         'Sistemas de riego',          'fa-tint',            'text-lime-600','bg-lime-50',1315,'agropecuario'),
  ('inseminacion-artificial','Inseminación artificial',    'fa-syringe',         'text-lime-600','bg-lime-50',1316,'agropecuario'),

  -- ── MEDIOS Y PUBLICIDAD (1403–1499) ────────────────────────────────────
  ('agencias-publicidad',    'Agencias de publicidad',     'fa-bullhorn',        'text-purple-500','bg-purple-50',1403,'medios-publicidad'),
  ('marketing-digital',      'Marketing digital',          'fa-chart-bar',       'text-purple-500','bg-purple-50',1404,'medios-publicidad'),
  ('seo-sem',                'SEO y SEM',                  'fa-search',          'text-purple-500','bg-purple-50',1405,'medios-publicidad'),
  ('community-management',   'Community management',       'fa-comments',        'text-purple-500','bg-purple-50',1406,'medios-publicidad'),
  ('periodismo',             'Periodismo',                 'fa-newspaper',       'text-purple-500','bg-purple-50',1407,'medios-publicidad'),
  ('radio',                  'Radio',                      'fa-broadcast-tower', 'text-purple-500','bg-purple-50',1408,'medios-publicidad'),
  ('tv',                     'TV',                         'fa-tv',              'text-purple-500','bg-purple-50',1409,'medios-publicidad'),
  ('periodicos-revistas',    'Periódicos y revistas',      'fa-newspaper',       'text-purple-500','bg-purple-50',1410,'medios-publicidad'),
  ('influencers',            'Influencers y creadores',    'fa-star',            'text-purple-500','bg-purple-50',1411,'medios-publicidad'),
  ('branding',               'Branding',                   'fa-tag',             'text-purple-500','bg-purple-50',1412,'medios-publicidad'),
  ('rrpp',                   'Relaciones públicas',        'fa-handshake',       'text-purple-500','bg-purple-50',1413,'medios-publicidad')
)
INSERT INTO categories (slug, name, icon, color, bg_color, display_order, parent_id)
SELECT nk.slug, nk.name, nk.icon, nk.color, nk.bg_color, nk.display_order, p.id
FROM new_kids nk
JOIN categories p ON p.slug = nk.parent_slug
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  icon          = EXCLUDED.icon,
  color         = EXCLUDED.color,
  bg_color      = EXCLUDED.bg_color,
  display_order = EXCLUDED.display_order,
  parent_id     = EXCLUDED.parent_id;

-- ── 8. Migrar businesses.category_id → pivot (is_primary=true) ──────────────
INSERT INTO business_categories (business_id, category_id, is_primary, position)
SELECT id, category_id, TRUE, 0
FROM businesses
WHERE category_id IS NOT NULL
ON CONFLICT (business_id, category_id) DO NOTHING;

-- ── 9. Verificación final ───────────────────────────────────────────────────
SELECT
    (SELECT COUNT(*) FROM categories WHERE parent_id IS NULL)             AS padres,
    (SELECT COUNT(*) FROM categories WHERE parent_id IS NOT NULL)         AS hijos,
    (SELECT COUNT(*) FROM categories)                                     AS total_categorias,
    (SELECT COUNT(*) FROM business_categories WHERE is_primary)           AS empresas_con_primary,
    (SELECT COUNT(*) FROM business_categories)                            AS total_pivot;

COMMIT;
