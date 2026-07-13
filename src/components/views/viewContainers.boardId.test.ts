import fs from 'fs';
import path from 'path';

// Guarda estructural contra el bug real encontrado en 2026-07-13: seis
// ViewContainer llamaban a useBoard() SIN boardId, así que ignoraban por
// completo cuál board estaba en la URL y mostraban siempre "el board más
// recientemente creado en toda la base de datos" — mientras el título de
// la página (que sí resolvía el boardId correctamente) mentía sobre cuál
// board se estaba viendo. El fix fue mecánico (inyectar boardId como prop
// y pasarlo a useBoard(boardId)), pero el patrón roto es fácil de
// reintroducir copiando un container viejo — de ahí esta prueba a nivel de
// código fuente, no de comportamiento en runtime.
//
// Solo cubre los containers realmente montados desde dashboard/page.tsx.
// AssessmentViewContainer/CalendarViewContainer/ChartViewContainer NO están
// cableados ahí (código muerto, fuera de alcance) — deliberadamente no se
// incluyen aquí.
const WIRED_VIEW_CONTAINERS = [
  'BoardViewContainer.tsx',
  'ExecutionViewContainer.tsx',
  'FinancialViewContainer.tsx',
  'KanbanViewContainer.tsx',
  'ReportsViewContainer.tsx',
  'DashboardViewContainer.tsx',
];

const VIEWS_DIR = path.join(__dirname);

describe('ViewContainers activos — deben propagar boardId a useBoard()', () => {
  for (const fileName of WIRED_VIEW_CONTAINERS) {
    it(`${fileName} no llama a useBoard() sin argumento`, () => {
      const source = fs.readFileSync(path.join(VIEWS_DIR, fileName), 'utf8');
      expect(source).not.toMatch(/useBoard\(\)/);
    });
  }
});
