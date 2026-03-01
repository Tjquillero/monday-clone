-- =================================================================
-- FIX DELETION: ADD ON DELETE CASCADE TO ALL ITEM REFERENCES
-- =================================================================
-- Si recibes un error de Foreign Key Constraint al eliminar un ítem,
-- es porque algunas tablas antiguas apuntan al ítem sin la regla CASCADE.

DO $$
DECLARE
    r record;
    drop_stmt text;
    add_stmt text;
BEGIN
    -- Busca todas las Foreign Keys que apuntan a la tabla "items"
    FOR r IN (
        SELECT 
            tc.table_name, 
            tc.constraint_name, 
            kcu.column_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.referential_constraints AS rc
              ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND rc.delete_rule <> 'CASCADE'
          AND EXISTS (
              SELECT 1 FROM information_schema.constraint_column_usage ccu
              WHERE ccu.constraint_name = tc.constraint_name
                AND ccu.table_name = 'items'
          )
    ) LOOP
        -- Construir la consulta para eliminar la restricción actual
        drop_stmt := 'ALTER TABLE public.' || quote_ident(r.table_name) || ' DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ';';
        
        -- Construir la consulta para agregarla nuevamente con ON DELETE CASCADE
        add_stmt := 'ALTER TABLE public.' || quote_ident(r.table_name) || 
                    ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                    ' FOREIGN KEY (' || quote_ident(r.column_name) || ') REFERENCES public.items(id) ON DELETE CASCADE;';
                    
        RAISE NOTICE 'Updating %: %', r.table_name, r.constraint_name;
        
        EXECUTE drop_stmt;
        EXECUTE add_stmt;
    END LOOP;
END $$;
