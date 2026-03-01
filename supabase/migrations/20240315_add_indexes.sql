-- Add indexes to improve performance only if tables exist

DO $$ 
BEGIN
    -- 1. Items (Core)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'items') THEN
        CREATE INDEX IF NOT EXISTS idx_items_group_id ON items(group_id);
        CREATE INDEX IF NOT EXISTS idx_items_parent_id ON items(parent_id);
        CREATE INDEX IF NOT EXISTS idx_items_values_gin ON items USING GIN (values);
    END IF;

    -- 2. Grupos (Core)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'groups') THEN
        CREATE INDEX IF NOT EXISTS idx_groups_board_id ON groups(board_id);
    END IF;

    -- 3. Columnas (Core)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'board_columns') THEN
        CREATE INDEX IF NOT EXISTS idx_board_columns_board_id ON board_columns(board_id);
    END IF;

    -- 4. Dependencias (Opcional)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'task_dependencies') THEN
        CREATE INDEX IF NOT EXISTS idx_task_dependencies_board_id ON task_dependencies(board_id);
        CREATE INDEX IF NOT EXISTS idx_task_dependencies_source ON task_dependencies(source_item_id);
        CREATE INDEX IF NOT EXISTS idx_task_dependencies_target ON task_dependencies(target_item_id);
    END IF;

    -- 5. Novedades / Site Incidents (Opcional)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'site_incidents') THEN
        CREATE INDEX IF NOT EXISTS idx_site_incidents_board_id ON site_incidents(board_id);
        CREATE INDEX IF NOT EXISTS idx_site_incidents_group_id ON site_incidents(group_id);
    END IF;

    -- 6. Plantillas (Opcional)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activity_templates') THEN
        CREATE INDEX IF NOT EXISTS idx_activity_templates_name ON activity_templates(name);
    END IF;
END $$;
