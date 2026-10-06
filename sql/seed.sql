-- ============================================================
-- RetoPA — seed.sql (DATOS DE REFERENCIA)
-- Generado desde producción con pg_dump --data-only
-- Tablas: categories, cities, plans, site_config
-- ------------------------------------------------------------
-- NO incluye las empresas reales (businesses) — solo los datos
-- maestros que un entorno nuevo necesita para arrancar.
-- Cargar DESPUÉS de schema.sql:
--   docker exec -i retopa-db psql -U retopa -d retopa < sql/seed.sql
-- ============================================================

-- Desactiva validación de FK/triggers durante la carga (FK circular en categories.parent_id)
SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, slug, name, icon, color, bg_color, display_order, business_count, search_count, created_at, parent_id) FROM stdin;
4	salud	Salud y Medicina	fa-heartbeat	text-rose-500	bg-rose-50	300	2156	2804	2026-05-07 21:18:10.827122	\N
536	transporte-autos	Transporte y Autos	fa-car-side	text-sky-600	bg-sky-50	600	0	0	2026-06-05 00:34:11.298045	\N
539	belleza-bienestar	Belleza y Bienestar	fa-spa	text-fuchsia-500	bg-fuchsia-50	900	0	0	2026-06-05 00:34:11.298045	\N
540	deporte-fitness	Deporte y Fitness	fa-dumbbell	text-green-500	bg-green-50	1000	0	0	2026-06-05 00:34:11.298045	\N
541	eventos-entretenimiento	Eventos y Entretenimiento	fa-calendar-check	text-yellow-500	bg-yellow-50	1100	0	0	2026-06-05 00:34:11.298045	\N
13	alimentos	Alimentos y Bebidas	fa-apple-alt	text-yellow-600	bg-yellow-50	103	0	0	2026-05-19 02:18:21.359285	50
711	bodas	Bodas y casamientos	fa-calendar-check	text-yellow-500	bg-yellow-50	1108	0	8	2026-06-05 00:34:11.298045	541
113	casas-cambio	Casas de cambio	fa-coins	text-emerald-600	bg-emerald-50	1304	0	21	2026-05-26 02:04:19.142537	51
542	mascotas	Mascotas	fa-paw	text-lime-600	bg-lime-50	1200	0	0	2026-06-05 00:34:11.298045	\N
118	casas-empeno	Casas de empeño	fa-coins	text-emerald-600	bg-emerald-50	1308	0	21	2026-05-26 02:04:19.142537	51
787	sanatorios	Sanatorios	fa-stethoscope	text-pink-600	bg-pink-100	0	0	0	2026-06-07 15:42:41.582334	4
531	comida-bebida	Comida y Bebida	fa-utensils	text-orange-500	bg-orange-50	100	0	1	2026-06-05 00:34:11.298045	\N
1	restaurantes	Restaurantes	fa-utensils	text-orange-500	bg-orange-50	100	1240	3508	2026-05-07 21:18:10.827122	531
544	publicidad-marketing	Publicidad y Marketing	fa-bullhorn	text-purple-500	bg-purple-50	1400	0	0	2026-06-05 00:34:11.298045	\N
39	industria	Industria y Manufactura	fa-industry	text-slate-600	bg-slate-50	1500	0	0	2026-05-19 02:18:21.359285	\N
3	tecnologia	Tecnología	fa-laptop-code	text-violet-500	bg-violet-50	500	892	4121	2026-05-07 21:18:10.827122	\N
2	profesionales	Servicios Profesionales	fa-user-tie	text-teal-600	bg-teal-50	700	3850	5215	2026-05-07 21:18:10.827122	\N
14	agropecuario	Campo y Agropecuario	fa-tractor	text-lime-700	bg-lime-50	1600	0	0	2026-05-19 02:18:21.359285	\N
26	materiales	Materiales de Construcción	fa-warehouse	text-stone-500	bg-stone-100	504	0	0	2026-05-19 02:18:21.359285	52
29	transporte	Transporte	fa-truck	text-sky-600	bg-sky-50	701	0	0	2026-05-19 02:18:21.359285	53
548	servicios-empresariales	Servicios Empresariales	fa-briefcase	text-indigo-500	bg-indigo-50	1800	0	0	2026-06-05 00:34:11.298045	\N
9	automotriz	Automotriz	fa-car	text-red-600	bg-red-50	703	890	1700	2026-05-07 21:18:10.827122	53
32	combustibles	Combustibles y Energía	fa-gas-pump	text-gray-700	bg-gray-100	704	0	0	2026-05-19 02:18:21.359285	53
549	religioso-social	Religioso y Social	fa-hands-praying	text-stone-500	bg-stone-50	1900	0	0	2026-06-05 00:34:11.298045	\N
554	parrilladas	Parrilladas y asados	fa-utensils	text-orange-500	bg-orange-50	104	0	0	2026-06-05 00:34:11.298045	531
59	pastelerias	Pastelerías	fa-utensils	text-orange-500	bg-orange-50	108	0	0	2026-05-26 02:04:19.142537	531
70	bares	Bares y pubs	fa-utensils	text-orange-500	bg-orange-50	109	0	0	2026-05-26 02:04:19.142537	531
71	vinotecas	Vinotecas y licorerías	fa-utensils	text-orange-500	bg-orange-50	110	0	1	2026-05-26 02:04:19.142537	531
12	supermercados	Supermercados	fa-utensils	text-orange-500	bg-orange-50	111	0	0	2026-05-19 02:18:21.359285	531
66	despensas	Despensas y minimercados	fa-utensils	text-orange-500	bg-orange-50	112	0	0	2026-05-26 02:04:19.142537	531
67	mercados	Mercados y ferias	fa-utensils	text-orange-500	bg-orange-50	113	0	0	2026-05-26 02:04:19.142537	531
63	carnicerias	Carnicerías	fa-utensils	text-orange-500	bg-orange-50	114	0	0	2026-05-26 02:04:19.142537	531
64	pescaderias	Pescaderías y mariscos	fa-utensils	text-orange-500	bg-orange-50	115	0	0	2026-05-26 02:04:19.142537	531
65	fruterias	Fruterías y verdulerías	fa-utensils	text-orange-500	bg-orange-50	116	0	0	2026-05-26 02:04:19.142537	531
72	food-trucks	Food trucks	fa-utensils	text-orange-500	bg-orange-50	117	0	0	2026-05-26 02:04:19.142537	531
69	catering	Catering y banquetes	fa-utensils	text-orange-500	bg-orange-50	118	0	0	2026-05-26 02:04:19.142537	531
47	moda	Ropa y moda	fa-store	text-pink-500	bg-pink-50	200	0	0	2026-05-19 02:18:21.359285	6
77	electrodomesticos	Electrodomésticos	fa-store	text-pink-500	bg-pink-50	204	0	1	2026-05-26 02:04:19.142537	6
68	delivery-comida	Delivery / apps de comida	fa-motorcycle	text-orange-500	bg-orange-50	116	0	1	2026-05-26 02:04:19.142537	50
52	construccion-hogar	Construcción y Hogar	fa-hard-hat	text-amber-600	bg-amber-50	400	0	0	2026-05-26 02:04:19.142537	\N
7	educacion	Educación	fa-graduation-cap	text-blue-500	bg-blue-50	800	678	1500	2026-05-07 21:18:10.827122	\N
51	finanzas	Bancos y Finanzas	fa-coins	text-emerald-600	bg-emerald-50	1300	0	0	2026-05-26 02:04:19.142537	\N
8	turismo	Turismo y Hotelería	fa-suitcase	text-cyan-500	bg-cyan-50	1700	445	2200	2026-05-07 21:18:10.827122	\N
48	publicidad	Marketing y Publicidad	fa-bullhorn	text-orange-400	bg-orange-50	1401	0	1	2026-05-19 02:18:21.359285	55
61	comida-rapida	Comida rápida y delivery	fa-utensils	text-orange-500	bg-orange-50	101	0	1	2026-05-26 02:04:19.142537	531
62	comida-tipica	Comida típica paraguaya	fa-utensils	text-orange-500	bg-orange-50	102	0	2	2026-05-26 02:04:19.142537	531
50	gastronomia	Gastronomía	fa-utensils	text-orange-500	bg-orange-50	100	0	0	2026-05-26 02:04:19.142537	\N
53	transporte-automotriz	Transporte y Automotriz	fa-car-side	text-sky-600	bg-sky-50	700	0	0	2026-05-26 02:04:19.142537	\N
55	medios-publicidad	Medios y Comunicación	fa-bullhorn	text-purple-500	bg-purple-50	1400	0	0	2026-05-26 02:04:19.142537	\N
6	comercios	Tiendas y Comercios	fa-store	text-pink-500	bg-pink-50	200	4230	3315	2026-05-07 21:18:10.827122	\N
10	belleza	Belleza y Cuidado Personal	fa-spa	text-fuchsia-500	bg-fuchsia-50	1201	1120	2608	2026-05-07 21:18:10.827122	54
49	medios	Medios y Comunicación	fa-newspaper	text-slate-500	bg-slate-50	1402	0	0	2026-05-19 02:18:21.359285	55
82	mascotas-tienda	Tienda de mascotas	fa-bone	text-pink-500	bg-pink-50	213	0	0	2026-05-26 02:04:19.142537	6
83	tabaquerias	Tabaquerías	fa-smoking	text-pink-500	bg-pink-50	214	0	0	2026-05-26 02:04:19.142537	6
87	instrumentos-musicales	Instrumentos musicales	fa-guitar	text-pink-500	bg-pink-50	218	0	0	2026-05-26 02:04:19.142537	6
89	bicicleterias	Bicicleterías	fa-bicycle	text-pink-500	bg-pink-50	220	0	0	2026-05-26 02:04:19.142537	6
54	belleza-lifestyle	Belleza, Deporte y Lifestyle	fa-spa	text-fuchsia-500	bg-fuchsia-50	1200	0	1	2026-05-26 02:04:19.142537	\N
75	papelerias	Papelerías	fa-pencil-alt	text-pink-500	bg-pink-50	206	0	1	2026-05-26 02:04:19.142537	6
60	pizzerias	Pizzerías	fa-utensils	text-orange-500	bg-orange-50	103	0	0	2026-05-26 02:04:19.142537	531
56	cafeterias	Cafeterías	fa-utensils	text-orange-500	bg-orange-50	105	0	1	2026-05-26 02:04:19.142537	531
57	panaderias	Panaderías y confiterías	fa-utensils	text-orange-500	bg-orange-50	106	0	1	2026-05-26 02:04:19.142537	531
58	heladerias	Heladerías	fa-utensils	text-orange-500	bg-orange-50	107	0	0	2026-05-26 02:04:19.142537	531
101	laboratorios-clinicos	Laboratorios clínicos	fa-vial	text-rose-500	bg-rose-50	309	0	0	2026-05-26 02:04:19.142537	4
103	ortopedia	Ortopedia	fa-crutch	text-rose-500	bg-rose-50	311	0	0	2026-05-26 02:04:19.142537	4
112	fonoaudiologia	Fonoaudiología	fa-comment-medical	text-rose-500	bg-rose-50	320	0	0	2026-05-26 02:04:19.142537	4
94	calzados	Calzados	fa-store	text-pink-500	bg-pink-50	201	0	0	2026-05-26 02:04:19.142537	6
93	lenceria	Lencería y ropa interior	fa-store	text-pink-500	bg-pink-50	202	0	0	2026-05-26 02:04:19.142537	6
95	ropa-infantil	Ropa infantil	fa-store	text-pink-500	bg-pink-50	203	0	0	2026-05-26 02:04:19.142537	6
117	prestamos-personales	Préstamos personales	fa-hand-holding-usd	text-emerald-600	bg-emerald-50	409	0	0	2026-05-26 02:04:19.142537	51
78	electronica	Electrónica y celulares	fa-store	text-pink-500	bg-pink-50	205	0	1	2026-05-26 02:04:19.142537	6
119	procesadoras-pago	Procesadoras de pago	fa-credit-card	text-emerald-600	bg-emerald-50	411	0	0	2026-05-26 02:04:19.142537	51
76	mueblerias	Mueblerías	fa-store	text-pink-500	bg-pink-50	206	0	0	2026-05-26 02:04:19.142537	6
135	reformas	Reformas y remodelaciones	fa-screwdriver	text-amber-600	bg-amber-50	520	0	0	2026-05-26 02:04:19.142537	52
136	demolicion	Demolición	fa-hammer	text-amber-600	bg-amber-50	521	0	0	2026-05-26 02:04:19.142537	52
137	topografia	Topografía	fa-map-marked	text-amber-600	bg-amber-50	522	0	0	2026-05-26 02:04:19.142537	52
139	tasaciones	Tasaciones	fa-search-dollar	text-amber-600	bg-amber-50	524	0	0	2026-05-26 02:04:19.142537	52
140	alquileres-temporarios	Alquileres temporarios	fa-calendar-alt	text-amber-600	bg-amber-50	525	0	0	2026-05-26 02:04:19.142537	52
141	admin-propiedades	Administración de propiedades	fa-clipboard-list	text-amber-600	bg-amber-50	526	0	0	2026-05-26 02:04:19.142537	52
144	ingenieria-civil	Ingeniería civil	fa-hard-hat	text-amber-600	bg-amber-50	529	0	0	2026-05-26 02:04:19.142537	52
147	apps-moviles	Apps móviles	fa-mobile-alt	text-violet-500	bg-violet-50	604	0	0	2026-05-26 02:04:19.142537	3
85	decoracion-hogar	Decoración y hogar	fa-store	text-pink-500	bg-pink-50	207	0	0	2026-05-26 02:04:19.142537	6
151	telefonia-celular	Telefonía celular	fa-phone	text-violet-500	bg-violet-50	608	0	0	2026-05-26 02:04:19.142537	3
86	bazar	Bazar	fa-store	text-pink-500	bg-pink-50	208	0	0	2026-05-26 02:04:19.142537	6
157	robotica	Robótica	fa-cogs	text-violet-500	bg-violet-50	614	0	0	2026-05-26 02:04:19.142537	3
162	remis	Remís y traslados	fa-car	text-sky-600	bg-sky-50	708	0	0	2026-05-26 02:04:19.142537	53
167	repuestos-automotores	Repuestos automotores	fa-cog	text-sky-600	bg-sky-50	713	0	0	2026-05-26 02:04:19.142537	53
170	camiones-maquinaria	Camiones y maquinaria pesada	fa-truck-loading	text-sky-600	bg-sky-50	716	0	0	2026-05-26 02:04:19.142537	53
177	aeronautica	Aeronáutica	fa-plane	text-sky-600	bg-sky-50	723	0	0	2026-05-26 02:04:19.142537	53
74	librerias	Librerías y papelerías	fa-store	text-pink-500	bg-pink-50	209	0	0	2026-05-26 02:04:19.142537	6
184	investigacion-privada	Investigación privada	fa-user-secret	text-teal-600	bg-teal-50	811	0	0	2026-05-26 02:04:19.142537	2
186	eventos	Organización de eventos	fa-calendar-check	text-teal-600	bg-teal-50	813	0	0	2026-05-26 02:04:19.142537	2
187	wedding-planners	Wedding planners	fa-ring	text-teal-600	bg-teal-50	814	0	0	2026-05-26 02:04:19.142537	2
199	quimica-industrial	Química industrial	fa-flask	text-slate-600	bg-slate-50	908	0	0	2026-05-26 02:04:19.142537	39
200	ceramica-cemento	Cerámica y cemento	fa-cubes	text-slate-600	bg-slate-50	909	0	0	2026-05-26 02:04:19.142537	39
201	caucho	Caucho	fa-circle	text-slate-600	bg-slate-50	910	0	0	2026-05-26 02:04:19.142537	39
202	cuero	Cuero y curtiduría	fa-mitten	text-slate-600	bg-slate-50	911	0	0	2026-05-26 02:04:19.142537	39
205	cosmetica-industria	Cosmética (industria)	fa-pump-soap	text-slate-600	bg-slate-50	914	0	0	2026-05-26 02:04:19.142537	39
210	institutos-terciarios	Institutos terciarios	fa-chalkboard-teacher	text-blue-500	bg-blue-50	1004	0	0	2026-05-26 02:04:19.142537	7
188	fotografia-profesional	Fotografía profesional	fa-camera-retro	text-teal-600	bg-teal-50	815	0	1	2026-05-26 02:04:19.142537	2
203	papel-celulosa	Papel y celulosa	fa-scroll	text-slate-600	bg-slate-50	912	0	1	2026-05-26 02:04:19.142537	39
73	jugueterias	Jugueterías	fa-store	text-pink-500	bg-pink-50	210	0	6	2026-05-26 02:04:19.142537	6
217	posgrados	Posgrados	fa-graduation-cap	text-blue-500	bg-blue-50	1011	0	0	2026-05-26 02:04:19.142537	7
218	test-prep	Test prep / Idiomas internacionales	fa-clipboard-check	text-blue-500	bg-blue-50	1012	0	0	2026-05-26 02:04:19.142537	7
227	operadores-receptivos	Operadores receptivos	fa-globe-americas	text-cyan-500	bg-cyan-50	1109	0	0	2026-05-26 02:04:19.142537	8
80	joyerias	Joyerías y relojerías	fa-store	text-pink-500	bg-pink-50	211	0	0	2026-05-26 02:04:19.142537	6
248	produccion-agricola	Producción agrícola	fa-seedling	text-lime-600	bg-lime-50	1302	0	0	2026-05-26 02:04:19.142537	14
250	lecheria	Lechería	fa-mug-hot	text-lime-600	bg-lime-50	1304	0	0	2026-05-26 02:04:19.142537	14
257	tabaco	Tabaco	fa-smoking	text-lime-600	bg-lime-50	1311	0	0	2026-05-26 02:04:19.142537	14
258	granjas-haras	Granjas y haras	fa-horse	text-lime-600	bg-lime-50	1312	0	0	2026-05-26 02:04:19.142537	14
259	insumos-agro	Insumos agropecuarios	fa-flask	text-lime-600	bg-lime-50	1313	0	0	2026-05-26 02:04:19.142537	14
261	sistemas-riego	Sistemas de riego	fa-tint	text-lime-600	bg-lime-50	1315	0	0	2026-05-26 02:04:19.142537	14
262	inseminacion-artificial	Inseminación artificial	fa-syringe	text-lime-600	bg-lime-50	1316	0	0	2026-05-26 02:04:19.142537	14
267	periodismo	Periodismo	fa-newspaper	text-purple-500	bg-purple-50	1407	0	0	2026-05-26 02:04:19.142537	55
270	periodicos-revistas	Periódicos y revistas	fa-newspaper	text-purple-500	bg-purple-50	1410	0	0	2026-05-26 02:04:19.142537	55
271	influencers	Influencers y creadores	fa-star	text-purple-500	bg-purple-50	1411	0	0	2026-05-26 02:04:19.142537	55
81	opticas	Ópticas	fa-store	text-pink-500	bg-pink-50	212	0	1	2026-05-26 02:04:19.142537	6
274	coleccionables	Coleccionables	fa-star	text-pink-400	bg-pink-50	0	0	0	2026-05-26 02:39:37.580046	6
231	esteticas-spa	Estética y spa	fa-spa	text-fuchsia-500	bg-fuchsia-50	1204	0	1	2026-05-26 02:04:19.142537	54
216	capacitacion	Capacitación profesional	fa-user-graduate	text-blue-500	bg-blue-50	1010	0	1	2026-05-26 02:04:19.142537	7
236	maquillaje-profesional	Maquillaje profesional	fa-magic	text-fuchsia-500	bg-fuchsia-50	1209	0	1	2026-05-26 02:04:19.142537	54
114	casas-bolsa	Casas de bolsa	fa-chart-line	text-emerald-600	bg-emerald-50	406	0	21	2026-05-26 02:04:19.142537	51
116	billeteras-electronicas	Billeteras electrónicas	fa-wallet	text-emerald-600	bg-emerald-50	408	0	2	2026-05-26 02:04:19.142537	51
16	farmacias	Farmacias	fa-heartbeat	text-rose-500	bg-rose-50	303	0	21	2026-05-19 02:18:21.359285	4
90	florerias	Florerías	fa-store	text-pink-500	bg-pink-50	213	0	0	2026-05-26 02:04:19.142537	6
79	perfumerias	Perfumerías	fa-store	text-pink-500	bg-pink-50	214	0	0	2026-05-26 02:04:19.142537	6
88	articulos-deportivos	Artículos deportivos	fa-store	text-pink-500	bg-pink-50	215	0	0	2026-05-26 02:04:19.142537	6
585	instrumentos	Instrumentos musicales	fa-store	text-pink-500	bg-pink-50	216	0	0	2026-06-05 00:34:11.298045	6
84	regaleria	Regalería	fa-store	text-pink-500	bg-pink-50	217	0	0	2026-05-26 02:04:19.142537	6
92	segunda-mano	Usados y segunda mano	fa-store	text-pink-500	bg-pink-50	218	0	0	2026-05-26 02:04:19.142537	6
41	importadoras	Importadoras	fa-store	text-pink-500	bg-pink-50	219	0	0	2026-05-19 02:18:21.359285	6
91	ecommerce	Tiendas online	fa-store	text-pink-500	bg-pink-50	220	0	0	2026-05-26 02:04:19.142537	6
17	hospitales	Clínicas y hospitales	fa-heartbeat	text-rose-500	bg-rose-50	300	0	2	2026-05-19 02:18:21.359285	4
96	consultorios-medicos	Consultorios médicos	fa-heartbeat	text-rose-500	bg-rose-50	301	0	0	2026-05-26 02:04:19.142537	4
97	odontologia	Odontología	fa-heartbeat	text-rose-500	bg-rose-50	302	0	0	2026-05-26 02:04:19.142537	4
98	psicologia	Psicología	fa-heartbeat	text-rose-500	bg-rose-50	304	0	0	2026-05-26 02:04:19.142537	4
99	kinesiologia	Kinesiología y fisioterapia	fa-heartbeat	text-rose-500	bg-rose-50	305	0	0	2026-05-26 02:04:19.142537	4
100	nutricion	Nutrición	fa-heartbeat	text-rose-500	bg-rose-50	306	0	0	2026-05-26 02:04:19.142537	4
597	laboratorios	Laboratorios clínicos	fa-heartbeat	text-rose-500	bg-rose-50	307	0	0	2026-06-05 00:34:11.298045	4
102	imagenes-medicas	Rayos X e imágenes médicas	fa-heartbeat	text-rose-500	bg-rose-50	308	0	1	2026-05-26 02:04:19.142537	4
109	pediatria	Pediatría	fa-heartbeat	text-rose-500	bg-rose-50	309	0	0	2026-05-26 02:04:19.142537	4
108	ginecologia	Ginecología y obstetricia	fa-heartbeat	text-rose-500	bg-rose-50	310	0	0	2026-05-26 02:04:19.142537	4
106	cardiologia	Cardiología	fa-heartbeat	text-rose-500	bg-rose-50	311	0	0	2026-05-26 02:04:19.142537	4
107	dermatologia	Dermatología	fa-heartbeat	text-rose-500	bg-rose-50	312	0	0	2026-05-26 02:04:19.142537	4
110	oftalmologia	Oftalmología	fa-heartbeat	text-rose-500	bg-rose-50	313	0	0	2026-05-26 02:04:19.142537	4
111	traumatologia	Traumatología	fa-heartbeat	text-rose-500	bg-rose-50	314	0	0	2026-05-26 02:04:19.142537	4
104	geriatricos	Geriátricos y cuidado mayor	fa-heartbeat	text-rose-500	bg-rose-50	315	0	0	2026-05-26 02:04:19.142537	4
105	medicina-alternativa	Medicina alternativa	fa-heartbeat	text-rose-500	bg-rose-50	316	0	0	2026-05-26 02:04:19.142537	4
18	veterinarias	Veterinarias	fa-heartbeat	text-rose-500	bg-rose-50	317	0	0	2026-05-19 02:18:21.359285	4
5	construccion	Constructoras	fa-hard-hat	text-amber-600	bg-amber-50	400	1534	1900	2026-05-07 21:18:10.827122	52
143	arquitectura	Arquitectura	fa-hard-hat	text-amber-600	bg-amber-50	401	0	0	2026-05-26 02:04:19.142537	52
24	inmobiliarias	Inmobiliarias	fa-hard-hat	text-amber-600	bg-amber-50	402	0	0	2026-05-19 02:18:21.359285	52
120	plomeria	Plomería	fa-hard-hat	text-amber-600	bg-amber-50	403	0	2	2026-05-26 02:04:19.142537	52
122	electricidad	Electricidad	fa-hard-hat	text-amber-600	bg-amber-50	404	0	1	2026-05-26 02:04:19.142537	52
123	albanileria	Albañilería	fa-hard-hat	text-amber-600	bg-amber-50	405	0	2	2026-05-26 02:04:19.142537	52
124	pintura	Pintura y revestimientos	fa-hard-hat	text-amber-600	bg-amber-50	406	0	1	2026-05-26 02:04:19.142537	52
121	carpinteria	Carpintería	fa-hard-hat	text-amber-600	bg-amber-50	407	0	1	2026-05-26 02:04:19.142537	52
126	herreria	Herrería y metalurgia	fa-hard-hat	text-amber-600	bg-amber-50	408	0	0	2026-05-26 02:04:19.142537	52
125	aluminio-vidrio	Aluminio y vidrio	fa-hard-hat	text-amber-600	bg-amber-50	409	0	0	2026-05-26 02:04:19.142537	52
127	techos	Techos y cubiertas	fa-hard-hat	text-amber-600	bg-amber-50	410	0	0	2026-05-26 02:04:19.142537	52
128	pisos-ceramicas	Pisos y cerámicas	fa-hard-hat	text-amber-600	bg-amber-50	411	0	1	2026-05-26 02:04:19.142537	52
129	aire-acondicionado	Aire acondicionado	fa-hard-hat	text-amber-600	bg-amber-50	412	0	0	2026-05-26 02:04:19.142537	52
130	cerrajeria	Cerrajería	fa-hard-hat	text-amber-600	bg-amber-50	413	0	0	2026-05-26 02:04:19.142537	52
131	jardineria	Jardinería y paisajismo	fa-hard-hat	text-amber-600	bg-amber-50	414	0	0	2026-05-26 02:04:19.142537	52
132	piscinas	Piscinas	fa-hard-hat	text-amber-600	bg-amber-50	415	0	0	2026-05-26 02:04:19.142537	52
133	mantenimiento-hogar	Mantenimiento y reparaciones	fa-hard-hat	text-amber-600	bg-amber-50	416	0	0	2026-05-26 02:04:19.142537	52
134	mudanzas	Mudanzas	fa-hard-hat	text-amber-600	bg-amber-50	417	0	0	2026-05-26 02:04:19.142537	52
142	domotica	Domótica y automatización	fa-hard-hat	text-amber-600	bg-amber-50	418	0	0	2026-05-26 02:04:19.142537	52
25	ferreterias	Ferreterías y materiales	fa-hard-hat	text-amber-600	bg-amber-50	419	0	3	2026-05-19 02:18:21.359285	52
138	loteamientos	Loteamientos y terrenos	fa-hard-hat	text-amber-600	bg-amber-50	420	0	0	2026-05-26 02:04:19.142537	52
629	alquileres	Alquileres	fa-hard-hat	text-amber-600	bg-amber-50	421	0	0	2026-06-05 00:34:11.298045	52
145	desarrollo-software	Desarrollo de software	fa-laptop-code	text-violet-500	bg-violet-50	500	0	0	2026-05-26 02:04:19.142537	3
146	desarrollo-web	Páginas web y apps	fa-laptop-code	text-violet-500	bg-violet-50	501	0	0	2026-05-26 02:04:19.142537	3
149	soporte-tecnico	Soporte técnico y reparación	fa-laptop-code	text-violet-500	bg-violet-50	502	0	1	2026-05-26 02:04:19.142537	3
150	internet-isp	Proveedores de internet	fa-laptop-code	text-violet-500	bg-violet-50	503	0	0	2026-05-26 02:04:19.142537	3
148	hosting	Hosting y dominios	fa-laptop-code	text-violet-500	bg-violet-50	504	0	1	2026-05-26 02:04:19.142537	3
152	camaras-seguridad	Cámaras y seguridad	fa-laptop-code	text-violet-500	bg-violet-50	505	0	1	2026-05-26 02:04:19.142537	3
28	telecomunicaciones	Telecomunicaciones	fa-laptop-code	text-violet-500	bg-violet-50	506	0	0	2026-05-19 02:18:21.359285	3
153	cloud	Servicios cloud	fa-laptop-code	text-violet-500	bg-violet-50	507	0	0	2026-05-26 02:04:19.142537	3
154	ciberseguridad	Ciberseguridad	fa-laptop-code	text-violet-500	bg-violet-50	508	0	0	2026-05-26 02:04:19.142537	3
155	ia-data	Inteligencia artificial y datos	fa-laptop-code	text-violet-500	bg-violet-50	509	0	0	2026-05-26 02:04:19.142537	3
156	streaming-av	Streaming y audiovisual	fa-laptop-code	text-violet-500	bg-violet-50	510	0	0	2026-05-26 02:04:19.142537	3
158	e-sports	Gaming y e-sports	fa-laptop-code	text-violet-500	bg-violet-50	511	0	0	2026-05-26 02:04:19.142537	3
164	talleres-mecanicos	Talleres mecánicos	fa-car-side	text-sky-600	bg-sky-50	600	0	0	2026-05-26 02:04:19.142537	536
171	concesionarias	Concesionarias	fa-car-side	text-sky-600	bg-sky-50	601	0	0	2026-05-26 02:04:19.142537	536
644	repuestos	Repuestos y accesorios	fa-car-side	text-sky-600	bg-sky-50	602	0	0	2026-06-05 00:34:11.298045	536
168	gomerias	Gomerías	fa-car-side	text-sky-600	bg-sky-50	603	0	0	2026-05-26 02:04:19.142537	536
165	chapa-pintura	Chapa y pintura	fa-car-side	text-sky-600	bg-sky-50	604	0	0	2026-05-26 02:04:19.142537	536
166	lavaderos	Lavaderos de autos	fa-car-side	text-sky-600	bg-sky-50	605	0	0	2026-05-26 02:04:19.142537	536
178	lubricentros	Lubricentros	fa-car-side	text-sky-600	bg-sky-50	606	0	0	2026-05-26 02:04:19.142537	536
169	motos	Motos y accesorios	fa-car-side	text-sky-600	bg-sky-50	607	0	0	2026-05-26 02:04:19.142537	536
159	taxis	Taxis y remises	fa-car-side	text-sky-600	bg-sky-50	608	0	0	2026-05-26 02:04:19.142537	536
160	apps-transporte	Apps de transporte	fa-car-side	text-sky-600	bg-sky-50	609	0	0	2026-05-26 02:04:19.142537	536
161	omnibus	Buses y ómnibus	fa-car-side	text-sky-600	bg-sky-50	610	0	0	2026-05-26 02:04:19.142537	536
163	alquiler-autos	Alquiler de autos	fa-car-side	text-sky-600	bg-sky-50	611	0	0	2026-05-26 02:04:19.142537	536
30	logistica	Logística y fletes	fa-car-side	text-sky-600	bg-sky-50	612	0	0	2026-05-19 02:18:21.359285	536
175	encomiendas	Encomiendas y paquetería	fa-car-side	text-sky-600	bg-sky-50	613	0	0	2026-05-26 02:04:19.142537	536
172	estaciones-servicio	Estaciones de servicio	fa-car-side	text-sky-600	bg-sky-50	614	0	0	2026-05-26 02:04:19.142537	536
174	estacionamientos	Estacionamientos	fa-car-side	text-sky-600	bg-sky-50	615	0	0	2026-05-26 02:04:19.142537	536
176	nautica	Náutica	fa-car-side	text-sky-600	bg-sky-50	616	0	0	2026-05-26 02:04:19.142537	536
173	despachantes-aduana	Despachantes de aduana	fa-car-side	text-sky-600	bg-sky-50	617	0	0	2026-05-26 02:04:19.142537	536
34	juridico	Abogados y escribanos	fa-user-tie	text-teal-600	bg-teal-50	700	0	0	2026-05-19 02:18:21.359285	2
35	contabilidad	Contadores y auditoría	fa-user-tie	text-teal-600	bg-teal-50	701	0	0	2026-05-19 02:18:21.359285	2
36	consultoras	Consultoría empresarial	fa-user-tie	text-teal-600	bg-teal-50	702	0	0	2026-05-19 02:18:21.359285	2
181	rrhh	Recursos humanos	fa-user-tie	text-teal-600	bg-teal-50	703	0	0	2026-05-26 02:04:19.142537	2
183	gestoria	Gestoría y trámites	fa-user-tie	text-teal-600	bg-teal-50	704	0	0	2026-05-26 02:04:19.142537	2
179	diseno-grafico	Diseño gráfico	fa-user-tie	text-teal-600	bg-teal-50	705	0	0	2026-05-26 02:04:19.142537	2
180	traducciones	Traducciones	fa-user-tie	text-teal-600	bg-teal-50	706	0	2	2026-05-26 02:04:19.142537	2
182	coaching	Coaching y mentoring	fa-user-tie	text-teal-600	bg-teal-50	707	0	0	2026-05-26 02:04:19.142537	2
190	investigacion-mercado	Investigación de mercado	fa-user-tie	text-teal-600	bg-teal-50	708	0	0	2026-05-26 02:04:19.142537	2
21	seguros	Seguros	fa-user-tie	text-teal-600	bg-teal-50	709	0	0	2026-05-19 02:18:21.359285	2
185	mensajeria	Mensajería y delivery	fa-user-tie	text-teal-600	bg-teal-50	710	0	0	2026-05-26 02:04:19.142537	2
38	limpieza	Limpieza y fumigación	fa-user-tie	text-teal-600	bg-teal-50	711	0	0	2026-05-19 02:18:21.359285	2
37	seguridad	Seguridad y vigilancia	fa-user-tie	text-teal-600	bg-teal-50	712	0	0	2026-05-19 02:18:21.359285	2
191	funerarias	Funerarias y cementerios	fa-user-tie	text-teal-600	bg-teal-50	713	0	0	2026-05-26 02:04:19.142537	2
207	colegios	Colegios y escuelas	fa-graduation-cap	text-blue-500	bg-blue-50	800	0	0	2026-05-26 02:04:19.142537	7
208	jardines-infantes	Jardines de infantes	fa-graduation-cap	text-blue-500	bg-blue-50	801	0	0	2026-05-26 02:04:19.142537	7
209	universidades	Universidades	fa-graduation-cap	text-blue-500	bg-blue-50	802	0	0	2026-05-26 02:04:19.142537	7
677	institutos	Institutos terciarios	fa-graduation-cap	text-blue-500	bg-blue-50	803	0	0	2026-06-05 00:34:11.298045	7
211	academias-idiomas	Academias de idiomas	fa-graduation-cap	text-blue-500	bg-blue-50	804	0	0	2026-05-26 02:04:19.142537	7
214	cursos-online	Cursos y capacitación online	fa-graduation-cap	text-blue-500	bg-blue-50	805	0	0	2026-05-26 02:04:19.142537	7
215	clases-particulares	Clases particulares	fa-graduation-cap	text-blue-500	bg-blue-50	806	0	0	2026-05-26 02:04:19.142537	7
213	autoescuelas	Autoescuelas	fa-graduation-cap	text-blue-500	bg-blue-50	807	0	0	2026-05-26 02:04:19.142537	7
212	academias-musica	Academias de música y arte	fa-graduation-cap	text-blue-500	bg-blue-50	808	0	0	2026-05-26 02:04:19.142537	7
229	peluquerias	Peluquerías	fa-spa	text-fuchsia-500	bg-fuchsia-50	900	0	3	2026-05-26 02:04:19.142537	539
230	barberias	Barberías	fa-spa	text-fuchsia-500	bg-fuchsia-50	901	0	0	2026-05-26 02:04:19.142537	539
685	esteticas	Estéticas y spa	fa-spa	text-fuchsia-500	bg-fuchsia-50	902	0	0	2026-06-05 00:34:11.298045	539
232	manicuria	Manicuría y pedicuría	fa-spa	text-fuchsia-500	bg-fuchsia-50	903	0	0	2026-05-26 02:04:19.142537	539
233	depilacion	Depilación	fa-spa	text-fuchsia-500	bg-fuchsia-50	904	0	0	2026-05-26 02:04:19.142537	539
234	masajes	Masajes y relajación	fa-spa	text-fuchsia-500	bg-fuchsia-50	905	0	0	2026-05-26 02:04:19.142537	539
235	tatuajes	Tatuajes y piercing	fa-spa	text-fuchsia-500	bg-fuchsia-50	906	0	0	2026-05-26 02:04:19.142537	539
690	maquillaje	Maquillaje profesional	fa-spa	text-fuchsia-500	bg-fuchsia-50	907	0	0	2026-06-05 00:34:11.298045	539
691	belleza-movil	Belleza a domicilio	fa-spa	text-fuchsia-500	bg-fuchsia-50	908	0	0	2026-06-05 00:34:11.298045	539
238	gimnasios	Gimnasios	fa-dumbbell	text-green-500	bg-green-50	1000	0	0	2026-05-26 02:04:19.142537	540
237	personal-trainers	Personal trainers	fa-dumbbell	text-green-500	bg-green-50	1001	0	1	2026-05-26 02:04:19.142537	540
239	yoga-pilates	Yoga y pilates	fa-dumbbell	text-green-500	bg-green-50	1002	0	0	2026-05-26 02:04:19.142537	540
240	crossfit	Crossfit	fa-dumbbell	text-green-500	bg-green-50	1003	0	0	2026-05-26 02:04:19.142537	540
243	natacion	Natación	fa-dumbbell	text-green-500	bg-green-50	1004	0	0	2026-05-26 02:04:19.142537	540
242	artes-marciales	Artes marciales	fa-dumbbell	text-green-500	bg-green-50	1005	0	1	2026-05-26 02:04:19.142537	540
244	tenis-padel	Tenis y pádel	fa-dumbbell	text-green-500	bg-green-50	1006	0	0	2026-05-26 02:04:19.142537	540
245	clubes-deportivos	Clubes deportivos	fa-dumbbell	text-green-500	bg-green-50	1007	0	1	2026-05-26 02:04:19.142537	540
241	academias-danza	Danza y baile	fa-dumbbell	text-green-500	bg-green-50	1008	0	0	2026-05-26 02:04:19.142537	540
246	equitacion	Equitación	fa-dumbbell	text-green-500	bg-green-50	1009	0	0	2026-05-26 02:04:19.142537	540
247	wellness	Wellness y bienestar	fa-dumbbell	text-green-500	bg-green-50	1010	0	0	2026-05-26 02:04:19.142537	540
703	salon-eventos	Salones de eventos	fa-calendar-check	text-yellow-500	bg-yellow-50	1100	0	0	2026-06-05 00:34:11.298045	541
704	organizadores	Organizadores de eventos	fa-calendar-check	text-yellow-500	bg-yellow-50	1101	0	0	2026-06-05 00:34:11.298045	541
705	catering-eventos	Catering para eventos	fa-calendar-check	text-yellow-500	bg-yellow-50	1102	0	0	2026-06-05 00:34:11.298045	541
706	musica-en-vivo	Música en vivo y DJs	fa-calendar-check	text-yellow-500	bg-yellow-50	1103	0	0	2026-06-05 00:34:11.298045	541
707	fotografia	Fotografía y video	fa-calendar-check	text-yellow-500	bg-yellow-50	1104	0	0	2026-06-05 00:34:11.298045	541
708	animacion-infantil	Animación infantil	fa-calendar-check	text-yellow-500	bg-yellow-50	1105	0	0	2026-06-05 00:34:11.298045	541
709	alquiler-equipos	Alquiler de equipos y sonido	fa-calendar-check	text-yellow-500	bg-yellow-50	1106	0	0	2026-06-05 00:34:11.298045	541
710	quinceanos	Quinceaños	fa-calendar-check	text-yellow-500	bg-yellow-50	1107	0	0	2026-06-05 00:34:11.298045	541
712	shows-artistas	Shows y artistas	fa-calendar-check	text-yellow-500	bg-yellow-50	1109	0	0	2026-06-05 00:34:11.298045	541
713	cines-teatros	Cines y teatros	fa-calendar-check	text-yellow-500	bg-yellow-50	1110	0	0	2026-06-05 00:34:11.298045	541
714	veterinarias-mascotas	Veterinarias	fa-paw	text-lime-600	bg-lime-50	1200	0	0	2026-06-05 00:34:11.298045	542
715	peluqueria-canina	Peluquería canina y felina	fa-paw	text-lime-600	bg-lime-50	1201	0	0	2026-06-05 00:34:11.298045	542
716	tienda-mascotas	Tiendas de mascotas	fa-paw	text-lime-600	bg-lime-50	1202	0	0	2026-06-05 00:34:11.298045	542
717	adiestramiento	Adiestramiento	fa-paw	text-lime-600	bg-lime-50	1203	0	0	2026-06-05 00:34:11.298045	542
718	guarderia-mascotas	Guardería y hotel de mascotas	fa-paw	text-lime-600	bg-lime-50	1204	0	0	2026-06-05 00:34:11.298045	542
719	alimentos-mascotas	Alimentos para mascotas	fa-paw	text-lime-600	bg-lime-50	1205	0	0	2026-06-05 00:34:11.298045	542
19	bancos	Bancos	fa-coins	text-emerald-600	bg-emerald-50	1300	0	0	2026-05-19 02:18:21.359285	51
22	cooperativas	Cooperativas	fa-coins	text-emerald-600	bg-emerald-50	1301	0	0	2026-05-19 02:18:21.359285	51
20	financieras	Financieras	fa-coins	text-emerald-600	bg-emerald-50	1302	0	0	2026-05-19 02:18:21.359285	51
723	seguros-financiero	Seguros	fa-coins	text-emerald-600	bg-emerald-50	1303	0	0	2026-06-05 00:34:11.298045	51
725	billeteras	Billeteras electrónicas	fa-coins	text-emerald-600	bg-emerald-50	1305	0	0	2026-06-05 00:34:11.298045	51
115	fintech	Fintech	fa-coins	text-emerald-600	bg-emerald-50	1306	0	0	2026-05-26 02:04:19.142537	51
727	prestamos	Préstamos personales	fa-coins	text-emerald-600	bg-emerald-50	1307	0	0	2026-06-05 00:34:11.298045	51
729	bolsa-valores	Bolsa y valores	fa-coins	text-emerald-600	bg-emerald-50	1309	0	0	2026-06-05 00:34:11.298045	51
263	agencias-publicidad	Agencias de publicidad	fa-bullhorn	text-purple-500	bg-purple-50	1400	0	0	2026-05-26 02:04:19.142537	544
264	marketing-digital	Marketing digital	fa-bullhorn	text-purple-500	bg-purple-50	1401	0	1	2026-05-26 02:04:19.142537	544
265	seo-sem	SEO / SEM y posicionamiento	fa-bullhorn	text-purple-500	bg-purple-50	1402	0	0	2026-05-26 02:04:19.142537	544
266	community-management	Redes sociales	fa-bullhorn	text-purple-500	bg-purple-50	1403	0	0	2026-05-26 02:04:19.142537	544
272	branding	Branding e identidad	fa-bullhorn	text-purple-500	bg-purple-50	1404	0	0	2026-05-26 02:04:19.142537	544
196	imprenta	Imprenta y gigantografías	fa-bullhorn	text-purple-500	bg-purple-50	1405	0	0	2026-05-26 02:04:19.142537	544
736	rotulados	Rotulados y cartelería	fa-bullhorn	text-purple-500	bg-purple-50	1406	0	0	2026-06-05 00:34:11.298045	544
189	produccion-av	Producción audiovisual	fa-bullhorn	text-purple-500	bg-purple-50	1407	0	0	2026-05-26 02:04:19.142537	544
268	radio	Radio	fa-bullhorn	text-purple-500	bg-purple-50	1408	0	0	2026-05-26 02:04:19.142537	544
269	tv	TV y medios digitales	fa-bullhorn	text-purple-500	bg-purple-50	1409	0	0	2026-05-26 02:04:19.142537	544
273	rrpp	Relaciones públicas	fa-bullhorn	text-purple-500	bg-purple-50	1410	0	1	2026-05-26 02:04:19.142537	544
192	metalurgia	Metalurgia y tornería	fa-industry	text-slate-600	bg-slate-50	1500	0	0	2026-05-26 02:04:19.142537	39
193	textil	Textil y confecciones	fa-industry	text-slate-600	bg-slate-50	1501	0	0	2026-05-26 02:04:19.142537	39
194	plasticos	Plásticos	fa-industry	text-slate-600	bg-slate-50	1502	0	0	2026-05-26 02:04:19.142537	39
195	madera-industrial	Madera y muebles industriales	fa-industry	text-slate-600	bg-slate-50	1503	0	0	2026-05-26 02:04:19.142537	39
745	imprenta-industrial	Imprenta industrial	fa-industry	text-slate-600	bg-slate-50	1504	0	0	2026-06-05 00:34:11.298045	39
197	embalaje	Embalaje y packaging	fa-industry	text-slate-600	bg-slate-50	1505	0	0	2026-05-26 02:04:19.142537	39
198	reciclaje	Reciclaje y residuos	fa-industry	text-slate-600	bg-slate-50	1506	0	0	2026-05-26 02:04:19.142537	39
748	quimica	Química e insumos	fa-industry	text-slate-600	bg-slate-50	1507	0	0	2026-06-05 00:34:11.298045	39
206	energias-renovables	Energías renovables	fa-industry	text-slate-600	bg-slate-50	1508	0	0	2026-05-26 02:04:19.142537	39
204	bebidas-industria	Bebidas industriales	fa-industry	text-slate-600	bg-slate-50	1509	0	0	2026-05-26 02:04:19.142537	39
751	agricultura	Agricultura y cultivos	fa-tractor	text-lime-700	bg-lime-50	1600	0	0	2026-06-05 00:34:11.298045	14
249	ganaderia	Ganadería	fa-tractor	text-lime-700	bg-lime-50	1601	0	0	2026-05-26 02:04:19.142537	14
251	avicultura	Avicultura y pollerías	fa-tractor	text-lime-700	bg-lime-50	1602	0	0	2026-05-26 02:04:19.142537	14
253	piscicultura	Criaderos de peces	fa-tractor	text-lime-700	bg-lime-50	1603	0	0	2026-05-26 02:04:19.142537	14
254	frigorificos	Frigoríficos	fa-tractor	text-lime-700	bg-lime-50	1604	0	0	2026-05-26 02:04:19.142537	14
260	maquinaria-agricola	Maquinaria agrícola	fa-tractor	text-lime-700	bg-lime-50	1605	0	0	2026-05-26 02:04:19.142537	14
40	agroquimica	Agroquímica e insumos	fa-tractor	text-lime-700	bg-lime-50	1606	0	0	2026-05-19 02:18:21.359285	14
255	forestal	Forestal y madera	fa-tractor	text-lime-700	bg-lime-50	1607	0	0	2026-05-26 02:04:19.142537	14
226	estancias	Estancias y campos	fa-tractor	text-lime-700	bg-lime-50	1608	0	1	2026-05-26 02:04:19.142537	14
252	apicultura	Apicultura	fa-tractor	text-lime-700	bg-lime-50	1609	0	0	2026-05-26 02:04:19.142537	14
256	yerba-mate	Yerba mate y derivados	fa-tractor	text-lime-700	bg-lime-50	1610	0	0	2026-05-26 02:04:19.142537	14
219	hoteles	Hoteles	fa-suitcase	text-cyan-500	bg-cyan-50	1700	0	0	2026-05-26 02:04:19.142537	8
220	hostels	Hostels y posadas	fa-suitcase	text-cyan-500	bg-cyan-50	1701	0	0	2026-05-26 02:04:19.142537	8
221	apart-hotels	Apart-hotels y departamentos	fa-suitcase	text-cyan-500	bg-cyan-50	1702	0	0	2026-05-26 02:04:19.142537	8
222	agencias-viaje	Agencias de viaje	fa-suitcase	text-cyan-500	bg-cyan-50	1703	0	0	2026-05-26 02:04:19.142537	8
223	tours	Tours y excursiones	fa-suitcase	text-cyan-500	bg-cyan-50	1704	0	0	2026-05-26 02:04:19.142537	8
225	camping	Camping y ecoturismo	fa-suitcase	text-cyan-500	bg-cyan-50	1705	0	0	2026-05-26 02:04:19.142537	8
768	estancias-turisticas	Estancias turísticas	fa-suitcase	text-cyan-500	bg-cyan-50	1706	0	0	2026-06-05 00:34:11.298045	8
228	cabanas	Cabañas rurales	fa-suitcase	text-cyan-500	bg-cyan-50	1707	0	0	2026-05-26 02:04:19.142537	8
224	guias-turisticos	Guías turísticos	fa-suitcase	text-cyan-500	bg-cyan-50	1708	0	0	2026-05-26 02:04:19.142537	8
771	coworking	Coworking y oficinas	fa-briefcase	text-indigo-500	bg-indigo-50	1800	0	0	2026-06-05 00:34:11.298045	548
772	call-center	Call centers y BPO	fa-briefcase	text-indigo-500	bg-indigo-50	1801	0	0	2026-06-05 00:34:11.298045	548
773	outsourcing-it	Outsourcing IT	fa-briefcase	text-indigo-500	bg-indigo-50	1802	0	0	2026-06-05 00:34:11.298045	548
774	auditoria	Auditoría y compliance	fa-briefcase	text-indigo-500	bg-indigo-50	1803	0	0	2026-06-05 00:34:11.298045	548
775	franquicias	Franquicias	fa-briefcase	text-indigo-500	bg-indigo-50	1804	0	0	2026-06-05 00:34:11.298045	548
776	distribuidoras	Distribuidoras	fa-briefcase	text-indigo-500	bg-indigo-50	1805	0	0	2026-06-05 00:34:11.298045	548
42	exportadoras	Exportadoras	fa-briefcase	text-indigo-500	bg-indigo-50	1806	0	0	2026-05-19 02:18:21.359285	548
778	importadoras-b2b	Importadoras B2B	fa-briefcase	text-indigo-500	bg-indigo-50	1807	0	0	2026-06-05 00:34:11.298045	548
779	capacitacion-corp	Capacitación corporativa	fa-briefcase	text-indigo-500	bg-indigo-50	1808	0	0	2026-06-05 00:34:11.298045	548
780	software-empresarial	Software empresarial / ERP	fa-briefcase	text-indigo-500	bg-indigo-50	1809	0	0	2026-06-05 00:34:11.298045	548
781	iglesias	Iglesias y templos	fa-hands-praying	text-stone-500	bg-stone-50	1900	0	0	2026-06-05 00:34:11.298045	549
782	ongs	ONGs y fundaciones	fa-hands-praying	text-stone-500	bg-stone-50	1901	0	0	2026-06-05 00:34:11.298045	549
783	beneficencia	Beneficencia y voluntariado	fa-hands-praying	text-stone-500	bg-stone-50	1902	0	0	2026-06-05 00:34:11.298045	549
784	clubes-sociales	Clubes sociales	fa-hands-praying	text-stone-500	bg-stone-50	1903	0	0	2026-06-05 00:34:11.298045	549
785	sindicatos	Sindicatos y gremios	fa-hands-praying	text-stone-500	bg-stone-50	1904	0	0	2026-06-05 00:34:11.298045	549
786	cementerios	Cementerios y parques	fa-hands-praying	text-stone-500	bg-stone-50	1905	0	0	2026-06-05 00:34:11.298045	549
\.


