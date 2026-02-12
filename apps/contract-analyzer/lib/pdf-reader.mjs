import { readFileSync } from 'fs';
import pdf from 'pdf-parse';

/**
 * Extract text from a PDF file.
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} Extracted text content
 */
export async function extractTextFromPDF(filePath) {
  const buffer = readFileSync(filePath);
  const data = await pdf(buffer);
  return data.text;
}
