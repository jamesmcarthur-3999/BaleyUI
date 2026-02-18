/**
 * useWebContainer Hook
 *
 * Manages the lifecycle of a WebContainer instance for the canvas:
 * boot → mount files → npm install → npm run dev → capture server URL.
 *
 * Integrates with the canvas zustand store for status updates and
 * listens for SSE events (file writes, commands) from the stream route.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useCanvasStore } from '@/stores/canvas';
import type { FileSystemTree } from '@webcontainer/api';

type WebContainerInstance = Awaited<
  ReturnType<typeof import('@webcontainer/api').WebContainer.boot>
>;

interface UseWebContainerOptions {
  /** Whether to start booting (only when canvas view is 'live') */
  enabled: boolean;
  /** Initial file system tree to mount */
  fileSystemTree: FileSystemTree | null;
}

export function useWebContainer({ enabled, fileSystemTree }: UseWebContainerOptions) {
  const instanceRef = useRef<WebContainerInstance | null>(null);
  const bootedRef = useRef(false);

  const setContainerStatus = useCanvasStore((s) => s.setContainerStatus);
  const setIframeUrl = useCanvasStore((s) => s.setIframeUrl);

  // Boot and run dev server
  useEffect(() => {
    if (!enabled || !fileSystemTree || bootedRef.current) return;
    bootedRef.current = true;

    let teardownCalled = false;

    async function bootAndRun() {
      try {
        setContainerStatus('booting');

        // Dynamic import to avoid loading WASM until needed
        const { WebContainer } = await import('@webcontainer/api');
        if (teardownCalled) return;

        const instance = await WebContainer.boot();
        if (teardownCalled) {
          instance.teardown();
          return;
        }
        instanceRef.current = instance;

        // Mount files
        setContainerStatus('installing');
        await instance.mount(fileSystemTree!);

        // Run npm install
        const installProcess = await instance.spawn('npm', ['install']);
        const installCode = await installProcess.exit;
        if (teardownCalled) return;

        if (installCode !== 0) {
          setContainerStatus('error', 'npm install failed');
          return;
        }

        // Run dev server
        setContainerStatus('building');
        await instance.spawn('npm', ['run', 'dev']);

        // Listen for server-ready event
        instance.on('server-ready', (_port: number, url: string) => {
          if (teardownCalled) return;
          setIframeUrl(url);
          setContainerStatus('ready');
        });

        // Listen for errors
        instance.on('error', (err: { message: string }) => {
          if (teardownCalled) return;
          setContainerStatus('error', err.message);
        });
      } catch (err) {
        if (!teardownCalled) {
          setContainerStatus(
            'error',
            err instanceof Error ? err.message : 'Failed to boot WebContainer',
          );
        }
      }
    }

    bootAndRun();

    return () => {
      teardownCalled = true;
      if (instanceRef.current) {
        instanceRef.current.teardown();
        instanceRef.current = null;
      }
      bootedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fileSystemTree]);

  return {
    /** Write a file into the running WebContainer */
    writeFile: async (path: string, content: string) => {
      const instance = instanceRef.current;
      if (!instance) return;

      // Ensure parent directories exist
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir) {
        await instance.fs.mkdir(dir, { recursive: true });
      }
      await instance.fs.writeFile(path, content);
    },

    /** Delete a file from the running WebContainer */
    deleteFile: async (path: string) => {
      const instance = instanceRef.current;
      if (!instance) return;
      try {
        await instance.fs.rm(path);
      } catch {
        // File might not exist
      }
    },

    /** Run a command in the WebContainer */
    runCommand: async (command: string) => {
      const instance = instanceRef.current;
      if (!instance) return;
      const parts = command.split(' ');
      const cmd = parts[0]!;
      const args = parts.slice(1);
      await instance.spawn(cmd, args);
    },

    /** Get a reference to the raw WebContainer instance */
    getInstance: () => instanceRef.current,
  };
}