--
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cities (id, name, department, slug, lat, lng, is_active, search_count, created_at) FROM stdin;
1	Asunción	Asunción	asuncion	-25.26370000	-57.57590000	t	0	2026-05-08 20:00:23.135813
2	Luque	Central	luque	-25.27000000	-57.48330000	t	0	2026-05-08 20:00:23.135813
3	San Lorenzo	Central	san-lorenzo	-25.34000000	-57.52000000	t	0	2026-05-08 20:00:23.135813
4	Fernando de la Mora	Central	fernando-de-la-mora	-25.32000000	-57.58000000	t	0	2026-05-08 20:00:23.135813
5	Lambaré	Central	lambaré	-25.34000000	-57.62000000	t	0	2026-05-08 20:00:23.135813
6	Capiatá	Central	capiata	-25.35000000	-57.42000000	t	0	2026-05-08 20:00:23.135813
7	Areguá	Central	aregua	-25.30000000	-57.42000000	t	0	2026-05-08 20:00:23.135813
8	Itauguá	Central	itaugua	-25.38000000	-57.33000000	t	0	2026-05-08 20:00:23.135813
10	Limpio	Central	limpio	-25.16000000	-57.58000000	t	0	2026-05-08 20:00:23.135813
12	Villa Elisa	Central	villa-elisa	-25.37000000	-57.57000000	t	0	2026-05-08 20:00:23.135813
13	Itá	Central	ita	-25.40000000	-57.42000000	t	0	2026-05-08 20:00:23.135813
14	Ypané	Central	ypane	-25.45000000	-57.52000000	t	0	2026-05-08 20:00:23.135813
15	Guarambaré	Central	guarambare	-25.48000000	-57.47000000	t	0	2026-05-08 20:00:23.135813
16	Ñemby	Central	nemby-2	-25.39000000	-57.54000000	t	0	2026-05-08 20:00:23.135813
18	Ciudad del Este	Alto Paraná	ciudad-del-este	-25.51670000	-54.61670000	t	0	2026-05-08 20:00:23.142639
19	Presidente Franco	Alto Paraná	presidente-franco	-25.53330000	-54.61670000	t	0	2026-05-08 20:00:23.142639
20	Minga Guazú	Alto Paraná	minga-guazu	-25.56670000	-54.75000000	t	0	2026-05-08 20:00:23.142639
21	Hernandarias	Alto Paraná	hernandarias	-25.41670000	-54.63330000	t	0	2026-05-08 20:00:23.142639
22	Encarnación	Itapúa	encarnacion	-27.33000000	-55.88000000	t	0	2026-05-08 20:00:23.147624
23	Coronel Bogado	Itapúa	coronel-bogado	-27.16670000	-56.25000000	t	0	2026-05-08 20:00:23.147624
24	Carmen del Paraná	Itapúa	carmen-del-parana	-27.23330000	-55.95000000	t	0	2026-05-08 20:00:23.147624
25	Obligado	Itapúa	obligado	-27.35000000	-55.65000000	t	0	2026-05-08 20:00:23.147624
26	Caacupé	Cordillera	caacupe	-25.38330000	-57.13330000	t	0	2026-05-08 20:00:23.152615
27	Atyrá	Cordillera	atyra	-25.28330000	-57.16670000	t	0	2026-05-08 20:00:23.152615
28	San Bernardino	Cordillera	san-bernardino	-25.30000000	-57.30000000	t	0	2026-05-08 20:00:23.152615
29	Altos	Cordillera	altos	-25.25000000	-57.25000000	t	0	2026-05-08 20:00:23.152615
30	Concepción	Concepción	concepcion	-23.40000000	-57.43330000	t	0	2026-05-08 20:00:23.156445
31	Horqueta	Concepción	horqueta	-23.35000000	-57.05000000	t	0	2026-05-08 20:00:23.156445
32	Loreto	Concepción	loreto	-23.26670000	-57.18330000	t	0	2026-05-08 20:00:23.156445
33	Villarrica	Guairá	villarrica	-25.75000000	-56.43330000	t	0	2026-05-08 20:00:23.161159
35	Coronel Oviedo	Caaguazú	coronel-oviedo	-25.45000000	-56.43330000	t	0	2026-05-08 20:00:23.165701
36	Caaguazú	Caaguazú	caaguazu	-25.38330000	-56.00000000	t	0	2026-05-08 20:00:23.165701
37	Doctor Juan Manuel Frutos	Caaguazú	doctor-juan-manuel-frutos	-25.38330000	-55.88330000	t	0	2026-05-08 20:00:23.165701
39	San Estanislao	San Pedro	san-estanislao	-24.91670000	-56.43330000	t	0	2026-05-08 20:00:23.170222
40	Capiibary	San Pedro	capiibary	-24.80000000	-56.03330000	t	0	2026-05-08 20:00:23.170222
41	San Ignacio	Misiones	san-ignacio	-26.88330000	-57.13330000	t	0	2026-05-08 20:00:23.174521
42	Santa Rosa	Misiones	santa-rosa	-26.88330000	-55.53330000	t	0	2026-05-08 20:00:23.174521
43	Ayolas	Misiones	ayolas	-27.40000000	-56.83330000	t	0	2026-05-08 20:00:23.174521
44	Yabebyry	Misiones	yabebyry	-27.36670000	-57.28330000	t	0	2026-05-08 20:00:23.174521
45	Pilar	Ñeembucú	pilar	-26.86670000	-58.30000000	t	0	2026-05-08 20:00:23.181603
46	Alberdi	Ñeembucú	alberdi	-26.18330000	-58.13330000	t	0	2026-05-08 20:00:23.181603
47	Pedro Juan Caballero	Amambay	pedro-juan-caballero	-22.53330000	-55.75000000	t	0	2026-05-08 20:00:23.185499
48	Capitán Bado	Amambay	capitan-bado	-23.26670000	-55.53330000	t	0	2026-05-08 20:00:23.185499
49	Salto del Guairá	Canindeyú	salto-del-guaira	-24.06670000	-54.30000000	t	0	2026-05-08 20:00:23.18959
50	Curuguaty	Canindeyú	curuguaty	-23.20000000	-55.68330000	t	0	2026-05-08 20:00:23.18959
51	Villa Hayes	Presidente Hayes	villa-hayes	-25.10000000	-57.56670000	t	0	2026-05-08 20:00:23.193332
52	Benjamín Aceval	Presidente Hayes	benjamin-aceval	-24.96670000	-57.56670000	t	0	2026-05-08 20:00:23.193332
53	Filadelfia	Boquerón	filadelfia	-22.35000000	-60.03330000	t	0	2026-05-08 20:00:23.197598
54	Mariscal Estigarribia	Boquerón	mariscal-estigarribia	-22.03330000	-60.61670000	t	0	2026-05-08 20:00:23.197598
55	Fuerte Olimpo	Alto Paraguay	fuerte-olimpo	-21.03330000	-57.86670000	t	0	2026-05-08 20:00:23.201693
57	Hohenau	Itapúa	hohenau	-27.08319790	-55.64794070	t	0	2026-05-18 14:26:28.309601
9	Mariano Roque Alonso	Central	mariano-roque-alonso	-25.22000000	-57.53000000	t	0	2026-05-08 20:00:23.135813
11	Ñemby	Central	nemby	-25.39000000	-57.54000000	t	0	2026-05-08 20:00:23.135813
17	J. Augusto Saldívar	Central	julian-augusto-saldivar	-25.42000000	-57.45000000	t	0	2026-05-08 20:00:23.135813
34	Mbocayaty del Guairá	Guairá	mbocayaty	-25.71670000	-56.46670000	t	0	2026-05-08 20:00:23.161159
38	San Pedro del Ycuamandiyú	San Pedro	san-pedro-de-ycuamandiyu	-24.10000000	-57.08330000	t	0	2026-05-08 20:00:23.170222
58	Fram	Itapúa	fram	\N	\N	t	0	2026-06-01 20:54:11.753376
59	Santa Rita	Alto Paraná	santa-rita	\N	\N	t	0	2026-06-01 20:54:11.753376
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plans (id, name, subtitle, price, features, is_featured, is_active, display_order, button_label, created_at, updated_at, max_categories, max_gallery, max_social, max_tags, has_whatsapp, has_hours, has_gallery, has_map, has_social, has_reviews_reply, priority_boost, max_promotions) FROM stdin;
basic	Ficha Básica	Empezá a existir	0	["Perfil en RETOPA", "WhatsApp", "Horarios", "Ubicación en mapa", "Presencia en búsquedas", "-Sin landing", "-Sin KPIs"]	f	t	0	Registrá tu negocio gratis	2026-05-18 15:39:51.989409	2026-06-08 20:08:44.505344	1	0	0	2	t	f	f	f	f	f	0	0
featured	Negocio Destacado	Hacé que te encuentren primero	199000	["Perfil destacado", "Prioridad en búsquedas", "Botón WhatsApp prioritario", "Más fotos", "Badge “Destacado”", "Mini landing dentro de RETOPA", "Estadísticas básicas"]	t	t	0	Quiero destacar mi negocio	2026-05-18 15:39:51.989409	2026-06-08 20:08:44.505344	3	3	2	5	t	t	t	t	t	f	3	0
premium	Business Pro	Convertí visitas en oportunidades reales	299000	["Todo lo de \\"Negocio Destacado\\"", "Dashboard dinámico", "KPIs en tiempo real", "Visitas al perfil", "Clics en WhatsApp", "Zonas con más visitas", "Ranking en categoría", "Tendencias mensuales"]	f	t	0	Quiero crecer con RetoPA	2026-05-18 15:39:51.989409	2026-06-08 20:08:44.505344	5	6	6	10	t	t	t	t	t	t	7	1
\.


