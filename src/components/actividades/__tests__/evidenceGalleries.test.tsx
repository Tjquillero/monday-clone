import React from 'react';
import { render, screen } from '@testing-library/react';
import ActivityGalleryView, { ExecutionGalleryGroup } from '../ActivityGalleryView';
import SiteGalleryView, { DateGroupInSite } from '../SiteGalleryView';

describe('FASE 1 — Galerías Operacionales por Actividad y por Sitio', () => {
  const sampleExecutions: ExecutionGalleryGroup[] = [
    {
      execution_id: 'exec_001',
      execution_date: '2026-09-07',
      crew_name: 'Cuadrilla Norte',
      worker_count: 3,
      executed_qty: 1500,
      unit: 'M2',
      photos: [
        {
          id: 'photo_01',
          execution_id: 'exec_001',
          file_url: 'https://example.com/photo1.jpg',
          file_name: 'antes_01.jpg',
          phase: 'before',
          captured_at: '2026-09-07T08:30:00.000Z',
        },
        {
          id: 'photo_02',
          execution_id: 'exec_001',
          file_url: 'https://example.com/photo2.jpg',
          file_name: 'despues_01.jpg',
          phase: 'after',
          captured_at: '2026-09-07T12:00:00.000Z',
          is_protected: true,
        },
      ],
    },
    {
      execution_id: 'exec_002',
      execution_date: '2026-09-08',
      crew_name: 'Cuadrilla Norte',
      worker_count: 2,
      executed_qty: 1000,
      unit: 'M2',
      photos: [
        {
          id: 'photo_03',
          execution_id: 'exec_002',
          file_url: 'https://example.com/photo3.jpg',
          file_name: 'durante_01.jpg',
          phase: 'during',
          captured_at: '2026-09-08T10:15:00.000Z',
        },
      ],
    },
  ];

  test('1. ActivityGalleryView renderiza la línea de tiempo por fecha y etiquetas de fase', () => {
    render(
      <ActivityGalleryView
        activityName="ACOPIO Y LIMPIEZA MANUAL"
        siteName="PLAYA DEL COUNTRY"
        executions={sampleExecutions}
      />
    );

    expect(screen.getByText('ACOPIO Y LIMPIEZA MANUAL')).toBeInTheDocument();
    expect(screen.getByText('PLAYA DEL COUNTRY')).toBeInTheDocument();
    expect(screen.getByText('2026-09-07')).toBeInTheDocument();
    expect(screen.getByText('2026-09-08')).toBeInTheDocument();
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Durante')).toBeInTheDocument();
    expect(screen.getByText('Después')).toBeInTheDocument();
    expect(screen.getByText('3 evidencias')).toBeInTheDocument();
  });

  test('2. SiteGalleryView renderiza la supervisión cronológica del sitio por Fecha y Actividad', () => {
    const siteDateGroups: DateGroupInSite[] = [
      {
        date: '2026-09-07',
        activities: [
          {
            activity_key: 'acopio_manual',
            activity_name: 'ACOPIO Y LIMPIEZA MANUAL',
            zone: 'ZP',
            executed_qty: 1500,
            unit: 'M2',
            photos: sampleExecutions[0].photos,
          },
        ],
      },
    ];

    render(
      <SiteGalleryView
        siteName="PLAYA DEL COUNTRY"
        siteId="group_country_001"
        dateGroups={siteDateGroups}
      />
    );

    expect(screen.getByText('PLAYA DEL COUNTRY')).toBeInTheDocument();
    expect(screen.getByText('2026-09-07')).toBeInTheDocument();
    expect(screen.getByText('ACOPIO Y LIMPIEZA MANUAL')).toBeInTheDocument();
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Después')).toBeInTheDocument();
  });
});
