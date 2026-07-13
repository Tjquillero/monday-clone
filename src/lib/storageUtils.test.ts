// storageUtils.ts importa @/lib/supabaseClient a nivel de módulo (para las
// funciones de upload) — computeFileHash no lo necesita, pero el módulo
// completo sí se ejecuta al importar. Se mockea para no requerir
// credenciales reales de Supabase en este test puro.
jest.mock('@/lib/supabaseClient', () => ({ supabase: {} }));

import { createHash, webcrypto } from 'crypto';
import { Blob as NodeBlob } from 'buffer';
import { computeFileHash } from './storageUtils';

// jsdom no implementa crypto.subtle (SubtleCrypto) en esta versión — se usa
// el webcrypto real de Node, que sí lo implementa, solo dentro de este
// archivo de test (no afecta el resto de la suite).
(global as any).crypto.subtle = webcrypto.subtle;

// jsdom no implementa Blob.prototype.arrayBuffer() en esta versión — se usa
// el Blob nativo de Node (sí lo implementa desde Node 15+) en vez del File
// de jsdom, que estructuralmente cumple el mismo contrato (Blob | File).
function nodeBlobFrom(content: string): Blob {
  return new NodeBlob([content], { type: 'text/plain' }) as unknown as Blob;
}

describe('computeFileHash', () => {
  it('calcula el mismo SHA-256 para el mismo contenido binario', async () => {
    const hashA = await computeFileHash(nodeBlobFrom('contenido idéntico'));
    const hashB = await computeFileHash(nodeBlobFrom('contenido idéntico'));

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 64 hex chars
  });

  it('calcula hashes distintos para contenidos distintos', async () => {
    const hashA = await computeFileHash(nodeBlobFrom('contenido uno'));
    const hashB = await computeFileHash(nodeBlobFrom('contenido dos'));

    expect(hashA).not.toBe(hashB);
  });

  it('coincide con el SHA-256 calculado independientemente por el módulo crypto de Node', async () => {
    const content = 'texto de prueba para verificar el hash';
    const hash = await computeFileHash(nodeBlobFrom(content));

    const expected = createHash('sha256').update(content, 'utf8').digest('hex');
    expect(hash).toBe(expected);
  });
});