--
-- Data for Name: site_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.site_config (key, value, updated_at) FROM stdin;
notify_cc	comercial@hepta.com.py	2026-06-09 00:52:34.239858
notify_body		2026-06-09 00:52:34.239589
notify_subject	{{nombre}} ya está en {{sitio}} — reclamá tu perfil	2026-06-09 00:52:34.240953
smtp_host	mail.hepta.internal	2026-06-09 00:52:39.158149
smtp_port	587	2026-06-09 00:52:39.158297
smtp_secure	false	2026-06-09 00:52:39.158475
smtp_user	no-reply@retopa.com.py	2026-06-09 00:52:39.173825
footer_col3_title	Servicios	2026-05-30 00:44:19.626616
smtp_from	no-reply@retopa.com.py	2026-06-09 00:52:39.17777
plans_title	Planes para cada negocio	2026-05-29 00:26:19.944024
plans_label	Precios	2026-05-29 00:26:19.944513
plans_desc	Desde la ficha básica hasta la presencia digital completa. Sin contratos, cancelá cuando quieras.	2026-05-29 00:26:19.94646
smtp_from_name	RetoPA No Reply	2026-06-09 00:52:39.178196
footer_col2_title	Directorio	2026-05-30 00:44:19.627103
footer_col4_links	[{"label":"HEPTA GROUP","url":"https://www.hepta.com.py/"},{"label":"Planes y precios","url":"#planes"},{"label":"Contacto","url":"#contacto"}]	2026-05-30 00:44:19.627429
site_url	https://retopa.com.py	2026-05-30 00:44:45.833639
site_name	RetoPA	2026-05-30 00:44:45.832453
site_tagline	Lo que necesitás!	2026-05-30 00:44:45.835242
site_title	RetoPA — Directorio Comercial de Paraguay	2026-05-30 00:44:45.83695
contact_email	contacto@retopa.com.py	2026-05-30 00:44:45.837616
social_facebook	https://www.facebook.com/share/1Ct4tRZ9uB/?mibextid=wwXIfr	2026-05-30 00:44:45.836968
contact_phone	595985605737	2026-05-30 00:44:45.837395
social_instagram	https://instagram.com/retopapy	2026-05-30 00:44:45.838725
services_desc	RETOPA te ayuda a **aparecer, destacar y crecer** en internet.	2026-05-28 00:42:17.557091
services_title	Tu negocio merece más clientes	2026-05-28 00:42:17.557333
services_label	Soluciones	2026-05-28 00:42:17.557973
social_whatsapp	595986484905	2026-05-30 00:44:45.839002
social_linkedin		2026-05-30 00:44:45.839685
whatsapp_url	https://wa.me/message/D4ECE637AD6XG1	2026-05-30 00:44:45.840551
whatsapp_message	¡Hola! Te contacto desde RetoPA ({url}) por tu negocio *{empresa}*.\n\nMe gustaría obtener más información.	2026-05-30 00:44:45.843326
google_maps_key	AIzaSyByXKK1WRBrt7y-OpKxVaGIxuvTLmPzFaQ	2026-05-30 00:44:45.843601
hero_title	¡Todo el Paraguay	2026-05-30 02:53:05.131126
hero_description	Encontrá empresas, negocios y profesionales por **RUC**, categoría, nombre o ubicación. Y si tenés un negocio, **hacelo crecer** con nuestros servicios digitales.	2026-05-30 02:53:05.132613
hero_subtitle	en un solo lugar!	2026-05-30 02:53:05.131842
smtp_pass	Hepta.2021*	2026-05-28 01:23:42.61468
hero_cta_text	Registrar mi empresa	2026-05-30 02:53:05.131647
hero_cta_link	#registro	2026-05-30 02:53:05.133383
hero_bg_from	#0f2554	2026-05-30 02:53:05.134857
hero_bg_to	#5279b7	2026-05-30 02:53:05.136063
leads_emails	leads@retopa.com.py,leads@hepta.com.py	2026-05-29 20:40:25.307107
notify_cooldown_days	18	2026-06-07 21:22:00.733473
tpl_newReview_subject	⭐ Nueva reseña en {{empresa}} — {{rating}}/5	2026-06-07 23:47:46.883234
tpl_newReview_body	Hola {{duenio}},\\n\\n{{autor}} dejó una reseña de {{rating}} estrellas en {{empresa}}.\\n\\n"{{comentario}}"\\n\\nEntrá al panel para verla y responderla.	2026-06-07 23:47:46.883234
tpl_likeMilestone_subject	🎉 ¡{{empresa}} alcanzó {{likes}} likes en RetoPA!	2026-06-07 23:47:46.883234
footer_copyright	© 2026 Powered by HEPTA GROUP. Todos los derechos reservados.	2026-05-30 00:44:19.617334
footer_tagline	El directorio comercial más completo de Paraguay.	2026-05-30 00:44:19.621436
footer_col4_title	Empresa	2026-05-30 00:44:19.622957
footer_col2_links	[{"label":"Buscar empresas","url":"#directorio"},{"label":"Categorías","url":"#categorias"},{"label":"Registrar empresa","url":"#registro"}]	2026-05-30 00:44:19.624321
footer_col3_links	[{"label":"Sitios Web","url":"#"},{"label":"CRM","url":"#"},{"label":"ERP","url":"#"},{"label":"Email Empresarial","url":"#"}]	2026-05-30 00:44:19.625512
tpl_likeMilestone_body	Hola {{duenio}},\\n\\n{{empresa}} acaba de alcanzar {{likes}} likes. ¡Tu negocio está gustando!	2026-06-07 23:47:46.883234
tpl_whatsappContact_subject	📱 Alguien quiso contactar a {{empresa}} por WhatsApp	2026-06-07 23:47:46.883234
tpl_whatsappContact_body	Hola {{duenio}},\\n\\nAlguien encontró {{empresa}} en RetoPA y hizo clic en WhatsApp para contactarte.	2026-06-07 23:47:46.883234
tpl_weeklySummary_subject	📊 Tu semana en RetoPA — {{empresa}}	2026-06-07 23:47:46.883234
tpl_weeklySummary_body	Hola {{duenio}},\\n\\nEsta es tu actividad de la semana en {{empresa}}:\\n\\n👁 Visitas: {{visitas}}\\n📱 Contactos WhatsApp: {{whatsapp}}\\n❤️ Likes: {{likes}}\\n⭐ Reseñas: {{resenias}}	2026-06-07 23:47:46.883234
tpl_claimReceived_subject	⏳ Recibimos tu solicitud — {{empresa}} en RetoPA	2026-06-07 23:47:46.883234
tpl_claimReceived_body	Hola {{nombre}},\\n\\nRecibimos tu solicitud para reclamar el perfil de {{empresa}}. Nuestro equipo verificará tu identidad en 24-48 horas hábiles.	2026-06-07 23:47:46.883234
tpl_claimApproved_subject	🎉 ¡Tu perfil fue verificado! — {{empresa}} en RetoPA	2026-06-07 23:47:46.883234
tpl_claimApproved_body	Hola {{nombre}},\\n\\n¡Felicitaciones! El perfil de {{empresa}} fue verificado exitosamente. Ya podés ingresar al panel y gestionar tu empresa.	2026-06-07 23:47:46.883234
tpl_welcome_subject	¡Bienvenido a {{sitio}}!	2026-06-07 23:47:46.883234
tpl_welcome_body	Hola {{nombre}},\\n\\nBienvenido a {{sitio}}. Tu cuenta fue creada exitosamente.	2026-06-07 23:47:46.883234
tpl_passwordReset_subject	🔐 Restablecer contraseña — {{sitio}}	2026-06-07 23:47:46.883234
tpl_passwordReset_body	Hola {{nombre}},\\n\\nRecibimos una solicitud para restablecer tu contraseña. Hacé clic en el link para continuar. El link expira en 1 hora.	2026-06-07 23:47:46.883234
tpl_verified_subject	✅ Tu empresa ha sido verificada en {{sitio}}	2026-06-07 23:55:16.716837
tpl_verified_body	Hola {{nombre}},\n\n¡Felicitaciones! Tu empresa {{empresa}} ha sido VERIFICADA exitosamente en {{sitio}}.\n\nAhora aparecés con el badge de verificación en el directorio y tenés mayor visibilidad en las búsquedas.\n\nPodés ver tu perfil público en: {{url_empresa}}	2026-06-07 23:55:16.716837
tpl_notifyBiz_subject	{{nombre}} ya está en {{sitio}} — reclamá tu perfil	2026-06-07 23:55:16.716837
tpl_notifyBiz_body	Hola,\n\nEncontramos a {{nombre}} en nuestras fuentes de datos y ya creamos un perfil en {{sitio}}.\n\n¿Es tu empresa? Reclamá y verificá tu perfil gratis para aparecer primero en los resultados de búsqueda, completar descripción, fotos, horarios y más.	2026-06-07 23:55:16.716837
promo_buy_url		2026-06-08 19:42:24.584718
promo_boost_7d_price	30000	2026-06-08 17:32:36.092054
promo_boost_7d_days	7	2026-06-08 20:08:44.544766
promo_boost_7d_url	https://www.tpago.com.py/links?alias=PEQKR38271&commerce_branch_name=HEPTANET&reference_id=RetoPABoost7d	2026-06-08 20:08:44.544766
promo_boost_15d_price	60000	2026-06-08 17:32:36.092054
promo_boost_15d_days	15	2026-06-08 20:08:44.544766
promo_boost_15d_url	https://www.tpago.com.py/links?alias=PARGQ59187&commerce_branch_name=HEPTANET&reference_id=RetoPABoost15d	2026-06-08 20:08:44.544766
promo_boost_home_price	100000	2026-06-08 17:32:36.092054
promo_boost_home_days	30	2026-06-08 20:08:44.544766
promo_boost_home_url	https://www.tpago.com.py/links?alias=PTAQK80259&commerce_branch_name=HEPTANET&reference_id=RetoPABoost30d	2026-06-08 20:08:44.544766
\.


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 787, true);


--
-- Name: cities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cities_id_seq', 59, true);


--
-- PostgreSQL database dump complete
--


-- Reactivar validación normal
SET session_replication_role = DEFAULT;
