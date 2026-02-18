/**
 * useWebContainer Hook
 *
 * Manages the lifecycle of a WebContainer instance for the canvas:
 * boot → mount scaffold → npm install → catch-up pending files → npm run dev → capture server URL.
 *
 * Key behaviours:
 * - Defers WASM load until `enabled` is true
 * - Replays any files written before the container booted (pendingFiles)
 * - Streams dev server output to detect and report compile errors
 * - Handles teardown on unmount
 */

'use client';

import { useEffect, useRef } from 'react';
import { useCanvasStore } from '@/stores/canvas';
import type { FileSystemTree } from '@webcontainer/api';
import type { CanvasFile } from '@/stores/canvas';

type WebContainerInstance = Awaited<
  ReturnType<typeof import('@webcontainer/api').WebContainer.boot>
>;

interface UseWebContainerOptions {
  /** Whether to start booting (only when canvas view is 'live') */
  enabled: boolean;
  /** Initial scaffold file system tree to mount */
  fileSystemTree: FileSystemTree | null;
  /**
   * Files already written to the canvas store before the container booted.
   * After install, these are synced into the container so nothing is lost.
   */
  pendingFiles?: Map<string, CanvasFile>;
  /** Called with compile errors detected in dev server output */
  onCompileErrors?: (errors: string[]) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Shell-style argument tokeniser.
 * Handles single-quoted, double-quoted, and unquoted tokens correctly.
 * e.g. `npm install "some package"` → ['npm', 'install', 'some package']
 */
function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

/**
 * Parse Next.js / TypeScript compile errors from dev server stdout.
 * Returns error blocks suitable for display in the compile error panel.
 */
function parseCompileErrors(output: string): string[] {
  const errors: string[] = [];

  // Next.js "Failed to compile" block
  const failedMatch = output.match(
    /Failed to compile\.\n\n([\s\S]*?)(?=\n\n(?:wait|ready|error|info)|$)/,
  );
  if (failedMatch?.[1]) {
    errors.push(failedMatch[1].trim());
  }

  // TypeScript type errors
  const typeErrorPattern = /Type error:\s*([\s\S]*?)(?=\n\n|\n\s*\n|$)/g;
  let match;
  while ((match = typeErrorPattern.exec(output)) !== null) {
    const msg = match[1]?.trim();
    if (msg && !errors.includes(msg)) errors.push(`Type error: ${msg}`);
  }

  return errors;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWebContainer({
  enabled,
  fileSystemTree,
  pendingFiles,
  onCompileErrors,
}: UseWebContainerOptions) {
  const instanceRef = useRef<WebContainerInstance | null>(null);
  const bootedRef = useRef(false);
  const pendingFilesRef = useRef(pendingFiles);
  const onCompileErrorsRef = useRef(onCompileErrors);

  // Keep refs in sync without triggering re-boots
  pendingFilesRef.current = pendingFiles;
  onCompileErrorsRef.current = onCompileErrors;

  const setContainerStatus = useCanvasStore((s) => s.setContainerStatus);
  const setIframeUrl = useCanvasStore((s) => s.setIframeUrl);

  useEffect(() => {
    if (!enabled || !fileSystemTree || bootedRef.current) return;
    bootedRef.current = true;

    let teardownCalled = false;

    async function bootAndRun() {
      try {
        setContainerStatus('booting');

        const { WebContainer } = await import('@webcontainer/api');
        if (teardownCalled) return;

        const instance = await WebContainer.boot();
        if (teardownCalled) {
          instance.teardown();
          return;
        }
        instanceRef.current = instance;

        // Mount scaffold template
        setContainerStatus('installing');
        await instance.mount(fileSystemTree!);

        // Run npm install with a timeout guard
        const installProcess = await instance.spawn('npm', ['install']);
        const installTimeout = setTimeout(() => {
          if (!teardownCalled) {
            setContainerStatus('error', 'npm install timed out after 3 minutes');
          }
        }, 180_000);

        const installCode = await installProcess.exit;
        clearTimeout(installTimeout);
        if (teardownCalled) return;

        if (installCode !== 0) {
          setContainerStatus('error', 'npm install failed');
          return;
        }

        // Catch-up: replay files written before the container booted.
        // These are files Baley wrote during the plan/brand phases.
        const filesToSync = pendingFilesRef.current;
        if (filesToSync?.size) {
          for (const [path, file] of filesToSync) {
            const dir = path.split('/').slice(0, -1).join('/');
            if (dir) await instance.fs.mkdir(dir, { recursive: true });
            await instance.fs.writeFile(path, file.content);
          }
        }

        // Start dev server
        setContainerStatus('building');
        const devProcess = await instance.spawn('npm', ['run', 'dev']);

        // Stream output to detect compile errors
        // Next.js outputs errors to stdout (not stderr).
        // WebContainer output streams yield string chunks directly.
        let outputBuffer = '';
        let lastErrorCount = 0;
        const outputReader = devProcess.output.getReader();

        // Process output in background without blocking server-ready
        (async () => {
          try {
            while (true) {
              const { done, value } = await outputReader.read();
              if (done || teardownCalled) {
                outputReader.releaseLock();
                break;
              }
              outputBuffer += value;
              const errors = parseCompileErrors(outputBuffer);
              if (errors.length !== lastErrorCount) {
                lastErrorCount = errors.length;
                onCompileErrorsRef.current?.(errors);
              }
            }
          } catch {
            // Reader closed on teardown
          }
        })();

        // Listen for server-ready event
        instance.on('server-ready', (_port: number, url: string) => {
          if (teardownCalled) return;
          setIframeUrl(url);
          setContainerStatus('ready');
        });

        // Fallback: if dev server doesn't report ready within 2 minutes, error
        const devTimeout = setTimeout(() => {
          if (!teardownCalled) {
            setContainerStatus('error', 'Dev server did not start in time');
          }
        }, 120_000);

        instance.on('server-ready', () => clearTimeout(devTimeout));
        instance.on('error', (err: { message: string }) => {
          clearTimeout(devTimeout);
          if (!teardownCalled) setContainerStatus('error', err.message);
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
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir) await instance.fs.mkdir(dir, { recursive: true });
      await instance.fs.writeFile(path, content);
    },

    /** Delete a file from the running WebContainer */
    deleteFile: async (path: string) => {
      const instance = instanceRef.current;
      if (!instance) return;
      try {
        await instance.fs.rm(path);
      } catch {
        // File may not exist yet
      }
    },

    /** Run a command in the WebContainer, with correct argument tokenisation */
    runCommand: async (command: string) => {
      const instance = instanceRef.current;
      if (!instance) return;
      const parts = parseCommandArgs(command);
      if (!parts.length) return;
      const [cmd, ...args] = parts as [string, ...string[]];
      await instance.spawn(cmd, args);
    },

    /** Get a reference to the raw WebContainer instance */
    getInstance: () => instanceRef.current,
  };
}
