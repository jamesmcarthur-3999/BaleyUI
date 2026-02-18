/**
 * Canvas Session State
 *
 * In-memory representation of a canvas session's file index, ops log,
 * and command log. The server never touches the WebContainer directly —
 * instead it maintains this index, and the client bridges writes to the
 * WebContainer filesystem.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CanvasFileEntry {
  path: string;
  content: string;
  language?: string;
  updatedAt: string;
}

export interface FileOp {
  type: 'write' | 'delete';
  path: string;
  timestamp: string;
  contentLength?: number;
}

export interface CommandLogEntry {
  command: string;
  timestamp: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

// ============================================================================
// CLASS
// ============================================================================

export class CanvasSessionState {
  readonly sessionId: string;
  readonly workspaceId: string;

  private files = new Map<string, CanvasFileEntry>();
  private fileOpsLog: FileOp[] = [];
  private commandsLog: CommandLogEntry[] = [];

  constructor(
    sessionId: string,
    workspaceId: string,
    initialFiles?: Map<string, CanvasFileEntry>,
  ) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    if (initialFiles) {
      this.files = new Map(initialFiles);
    }
  }

  // --------------------------------------------------------------------------
  // File operations
  // --------------------------------------------------------------------------

  writeFile(path: string, content: string, language?: string): void {
    this.files.set(path, {
      path,
      content,
      language,
      updatedAt: new Date().toISOString(),
    });
    this.fileOpsLog.push({
      type: 'write',
      path,
      timestamp: new Date().toISOString(),
      contentLength: content.length,
    });
  }

  readFile(path: string): string | null {
    return this.files.get(path)?.content ?? null;
  }

  deleteFile(path: string): boolean {
    const existed = this.files.delete(path);
    if (existed) {
      this.fileOpsLog.push({
        type: 'delete',
        path,
        timestamp: new Date().toISOString(),
      });
    }
    return existed;
  }

  listFiles(): string[] {
    return Array.from(this.files.keys()).sort();
  }

  getFileTree(): Array<{ path: string; size: number; language?: string }> {
    return Array.from(this.files.values()).map((f) => ({
      path: f.path,
      size: f.content.length,
      language: f.language,
    }));
  }

  getFileCount(): number {
    return this.files.size;
  }

  getTotalSize(): number {
    let total = 0;
    for (const f of this.files.values()) {
      total += f.content.length;
    }
    return total;
  }

  // --------------------------------------------------------------------------
  // Command logging
  // --------------------------------------------------------------------------

  logCommand(entry: CommandLogEntry): void {
    this.commandsLog.push(entry);
  }

  // --------------------------------------------------------------------------
  // Serialization (for DB persistence)
  // --------------------------------------------------------------------------

  toJSON(): {
    files: Record<string, CanvasFileEntry>;
    fileOpsLog: FileOp[];
    commandsLog: CommandLogEntry[];
  } {
    const filesObj: Record<string, CanvasFileEntry> = {};
    for (const [path, entry] of this.files) {
      filesObj[path] = entry;
    }
    return {
      files: filesObj,
      fileOpsLog: this.fileOpsLog,
      commandsLog: this.commandsLog,
    };
  }

  static fromJSON(
    sessionId: string,
    workspaceId: string,
    data: {
      files?: Record<string, CanvasFileEntry>;
      fileOpsLog?: FileOp[];
      commandsLog?: CommandLogEntry[];
    },
  ): CanvasSessionState {
    const initialFiles = new Map<string, CanvasFileEntry>();
    if (data.files) {
      for (const [path, entry] of Object.entries(data.files)) {
        initialFiles.set(path, entry);
      }
    }
    const state = new CanvasSessionState(sessionId, workspaceId, initialFiles);
    if (data.fileOpsLog) {
      state.fileOpsLog = data.fileOpsLog;
    }
    if (data.commandsLog) {
      state.commandsLog = data.commandsLog;
    }
    return state;
  }
}
