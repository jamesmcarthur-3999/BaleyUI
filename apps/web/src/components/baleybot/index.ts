/**
 * BaleyBot Components
 *
 * Reusable components for building and editing BaleyBots.
 */

export { BalCodeEditor, type ParserError, type ValidationWarning } from './BalCodeEditor';
export {
  BAL_LANGUAGE_ID,
  registerBALLanguage,
  createErrorMarker,
  createWarningMarker,
} from './bal-language';
export { SchemaBuilder } from './SchemaBuilder';
export { SchemaFieldComponent } from './SchemaField';
export {
  type SchemaField,
  type SchemaFieldType,
  generateFieldId,
  createDefaultField,
  typeSpecToSchemaField,
  schemaFieldToTypeSpec,
  schemaFieldsToBAL,
  balToSchemaFields,
} from './schema-utils';
