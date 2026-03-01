-- =======================================================
-- UPDATE GROUP COLORS BASED ON ITEM CONTENTS
-- =======================================================
-- Esto asigna colores a los grupos detectando qué códigos
-- tienen los ítems dentro (bypasseando el nombre del grupo)

-- Grupo 4: Naranja (Orange)
UPDATE public.groups 
SET color = '#fdab3d' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '4.%' OR name ILIKE '4 %');

-- Grupo 5: Rojo (Red/Pink)
UPDATE public.groups 
SET color = '#e2445c' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '5.%' OR name ILIKE '5 %');

-- Grupo 6: Amarillo (Yellow)
UPDATE public.groups 
SET color = '#ffcb00' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '6.%' OR name ILIKE '6 %');

-- Grupo 7: Azul Oscuro (Dark Blue)
UPDATE public.groups 
SET color = '#0086c0' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '7.%' OR name ILIKE '7 %');

-- Grupo 8: Fucsia (Hot Pink)
UPDATE public.groups 
SET color = '#ff158a' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '8.%' OR name ILIKE '8 %');

-- Grupo 9: Verde Claro (Light Green)
UPDATE public.groups 
SET color = '#9cd326' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '9.%' OR name ILIKE '9 %');

-- Grupo 10: Morado Oscuro (Dark Purple)
UPDATE public.groups 
SET color = '#7e3b8a' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '10.%' OR name ILIKE '10 %');

-- Grupo 11: Café (Brown)
UPDATE public.groups 
SET color = '#7f5347' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '11.%' OR name ILIKE '11 %');

-- Grupo 12: Gris Oscuro (Dark Grey)
UPDATE public.groups 
SET color = '#333333' 
WHERE id IN (SELECT DISTINCT group_id FROM public.items WHERE name ILIKE '12.%' OR name ILIKE '12 %');
