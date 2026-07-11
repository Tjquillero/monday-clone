import { buildImportPayload } from './buildImportPayload';
import type { ValidatedActivity } from '../types';

describe('buildImportPayload', () => {
  it('traduce camelCase a snake_case exactamente, sin transformar valores', () => {
    const activities: ValidatedActivity[] = [
      {
        activityKey: '1.01',
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
      { activityKey: '2.01', precioUnitario: 1, frecuencia: 1, zonas: [{ groupId: 'z', cantidadContratada: 1 }] },
      { activityKey: '1.01', precioUnitario: 1, frecuencia: 1, zonas: [{ groupId: 'z', cantidadContratada: 1 }] },
    ];

    const payload = buildImportPayload(activities);
    expect(payload.map((a) => a.activity_key)).toEqual(['2.01', '1.01']);
  });
});
