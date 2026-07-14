/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhotoVerificationModal from './PhotoVerificationModal';

// Reproduce el hallazgo de la revisión: el selector "Antes"/"Después" nunca
// se resetea ni avanza solo. Como execution_attachments.phase es inmutable
// una vez subida (sin política RLS de UPDATE), un supervisor que olvide
// tocar el toggle antes de seguir subiendo fotos las persiste todas con la
// misma fase, sin forma de corregirlo después.

function file(name: string) {
  return new File(['contenido'], name, { type: 'image/jpeg' });
}

describe('PhotoVerificationModal — selector de fase (capturePhase)', () => {
  it('no avanza ni resetea el toggle tras subir una foto: dos subidas seguidas quedan con la misma fase por defecto', async () => {
    const onUpload = jest.fn().mockResolvedValue('https://example.test/foto.jpg');
    const onSave = jest.fn();

    render(
      <PhotoVerificationModal
        isOpen
        onClose={jest.fn()}
        onSave={onSave}
        itemName="Poda de árboles"
        itemId="item-1"
        initialGallery={[]}
        onUpload={onUpload}
        capturePhase
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // Primera foto: el toggle por defecto es "Antes" -- el supervisor nunca
    // lo toca, solo dispara la captura dos veces seguidas.
    fireEvent.change(input, { target: { files: [file('foto1.jpg')] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenNthCalledWith(1, expect.anything(), 'before');

    // Segunda foto, sin tocar el toggle: sigue siendo "before" -- nada en el
    // componente avisa ni corrige que ya van 2 fotos "antes" y 0 "después".
    fireEvent.change(input, { target: { files: [file('foto2.jpg')] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onUpload).toHaveBeenNthCalledWith(2, expect.anything(), 'before');
  });

  it('permite cambiar a "Después" manualmente y lo mantiene para subidas subsiguientes', async () => {
    const onUpload = jest.fn().mockResolvedValue('https://example.test/foto.jpg');

    render(
      <PhotoVerificationModal
        isOpen
        onClose={jest.fn()}
        onSave={jest.fn()}
        itemName="Poda de árboles"
        itemId="item-1"
        initialGallery={[]}
        onUpload={onUpload}
        capturePhase
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Después' }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file('foto1.jpg')] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenNthCalledWith(1, expect.anything(), 'after');

    // Sigue en "after" para la siguiente -- tampoco vuelve solo a "before".
    fireEvent.change(input, { target: { files: [file('foto2.jpg')] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onUpload).toHaveBeenNthCalledWith(2, expect.anything(), 'after');
  });
});

describe('PhotoVerificationModal — advertencia de fase incompleta al confirmar', () => {
  it('advierte (sin bloquear) si solo hay fotos "Antes" y permite confirmar igual', () => {
    const onSave = jest.fn();
    render(
      <PhotoVerificationModal
        isOpen
        onClose={jest.fn()}
        onSave={onSave}
        itemName="Poda de árboles"
        itemId="item-1"
        initialGallery={['url-1']}
        galleryPhases={{ 'url-1': 'before' }}
        capturePhase
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(screen.getByText(/La evidencia solo contiene fotos "Antes"/)).toBeInTheDocument();
    expect(screen.getByText(/No se registró evidencia "Después"/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar de todos modos' }));
    expect(onSave).toHaveBeenCalledWith('url-1');
  });

  it('advierte con el texto invertido si solo hay fotos "Después"', () => {
    render(
      <PhotoVerificationModal
        isOpen
        onClose={jest.fn()}
        onSave={jest.fn()}
        itemName="Poda de árboles"
        itemId="item-1"
        initialGallery={['url-1']}
        galleryPhases={{ 'url-1': 'after' }}
        capturePhase
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(screen.getByText(/La evidencia solo contiene fotos "Después"/)).toBeInTheDocument();
    expect(screen.getByText(/No se registró evidencia "Antes"/)).toBeInTheDocument();
  });

  it('"Volver a revisar" descarta la advertencia sin confirmar', () => {
    const onSave = jest.fn();
    render(
      <PhotoVerificationModal
        isOpen
        onClose={jest.fn()}
        onSave={onSave}
        itemName="Poda de árboles"
        itemId="item-1"
        initialGallery={['url-1']}
        galleryPhases={{ 'url-1': 'before' }}
        capturePhase
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver a revisar' }));

    expect(screen.queryByText(/La evidencia solo contiene/)).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('no advierte si ambas fases están presentes', () => {
    const onSave = jest.fn();
    render(
      <PhotoVerificationModal
        isOpen
        onClose={jest.fn()}
        onSave={onSave}
        itemName="Poda de árboles"
        itemId="item-1"
        initialGallery={['url-1', 'url-2']}
        galleryPhases={{ 'url-1': 'before', 'url-2': 'after' }}
        capturePhase
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(screen.queryByText(/La evidencia solo contiene/)).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith('url-1');
  });

  it('no advierte si el consumidor no pasa galleryPhases (compatibilidad hacia atrás)', () => {
    const onSave = jest.fn();
    render(
      <PhotoVerificationModal
        isOpen
        onClose={jest.fn()}
        onSave={onSave}
        itemName="Poda de árboles"
        itemId="item-1"
        initialGallery={['url-1']}
        capturePhase
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(screen.queryByText(/La evidencia solo contiene/)).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith('url-1');
  });
});
