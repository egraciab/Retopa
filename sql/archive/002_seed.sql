INSERT INTO cities (name, department)
VALUES
('Asunción', 'Capital')
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug)
VALUES
('Restaurantes', 'restaurantes'),
('Farmacias', 'farmacias'),
('Ferreterías', 'ferreterias'),
('Supermercados', 'supermercados'),
('Talleres', 'talleres'),
('Clínicas', 'clinicas'),
('Hoteles', 'hoteles'),
('Abogados', 'abogados')
ON CONFLICT (slug) DO NOTHING;
