# POA 2026 — documentos fuente

Sube aquí el Excel oficial del POA para el año 2026, ej. `POA_2026_V1.xlsx`. Si Operaciones entrega una versión corregida, súbela como `POA_2026_V2.xlsx` junto a la anterior — nunca se reemplaza ni se borra una versión ya subida.

Al subir un archivo nuevo, actualiza la celda "Documento vigente" en [`docs/operacion/dataset.md`](../../../dataset.md).

Formato esperado por el importador (`src/lib/poaImport/parseExcel.ts`): hoja llamada "POA INICIAL 2026", fila 2 con nombres de zona (sufijo "(presupuesto mes)"), fila 3 con subencabezados (CANT./FREC./PRECIO), datos desde la fila 4.
