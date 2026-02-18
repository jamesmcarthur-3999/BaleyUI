/**
 * Template Generator
 *
 * Generates a complete FileSystemTree for WebContainer mounting,
 * optionally injecting design tokens from a DesignPackage.
 */

import type { FileSystemTree } from '@webcontainer/api';
import { getScaffoldTemplate } from '@/lib/canvas/scaffold-templates';
import { designPackageToFiles } from '@/lib/canvas/design-bridge';
import type { DesignPackageData } from '@/lib/design-packages/types';
import { filesToFileSystemTree } from './template';

/**
 * Generate a complete FileSystemTree for the canvas WebContainer.
 *
 * @param scaffoldTemplate - Template name (default: "nextjs-shadcn")
 * @param designPackage - Optional design package to inject brand tokens
 * @param additionalFiles - Extra files to overlay on top of the template
 */
export function generateFileSystemTree(opts: {
  scaffoldTemplate?: string;
  designPackage?: DesignPackageData;
  additionalFiles?: Record<string, string>;
}): FileSystemTree {
  // Start with scaffold template
  const files = getScaffoldTemplate(opts.scaffoldTemplate ?? 'nextjs-shadcn');

  // Overlay design package files (CSS variables, fonts, etc.)
  if (opts.designPackage) {
    const designFiles = designPackageToFiles(opts.designPackage);
    for (const [path, content] of Object.entries(designFiles)) {
      if (content) {
        files[path] = content;
      }
    }
  }

  // Overlay any additional files
  if (opts.additionalFiles) {
    for (const [path, content] of Object.entries(opts.additionalFiles)) {
      files[path] = content;
    }
  }

  return filesToFileSystemTree(files);
}
