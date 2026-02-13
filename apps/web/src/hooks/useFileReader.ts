/**
 * useFileReader — reads a File as text or base64 depending on file type.
 *
 * Text files (by extension) are read via readAsText.
 * Binary files (images, PDFs, etc.) are read via readAsDataURL → base64.
 */

const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.html', '.htm',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.css',
  '.scss', '.less', '.sql', '.sh', '.bat', '.ps1', '.toml', '.ini', '.cfg',
  '.log', '.env', '.gitignore', '.dockerfile', '.makefile',
]);

function isTextFile(fileName: string): boolean {
  const ext = fileName.lastIndexOf('.') >= 0 ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
  return TEXT_FILE_EXTENSIONS.has(ext);
}

export interface FileReaderResult {
  /** Raw text content (for text files) or a placeholder string (for binary files). */
  content: string;
  /** Base64-encoded file data, or null if the file was read as text. */
  fileData: string | null;
  /** MIME type of the file, or null if the file was read as text. */
  mimeType: string | null;
  /** The original file name. */
  fileName: string;
  /** Whether the file was detected as a text file. */
  isText: boolean;
}

/**
 * Read a File and return structured result.
 * Rejects if the file exceeds maxSizeMb.
 */
export function readFile(file: File, maxSizeMb = 10): Promise<FileReaderResult> {
  const maxBytes = maxSizeMb * 1024 * 1024;

  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`File too large. Max size is ${maxSizeMb}MB.`));
      return;
    }

    const reader = new FileReader();

    if (isTextFile(file.name)) {
      reader.onload = (ev) => {
        const text = ev.target?.result;
        if (typeof text === 'string') {
          resolve({
            content: text,
            fileData: null,
            mimeType: null,
            fileName: file.name,
            isText: true,
          });
        } else {
          reject(new Error('Failed to read file as text'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result;
        if (typeof dataUrl === 'string') {
          const base64 = dataUrl.split(',')[1] ?? '';
          resolve({
            content: `[Uploaded file: ${file.name} (${file.type}, ${Math.round(file.size / 1024)}KB)]`,
            fileData: base64,
            mimeType: file.type || 'application/octet-stream',
            fileName: file.name,
            isText: false,
          });
        } else {
          reject(new Error('Failed to read file as data URL'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    }
  });
}
