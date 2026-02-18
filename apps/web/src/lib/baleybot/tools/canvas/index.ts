/**
 * Canvas Runtime Tools
 *
 * 9 tools that Baley uses to control the canvas:
 *   write_file, read_file, delete_file, run_command, get_file_tree,
 *   get_compile_errors, apply_design_package, present_plan, deploy_app
 *
 * Tools do NOT touch the WebContainer directly — they operate on the
 * server-side CanvasSessionState file index and return action objects
 * that the SSE bridge relays to the client.
 */

import type { RuntimeToolDefinition } from '@/lib/baleybot/executor';
import type { CanvasSessionState } from '@/lib/canvas/session-state';
import { designPackageToFiles } from '@/lib/canvas/design-bridge';
import type { DesignPackageData } from '@/lib/design-packages/types';
import {
  validateFilePath,
  validateCommand,
  detectLanguage,
  MAX_FILE_SIZE,
  MAX_PROJECT_SIZE,
} from './validators';

// ============================================================================
// TYPES
// ============================================================================

export interface CanvasToolContext {
  sessionState: CanvasSessionState;
  /** Callback to emit canvas-specific SSE events */
  emitCanvasEvent: (event: Record<string, unknown>) => void;
  /** Resolve a design package by ID (fetched from DB by caller) */
  resolveDesignPackage?: (id: string) => Promise<DesignPackageData | null>;
}

// ============================================================================
// TOOL BUILDER
// ============================================================================

/**
 * Build all 9 canvas runtime tools.
 * Returns a Map suitable for merging into the allTools Map in the stream route.
 */
