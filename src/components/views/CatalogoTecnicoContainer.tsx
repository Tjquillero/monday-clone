'use client';

import { useState } from 'react';
import { useActivePoaVersionId } from '@/hooks/usePoaActivities';
import { useContractStandards, useMissingBoardActivityStandards, useUpsertActivityStandard } from '@/hooks/useActivityStandards';
import CatalogoTecnicoView from '@/components/catalogoTecnico/CatalogoTecnicoView';
import { ActivityCategory } from '@/types/scheduler';

// Container del Catálogo Técnico — pantalla propia, no un widget dentro de
// ResourceEfficiencyWidget (responde una pregunta distinta: "¿cómo debe
// ejecutarse técnicamente una actividad?", no "¿qué tan eficiente está
// siendo la operación?"). Deep-link ?view=catalogo-tecnico, sin pestaña de
// ribbon (mismo patrón que 'agenda').

interface Props {
  boardId: string | undefined;
}

export default function CatalogoTecnicoContainer({ boardId }: Props) {
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: activePoaVersionId, isLoading: versionLoading } = useActivePoaVersionId(boardId);
  const {
    data: pendientes, isLoading: pendientesLoading, isError: pendientesError, error: pendientesErr,
  } = useMissingBoardActivityStandards(boardId, activePoaVersionId);
  const {
    data: catalogo, isLoading: catalogoLoading, isError: catalogoError, error: catalogoErr,
  } = useContractStandards(boardId);
  const upsert = useUpsertActivityStandard();

  if (!boardId) return null;

  const isLoading = versionLoading || pendientesLoading || catalogoLoading;
  const isError = pendientesError || catalogoError;
  const error = (pendientesErr ?? catalogoErr) as Error | null;

  const handleSave = async (target: {
    activityKey: string; description: string; unit: string; category: ActivityCategory;
    rendimiento: number | null; requiereRendimiento: boolean;
  }): Promise<boolean> => {
    setSaveError(null);
    try {
      await upsert.mutateAsync({
        boardId,
        activityKey: target.activityKey,
        name: target.description,
        category: target.category,
        unit: target.unit,
        rendimiento: target.rendimiento,
        requiereRendimiento: target.requiereRendimiento,
      });
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar el estándar técnico.');
      return false;
    }
  };

  return (
    <CatalogoTecnicoView
      boardId={boardId}
      pendientes={pendientes ?? []}
      catalogo={catalogo ?? []}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onSave={handleSave}
      isSaving={upsert.isPending}
      saveError={saveError}
    />
  );
}
