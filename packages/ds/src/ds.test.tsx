import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AsyncBoundary } from './AsyncBoundary';
import { AsyncButton } from './AsyncButton';
import { PendingRegion } from './PendingRegion';
import { Spinner } from './Spinner';
import { useLoadingStage } from './use-loading-stage';

const Boom = (): never => {
  throw new Error('boom');
};

describe('DS loading primitives', () => {
  it('Spinner writes its delay into --spinner-delay', () => {
    render(<Spinner delay={500} />);
    expect(screen.getByRole('status').style.getPropertyValue('--spinner-delay')).toBe('500ms');
  });

  it('PendingRegion sets a single data-pending attribute and aria-busy', () => {
    const { container, rerender } = render(<PendingRegion isPending={false}>x</PendingRegion>);
    const region = container.firstElementChild;
    expect(region).not.toHaveAttribute('data-pending');
    rerender(<PendingRegion isPending>x</PendingRegion>);
    expect(region).toHaveAttribute('data-pending');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('AsyncButton is disabled immediately while pending', () => {
    const onClick = vi.fn();
    render(<AsyncButton isPending onClick={onClick}>Save</AsyncButton>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('useLoadingStage goes idle → button (300 ms) → blocking (2 s)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLoadingStage(true));
    expect(result.current).toBe('idle');
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('button');
    act(() => vi.advanceTimersByTime(1700));
    expect(result.current).toBe('blocking');
    vi.useRealTimers();
  });

  it('AsyncBoundary renders errors through Alert and calls onReset on retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    render(
      <AsyncBoundary onReset={onReset}>
        <Boom />
      </AsyncBoundary>,
    );
    expect(screen.getByText('boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onReset).toHaveBeenCalled();
  });
});
