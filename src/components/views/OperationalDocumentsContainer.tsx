'use client';

import { useState } from 'react';
import {
  useDocumentTypes,
  useOperationalDocuments,
  useUploadOperationalDocument,
  useMarkOperationalDocumentVigente,
  getOperationalDocumentSignedUrl,
  UploadOperationalDocumentInput,
} from '@/hooks/useOperationalDocuments';
import OperationalDocumentsView from '@/components/documentos/OperationalDocumentsView';

interface Props {
  boardId: string;
}

export default function OperationalDocumentsContainer({ boardId }: Props) {
  const { data: documentTypes, isLoading: typesLoading } = useDocumentTypes();
  const { data: documents, isLoading: docsLoading, isError, error } = useOperationalDocuments(boardId);
  const uploadMutation = useUploadOperationalDocument();
  const markVigenteMutation = useMarkOperationalDocumentVigente(boardId);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (input: UploadOperationalDocumentInput) => {
    setUploadError(null);
    try {
      await uploadMutation.mutateAsync(input);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir el documento.');
      throw err;
    }
  };

  const handleDownload = async (storagePath: string) => {
    try {
      const url = await getOperationalDocumentSignedUrl(storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // Silencioso: el usuario ya ve el enlace no abrirse; no hay estado de
      // error dedicado en Fase 1 para esta acción secundaria.
    }
  };

  return (
    <OperationalDocumentsView
      boardId={boardId}
      documentTypes={documentTypes ?? []}
      documents={documents ?? []}
      isLoading={typesLoading || docsLoading}
      isError={isError}
      error={error}
      onUpload={handleUpload}
      isUploading={uploadMutation.isPending}
      uploadError={uploadError}
      onMarkVigente={(id) => markVigenteMutation.mutate(id)}
      onDownload={handleDownload}
    />
  );
}
