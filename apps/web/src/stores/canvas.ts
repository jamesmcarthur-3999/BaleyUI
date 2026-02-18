/**
 * Canvas Store
 *
 * Zustand store managing the Chat + Canvas state machine.
 * Drives the right-panel view transitions and WebContainer lifecycle.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PlanPreviewData } from '@/lib/baleybot/creator-types';

// ============================================================================
// TYPES
// ============================================================================

export type ContainerStatus = 'booting' | 'installing' | 'building' | 'ready' | 'error';

export type CanvasView =
  | { kind: 'welcome' }
  | { kind: 'plan'; plan: PlanPreviewData }
  | { kind: 'brand'; designSessionId: string }
  | { kind: 'live'; containerStatus: ContainerStatus; errorMessage?: string }
  | { kind: 'deploy'; appReady: boolean };

export interface CanvasFile {
  path: string;
  content: string;
  language?: string;
}

interface CanvasState {
  /** Current canvas view state */
  view: CanvasView;

  /** Files tracked in the canvas session (server-side mirror) */
  files: Map<string, CanvasFile>;

  /** Canvas session ID (from DB) */
  sessionId: string | null;

  /** Associated design package ID */
  designPackageId: string | null;

  /** WebContainer iframe URL (set when dev server is ready) */
  iframeUrl: string | null;

  /** Compile errors from the WebContainer */
  compileErrors: string[];

  // Actions
  setView: (view: CanvasView) => void;
  showPlan: (plan: PlanPreviewData) => void;
  startBrand: (designSessionId: string) => void;
  startLive: () => void;
  setContainerStatus: (status: ContainerStatus, errorMessage?: string) => void;
  startDeploy: () => void;
  goBackToLive: () => void;
  setSessionId: (id: string) => void;
  setDesignPackageId: (id: string | null) => void;
  setIframeUrl: (url: string | null) => void;
  writeFile: (path: string, content: string, language?: string) => void;
  deleteFile: (path: string) => void;
  setFiles: (files: Map<string, CanvasFile>) => void;
  setCompileErrors: (errors: string[]) => void;
  reset: () => void;
}

// ============================================================================
// STORE
// ============================================================================

const initialState = {
  view: { kind: 'welcome' } as CanvasView,
  files: new Map<string, CanvasFile>(),
  sessionId: null as string | null,
  designPackageId: null as string | null,
  iframeUrl: null as string | null,
  compileErrors: [] as string[],
};

export const useCanvasStore = create<CanvasState>()(
  devtools(
    (set) => ({
      ...initialState,

      setView: (view) => set({ view }),

      showPlan: (plan) =>
        set({ view: { kind: 'plan', plan } }),

      startBrand: (designSessionId) =>
        set({ view: { kind: 'brand', designSessionId } }),

      startLive: () =>
        set({
          view: { kind: 'live', containerStatus: 'booting' },
          compileErrors: [],
        }),

      setContainerStatus: (status, errorMessage) =>
        set((state) => {
          if (state.view.kind !== 'live') return state;
          return { view: { kind: 'live', containerStatus: status, errorMessage } };
        }),

      startDeploy: () =>
        set({ view: { kind: 'deploy', appReady: true } }),

      goBackToLive: () =>
        set((state) => ({
          view: {
            kind: 'live',
            containerStatus: state.iframeUrl ? 'ready' : 'booting',
          },
        })),

      setSessionId: (id) => set({ sessionId: id }),

      setDesignPackageId: (id) => set({ designPackageId: id }),

      setIframeUrl: (url) => set({ iframeUrl: url }),

      writeFile: (path, content, language) =>
        set((state) => {
          const next = new Map(state.files);
          next.set(path, { path, content, language });
          return { files: next };
        }),

      deleteFile: (path) =>
        set((state) => {
          const next = new Map(state.files);
          next.delete(path);
          return { files: next };
        }),

      setFiles: (files) => set({ files }),

      setCompileErrors: (errors) => set({ compileErrors: errors }),

      reset: () => set({ ...initialState, files: new Map() }),
    }),
    { name: 'CanvasStore' },
  ),
);