export function buildCanvasRuntimeTools(
  ctx: CanvasToolContext,
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  // --------------------------------------------------------------------------
  // 1. write_file
  // --------------------------------------------------------------------------
  tools.set('write_file', {
    name: 'write_file',
    description:
      'Write or create a file in the canvas project. The file will be written to the WebContainer and trigger HMR.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path (e.g. "src/app/page.tsx")',
        },
        content: {
          type: 'string',
          description: 'The full file content to write',
        },
      },
      required: ['path', 'content'],
    },
    category: 'canvas',
    dangerLevel: 'safe',
    async function(args) {
      const path = String(args.path ?? '');
      const content = String(args.content ?? '');

      const pathError = validateFilePath(path);
      if (pathError) return { error: pathError };

      if (content.length > MAX_FILE_SIZE) {
        return { error: `File content exceeds ${MAX_FILE_SIZE / 1024}KB limit` };
      }

      // Check total project size
      const currentSize = ctx.sessionState.getTotalSize();
      if (currentSize + content.length > MAX_PROJECT_SIZE) {
        return { error: 'Project size would exceed 50MB limit' };
      }

      const language = detectLanguage(path);
      ctx.sessionState.writeFile(path, content, language);

      // Emit SSE event for client-side WebContainer bridge
      ctx.emitCanvasEvent({
        type: 'canvas_file_op',
        op: 'write',
        path,
        content,
        timestamp: Date.now(),
      });

      return {
        action: 'canvas_write_file',
        path,
        size: content.length,
        language,
      };
    },
  });

  // --------------------------------------------------------------------------
  // 2. read_file
  // --------------------------------------------------------------------------
  tools.set('read_file', {
    name: 'read_file',
    description:
      'Read a file from the canvas project. Reads from the server-side file index (no client round-trip).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path to read',
        },
      },
      required: ['path'],
    },
    category: 'canvas',
    dangerLevel: 'safe',
    async function(args) {
      const path = String(args.path ?? '');
      const pathError = validateFilePath(path);
      if (pathError) return { error: pathError };

      const content = ctx.sessionState.readFile(path);
      if (content === null) {
        return { error: `File not found: ${path}` };
      }

      return { path, content, size: content.length };
    },
  });

  // --------------------------------------------------------------------------
  // 3. delete_file
  // --------------------------------------------------------------------------
  tools.set('delete_file', {
    name: 'delete_file',
    description: 'Delete a file from the canvas project.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path to delete',
        },
      },
      required: ['path'],
    },
    category: 'canvas',
    dangerLevel: 'moderate',
    async function(args) {
      const path = String(args.path ?? '');
      const pathError = validateFilePath(path);
      if (pathError) return { error: pathError };

      const deleted = ctx.sessionState.deleteFile(path);
      if (!deleted) {
        return { error: `File not found: ${path}` };
      }

      ctx.emitCanvasEvent({
        type: 'canvas_file_op',
        op: 'delete',
        path,
        timestamp: Date.now(),
      });

      return { action: 'canvas_delete_file', path };
    },
  });

  // --------------------------------------------------------------------------
  // 4. run_command
  // --------------------------------------------------------------------------
  tools.set('run_command', {
    name: 'run_command',
    description:
      'Execute a shell command in the canvas project (npm, npx, pnpm, node, tsc only). The command runs in the WebContainer.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to run (e.g. "npm install framer-motion")',
        },
      },
      required: ['command'],
    },
    category: 'canvas',
    dangerLevel: 'moderate',
    async function(args) {
      const command = String(args.command ?? '');
      const cmdError = validateCommand(command);
      if (cmdError) return { error: cmdError };

      // Log the command
      ctx.sessionState.logCommand({
        command,
        timestamp: new Date().toISOString(),
      });

      // Emit command event — client will execute in WebContainer
      ctx.emitCanvasEvent({
        type: 'canvas_run_command',
        command,
        timestamp: Date.now(),
      });

      return {
        action: 'canvas_run_command',
        command,
        message: `Command "${command}" sent to WebContainer. Results will appear in the terminal.`,
      };
    },
  });

  // --------------------------------------------------------------------------
  // 5. get_file_tree
  // --------------------------------------------------------------------------
  tools.set('get_file_tree', {
    name: 'get_file_tree',
    description: 'List all files in the canvas project with their sizes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    category: 'canvas',
    dangerLevel: 'safe',
    async function() {
      const tree = ctx.sessionState.getFileTree();
      return {
        files: tree,
        totalFiles: tree.length,
        totalSize: ctx.sessionState.getTotalSize(),
      };
    },
  });

  // --------------------------------------------------------------------------
  // 6. get_compile_errors
  // --------------------------------------------------------------------------
  tools.set('get_compile_errors', {
    name: 'get_compile_errors',
    description:
      'Request compile/build errors from the WebContainer. The client will report errors back.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    category: 'canvas',
    dangerLevel: 'safe',
    async function() {
      ctx.emitCanvasEvent({
        type: 'canvas_request_errors',
        timestamp: Date.now(),
      });

      return {
        action: 'canvas_request_errors',
        message: 'Error report requested from WebContainer.',
      };
    },
  });

  // --------------------------------------------------------------------------
  // 7. apply_design_package
  // --------------------------------------------------------------------------
  tools.set('apply_design_package', {
    name: 'apply_design_package',
    description:
      'Apply a design package to the canvas project. Generates CSS variables, typography, and theme files from the design tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        designPackageId: {
          type: 'string',
          description: 'UUID of the design package to apply',
        },
      },
      required: ['designPackageId'],
    },
    category: 'canvas',
    dangerLevel: 'safe',
    async function(args) {
      const designPackageId = String(args.designPackageId ?? '');
      if (!designPackageId) {
        return { error: 'designPackageId is required' };
      }

      if (!ctx.resolveDesignPackage) {
        return { error: 'Design package resolution not available' };
      }

      const packageData = await ctx.resolveDesignPackage(designPackageId);
      if (!packageData) {
        return { error: `Design package not found: ${designPackageId}` };
      }

      // Convert to files
      const files = designPackageToFiles(packageData);

      // Write each generated file
      const writtenPaths: string[] = [];
      for (const [path, content] of Object.entries(files)) {
        if (content) {
          ctx.sessionState.writeFile(path, content, detectLanguage(path));
          ctx.emitCanvasEvent({
            type: 'canvas_file_op',
            op: 'write',
            path,
            content,
            timestamp: Date.now(),
          });
          writtenPaths.push(path);
        }
      }

      return {
        action: 'canvas_apply_design',
        designPackageId,
        writtenFiles: writtenPaths,
      };
    },
  });

  // --------------------------------------------------------------------------
  // 8. present_plan
  // --------------------------------------------------------------------------
  tools.set('present_plan', {
    name: 'present_plan',
    description:
      'Present a structured build plan on the canvas for user review and approval. Include bot entities, topology, and design rationale.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project name',
        },
        description: {
          type: 'string',
          description: 'Brief project description',
        },
        icon: {
          type: 'string',
          description: 'Emoji icon for the project',
        },
        entities: {
          type: 'array',
          description: 'BaleyBot entities in the plan',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              icon: { type: 'string' },
              purpose: { type: 'string' },
              tools: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'name', 'purpose'],
          },
        },
        topology: {
          type: 'string',
          description: 'Execution topology (e.g. "chain", "parallel", "conditional", "single")',
        },
        topologyDescription: {
          type: 'string',
          description: 'Human-readable explanation of the topology',
        },
        complexity: {
          type: 'string',
          description: 'Complexity level: "simple", "moderate", or "complex"',
        },
        designRationale: {
          type: 'string',
          description: 'Why this architecture was chosen',
        },
      },
      required: ['name', 'description', 'entities'],
    },
    category: 'canvas',
    dangerLevel: 'safe',
    async function(args) {
      const plan = {
        name: String(args.name ?? 'Untitled'),
        description: String(args.description ?? ''),
        icon: String(args.icon ?? '\u{1F680}'),
        entities: Array.isArray(args.entities)
          ? (args.entities as Array<Record<string, unknown>>).map((e) => ({
              id: String(e.id ?? e.name ?? ''),
              name: String(e.name ?? 'Unnamed'),
              icon: String(e.icon ?? '\u{1F916}'),
              purpose: String(e.purpose ?? ''),
              tools: Array.isArray(e.tools) ? e.tools.map(String) : [],
            }))
          : [],
        topology: String(args.topology ?? 'single'),
        topologyDescription: String(args.topologyDescription ?? ''),
        connections: [],
        complexity: String(args.complexity ?? 'simple') as
          | 'simple'
          | 'moderate'
          | 'complex',
        designRationale: String(args.designRationale ?? ''),
      };

      ctx.emitCanvasEvent({
        type: 'canvas_present_plan',
        plan,
        timestamp: Date.now(),
      });

      return {
        action: 'canvas_present_plan',
        plan,
        message: 'Plan presented on canvas. Waiting for user approval.',
      };
    },
  });

  // --------------------------------------------------------------------------
  // 9. deploy_app
  // --------------------------------------------------------------------------
  tools.set('deploy_app', {
    name: 'deploy_app',
    description:
      'Deploy the canvas app. Options: "export" (download as ZIP) or "host" (publish to BaleyUI hosting).',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['export', 'host'],
          description: 'Deployment method',
        },
        name: {
          type: 'string',
          description: 'App name (used for hosting slug)',
        },
      },
      required: ['method'],
    },
    category: 'canvas',
    dangerLevel: 'moderate',
    async function(args) {
      const method = String(args.method ?? 'export');
      const name = String(args.name ?? 'canvas-app');

      ctx.emitCanvasEvent({
        type: 'canvas_deploy',
        method,
        name,
        fileCount: ctx.sessionState.getFileCount(),
        timestamp: Date.now(),
      });

      return {
        action: 'canvas_deploy',
        method,
        name,
        message:
          method === 'export'
            ? 'Export initiated. The user can download the project as a ZIP.'
            : 'Hosting deployment initiated.',
      };
    },
  });

  return tools;
}
