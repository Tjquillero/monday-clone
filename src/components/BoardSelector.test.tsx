/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BoardSelector from './BoardSelector';

describe('BoardSelector', () => {
  it('lista todos los boards recibidos y llama a onSelect con el id correcto al hacer click', () => {
    const onSelect = jest.fn();
    render(
      <BoardSelector
        boards={[
          { id: 'board-a', name: 'Tablero A' },
          { id: 'board-b', name: 'Tablero B' },
        ]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('Tablero A')).toBeInTheDocument();
    expect(screen.getByText('Tablero B')).toBeInTheDocument();
    expect(screen.getByText('Perteneces a 2 tableros')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Tablero B'));
    expect(onSelect).toHaveBeenCalledWith('board-b');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
