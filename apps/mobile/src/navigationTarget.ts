import { useSyncExternalStore } from 'react';

export type NavigationTarget = {
  h3Index: string;
  depositId: string;
  resourceCode: string;
  resourceName: string;
};

let currentTarget: NavigationTarget | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setNavigationTarget(target: NavigationTarget): void {
  currentTarget = target;
  emit();
}

export function clearNavigationTarget(): void {
  if (!currentTarget) return;
  currentTarget = null;
  emit();
}

export function getNavigationTarget(): NavigationTarget | null {
  return currentTarget;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNavigationTarget(): NavigationTarget | null {
  return useSyncExternalStore(subscribe, getNavigationTarget, getNavigationTarget);
}
