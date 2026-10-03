/**
 * Test Suite: GATE UI-MODAL-01 / UI-MODAL-01b / UI-MODAL-01c — Modales legibles y responsive (ModalShell)
 *
 * Pruebas:
 * 1. ModalShell se renderiza en document.body (portal), con role="dialog", aria-modal="true" y aria-labelledby.
 * 2. Escape y clic en el overlay llaman onClose. Con closeDisabled, no lo llaman.
 * 3. El panel no tiene clases opacity-*, bg-* con transparencia ni backdrop-blur.
 * 4. Prueba estática sobre ResetWeeklyPlanModal.tsx y DownloadScheduleModal.tsx:
 *    - Cero uso de --surface-primary y --surface-secondary.
 *    - Cero textos por debajo de 12px (text-[9px], text-[10px], text-[11px]).
 * 5. ResetWeeklyPlanModal y DownloadScheduleModal se renderizan correctamente con ModalShell.
 * 6. (UI-MODAL-01b) Al escribir en el motivo de ResetWeeklyPlanModal (15 caracteres), el foco se mantiene en el textarea y el valor se completa.
 * 7. (UI-MODAL-01b) Re-renderizar ModalShell con una función onClose distinta no mueve el foco ni altera document.body.style.overflow.
 * 8. (UI-MODAL-01b) Al abrir, el foco inicial queda en el textarea en ResetWeeklyPlanModal y en el input de mes en DownloadScheduleModal.
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';
import ModalShell from '../../components/ui/ModalShell';
import ResetWeeklyPlanModal from '../../components/planner/ResetWeeklyPlanModal';
import DownloadScheduleModal from '../../components/planner/DownloadScheduleModal';

describe('GATE UI-MODAL-01 / UI-MODAL-01c — ModalShell y gobernanza de modales', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  test('1. ModalShell se renderiza en document.body (portal), con role="dialog", aria-modal="true" y aria-labelledby apuntando al título', () => {
    const onClose = jest.fn();
    const { container, unmount } = render(
      <div id="app-root">
        <ModalShell open={true} onClose={onClose} title="Título de prueba" size="md">
          <p>Contenido del modal</p>
        </ModalShell>
      </div>
    );

    const appRoot = container.querySelector('#app-root');
    expect(appRoot?.children.length).toBe(0);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).toBeTruthy();
    expect(titleEl?.textContent).toBe('Título de prueba');

    unmount();
  });

  test('2. Escape y clic en el overlay llaman onClose. Con closeDisabled, no lo llaman.', () => {
    const onClose = jest.fn();
    const { unmount, rerender } = render(
      <ModalShell open={true} onClose={onClose} title="Modal interactivo">
        <p>Contenido</p>
      </ModalShell>
    );

    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement as HTMLElement;
    expect(overlay).toBeTruthy();

    // Clic en el overlay
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape en el overlay / ventana
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Con closeDisabled = true
    onClose.mockClear();
    rerender(
      <ModalShell open={true} onClose={onClose} closeDisabled={true} title="Modal bloqueado">
        <p>Contenido bloqueado</p>
      </ModalShell>
    );

    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    unmount();
  });

  test('3. El panel no tiene clases opacity-*, bg-* con transparencia ni backdrop-blur.', () => {
    const { unmount } = render(
      <ModalShell open={true} onClose={() => {}} title="Modal Opaco">
        <p>Contenido</p>
      </ModalShell>
    );

    const dialog = screen.getByRole('dialog');
    const className = dialog.className;

    expect(className).not.toMatch(/\bopacity-(?!0\b)[0-9]+\b/);
    expect(className).not.toMatch(/\bbackdrop-blur/);
    expect(className).not.toMatch(/\bbg-black\//);
    expect(className).not.toMatch(/\bbg-white\//);
    expect(className).not.toMatch(/\bbg-slate-[0-9]+\//);

    unmount();
  });

  test('4. Prueba estática sobre ModalShell.tsx, ResetWeeklyPlanModal.tsx y DownloadScheduleModal.tsx: cero uso de --card-bg, uso de --bg-secondary y cero microtipografía ilegible', () => {
    const modalShellPath = path.resolve(__dirname, '../../components/ui/ModalShell.tsx');
    const resetModalPath = path.resolve(__dirname, '../../components/planner/ResetWeeklyPlanModal.tsx');
    const downloadModalPath = path.resolve(__dirname, '../../components/planner/DownloadScheduleModal.tsx');

    const modalShellContent = fs.readFileSync(modalShellPath, 'utf8');
    const resetContent = fs.readFileSync(resetModalPath, 'utf8');
    const downloadContent = fs.readFileSync(downloadModalPath, 'utf8');

    // UI-MODAL-01d: cero --card-bg en los tres archivos
    expect(modalShellContent).not.toContain('--card-bg');
    expect(resetContent).not.toContain('--card-bg');
    expect(downloadContent).not.toContain('--card-bg');

    // UI-MODAL-01d: el panel de ModalShell contiene --bg-secondary
    expect(modalShellContent).toContain('--bg-secondary');

    // Cero tokens obsoletos
    expect(resetContent).not.toContain('--surface-primary');
    expect(resetContent).not.toContain('--surface-secondary');
    expect(downloadContent).not.toContain('--surface-primary');
    expect(downloadContent).not.toContain('--surface-secondary');

    const illegibleTextPattern = /\btext-\[(?:8|9|10|11)px\]/g;
    expect(resetContent).not.toMatch(illegibleTextPattern);
    expect(downloadContent).not.toMatch(illegibleTextPattern);
  });

  test('5. ResetWeeklyPlanModal y DownloadScheduleModal se renderizan correctamente usando ModalShell', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn().mockResolvedValue(undefined);

    const { unmount: unmountReset } = render(
      <ResetWeeklyPlanModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        itemCount={12}
      />
    );

    expect(screen.getAllByText(/Reprogramar semana/i).length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).toContain('12');
    const textarea = document.querySelector('textarea#reset-reason');
    expect(textarea).toBeTruthy();
    unmountReset();

    const { unmount: unmountDownload } = render(
      <DownloadScheduleModal
        isOpen={true}
        onClose={onClose}
        defaultMonth="2026-10"
      />
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Descargar [Cc]ronograma/i);
    unmountDownload();
  });

  test('6. (UI-MODAL-01b) Al escribir en el motivo de ResetWeeklyPlanModal (15 caracteres), el foco se mantiene en el textarea y el valor se completa', () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    const { unmount } = render(
      <ResetWeeklyPlanModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        itemCount={5}
      />
    );

    const textarea = document.querySelector('textarea#reset-reason') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    const textToWrite = 'Motivo de prueba';
    let currentVal = '';
    for (const char of textToWrite) {
      currentVal += char;
      fireEvent.change(textarea, { target: { value: currentVal } });
      expect(document.activeElement).toBe(textarea);
    }

    expect(textarea.value).toBe('Motivo de prueba');
    expect(textarea.value.length).toBeGreaterThanOrEqual(15);
    unmount();
  });

  test('7. (UI-MODAL-01b) Re-renderizar ModalShell con una función onClose distinta no mueve el foco ni altera document.body.style.overflow', () => {
    const onClose1 = jest.fn();
    const onClose2 = jest.fn();

    const { rerender, unmount } = render(
      <ModalShell open={true} onClose={onClose1} title="Modal Test">
        <input id="test-input" placeholder="Input de prueba" />
      </ModalShell>
    );

    expect(document.body.style.overflow).toBe('hidden');

    const input = document.querySelector('#test-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.focus();
    expect(document.activeElement).toBe(input);

    // Re-renderizar pasando una nueva función onClose
    rerender(
      <ModalShell open={true} onClose={onClose2} title="Modal Test">
        <input id="test-input" placeholder="Input de prueba" />
      </ModalShell>
    );

    expect(document.activeElement).toBe(input);
    expect(document.body.style.overflow).toBe('hidden');

    // Al presionar Escape, debe invocar la función más reciente (onClose2)
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose1).not.toHaveBeenCalled();
    expect(onClose2).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('8. (UI-MODAL-01b) Al abrir, el foco inicial queda en el textarea en ResetWeeklyPlanModal y en el input de mes en DownloadScheduleModal', async () => {
    // 1. ResetWeeklyPlanModal
    const { unmount: unmountReset } = render(
      <ResetWeeklyPlanModal
        isOpen={true}
        onClose={jest.fn()}
        onConfirm={jest.fn().mockResolvedValue(undefined)}
        itemCount={5}
      />
    );

    await waitFor(() => {
      const textarea = document.querySelector('textarea#reset-reason');
      expect(document.activeElement).toBe(textarea);
    });
    unmountReset();

    // 2. DownloadScheduleModal
    const { unmount: unmountDownload } = render(
      <DownloadScheduleModal
        isOpen={true}
        onClose={jest.fn()}
        defaultMonth="2026-10"
      />
    );

    await waitFor(() => {
      const monthInput = document.querySelector('input[type="month"]');
      expect(document.activeElement).toBe(monthInput);
    });
    unmountDownload();
  });
});
