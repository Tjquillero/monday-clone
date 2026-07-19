import { buildImportPayload } from './buildImportPayload';
import type { ValidatedActivity } from '../types';

describe('buildImportPayload', () => {
  it('traduce camelCase a snake_case exactamente, sin transformar valores', () => {
    const activities: ValidatedActivity[] = [
      {
        activityKey: '1.01',
        descripcion: 'Limpieza manual de infraestructura costera',
        unidad: 'ML',
        precioUnitario: 1412.8795648795647,
        frecuencia: 1,
        zonas: [
          { groupId: 'group-a', cantidadContratada: 7887 },
          { groupId: 'group-b', cantidadContratada: 15000 },
        ],
      },
    ];

    expect(buildImportPayload(activities)).toEqual([
      {
        activity_key: '1.01',
        description: 'Limpieza manual de infraestructura costera',
        unit: 'ML',
        precio_unitario: 1412.8795648795647,
        frecuencia: 1,
        zonas: [
          { group_id: 'group-a', cantidad_contratada: 7887 },
          { group_id: 'group-b', cantidad_contratada: 15000 },
        ],
      },
    ]);
  });

  it('un array vacío produce un payload vacío', () => {
    expect(buildImportPayload([])).toEqual([]);
  });

  it('preserva el orden de las actividades y de las zonas dentro de cada una', () => {
    const activities: ValidatedActivity[] = [
      {
        activityKey: '2.01',
        descripcion: 'Actividad dos',
        unidad: 'M2',
        precioUnitario: 1,
        frecuencia: 1,
        zonas: [{ groupId: 'z', cantidadContratada: 1 }],
      },
      {
        activityKey: '1.01',
        descripcion: 'Actividad uno',
        unidad: 'M2',
        precioUnitario: 1,
        frecuencia: 1,
        zonas: [{ groupId: 'z', cantidadContratada: 1 }],
      },
    ];

    const payload = buildImportPayload(activities);
    expect(payload.map((a) => a.activity_key)).toEqual(['2.01', '1.01']);
  });
});
