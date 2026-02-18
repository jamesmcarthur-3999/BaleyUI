/**
 * WebContainer Template
 *
 * Converts a flat Record<string, string> file map (from scaffold-templates)
 * into the FileSystemTree structure that WebContainer.mount() expects.
 */

import type { FileSystemTree } from '@webcontainer/api';

/**
 * Convert a flat file map (path → content) into a nested FileSystemTree.
 *
 * Example:
 *   { "src/app/page.tsx": "export default..." }
 *   →
 *   { src: { directory: { app: { directory: { "page.tsx": { file: { contents: "..." } } } } } } }
 */
export function filesToFileSystemTree(
  files: Record<string, string>,
): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const [filePath, content] of Object.entries(files)) {
    const parts = filePath.split('/');
    let current: FileSystemTree = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i]!;
      if (!current[dir]) {
        current[dir] = { directory: {} };
      }
      const node = current[dir]!;
      if ('directory' in node) {
        current = node.directory;
      }
    }

    const fileName = parts[parts.length - 1]!;
    current[fileName] = {
      file: { contents: content },
    };
  }

  return tree;
}
