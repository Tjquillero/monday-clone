-- ==========================================
-- UPDATE GROUP COLORS TO MONDAY.COM PALETTE
-- ==========================================

-- Grupo 4: Naranja (Orange)
UPDATE public.groups 
SET color = '#fdab3d' 
WHERE title ILIKE 'Grupo 4%' OR title ILIKE '4%';

-- Grupo 5: Rojo (Red/Pink)
UPDATE public.groups 
SET color = '#e2445c' 
WHERE title ILIKE 'Grupo 5%' OR title ILIKE '5%';

-- Grupo 6: Amarillo (Yellow)
UPDATE public.groups 
SET color = '#ffcb00' 
WHERE title ILIKE 'Grupo 6%' OR title ILIKE '6%';

-- Grupo 7: Azul Oscuro (Dark Blue)
UPDATE public.groups 
SET color = '#0086c0' 
WHERE title ILIKE 'Grupo 7%' OR title ILIKE '7%';

-- Grupo 8: Fucsia (Hot Pink)
UPDATE public.groups 
SET color = '#ff158a' 
WHERE title ILIKE 'Grupo 8%' OR title ILIKE '8%';

-- Grupo 9: Verde Claro (Light Green)
UPDATE public.groups 
SET color = '#9cd326' 
WHERE title ILIKE 'Grupo 9%' OR title ILIKE '9%';

-- Grupo 10: Morado Oscuro (Dark Purple)
UPDATE public.groups 
SET color = '#7e3b8a' 
WHERE title ILIKE 'Grupo 10%' OR title ILIKE '10%';

-- Grupo 11: Café (Brown)
UPDATE public.groups 
SET color = '#7f5347' 
WHERE title ILIKE 'Grupo 11%' OR title ILIKE '11%';

-- Grupo 12: Gris Oscuro (Dark Grey)
UPDATE public.groups 
SET color = '#333333' 
WHERE title ILIKE 'Grupo 12%' OR title ILIKE '12%';

-- Grupo 13+ (Opcional, repetir colores o usar genericos)
