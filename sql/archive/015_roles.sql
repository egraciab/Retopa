-- ============================================
-- RETOPA — Sprint B: Roles de usuario
-- Jerarquía: godmode > admin > client > user
-- ============================================

-- Asegurarse que la columna role existe con el default correcto
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';

-- Agregar índice en role para queries de autorización
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Ver usuarios actuales y sus roles
SELECT id, name, email, role, is_active, created_at
FROM users
ORDER BY 
    CASE role 
        WHEN 'godmode' THEN 1 
        WHEN 'admin'   THEN 2 
        WHEN 'client'  THEN 3 
        ELSE 4 
    END, created_at;
