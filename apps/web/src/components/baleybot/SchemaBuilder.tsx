'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { SchemaFieldComponent } from './SchemaField';
import type { SchemaField, SchemaFieldType } from './schema-utils';
import {
  createDefaultField,
  schemaFieldsToBAL,
  balToSchemaFields,
} from './schema-utils';

interface SchemaBuilderProps {
  /** The BAL output schema as a Record<string, string> */
  value: Record<string, string>;
  /** Callback when the schema changes */
  onChange: (value: Record<string, string>) => void;
  /** Additional CSS classes */
  className?: string;
  /** Whether the builder is read-only */
  readOnly?: boolean;
}

/**
 * Schema Builder Component
 *
 * A visual form-based builder for creating output schemas.
 * Features:
 * - Add/remove/edit fields
 * - Support for all types (string, number, boolean, enum, array, object)
 * - Nested type editing (array element types, object properties)
 * - Bidirectional sync with BAL output schema
 */
export function SchemaBuilder({
  value,
  onChange,
  className,
  readOnly = false,
}: SchemaBuilderProps) {
  // Convert BAL schema to internal SchemaField representation
  const [fields, setFields] = useState<SchemaField[]>(() =>
    balToSchemaFields(value)
  );

  // Sync internal state when external value changes
  useEffect(() => {
    const newFields = balToSchemaFields(value);
    // Only update if the serialized form is different to avoid infinite loops
    const currentBAL = schemaFieldsToBAL(fields);
    const newBAL = schemaFieldsToBAL(newFields);
    if (JSON.stringify(currentBAL) !== JSON.stringify(newBAL)) {
      setFields(newFields);
    }
  }, [value]);

  /**
   * Notify parent of schema changes
   */
  const notifyChange = (updatedFields: SchemaField[]) => {
    setFields(updatedFields);
    const balSchema = schemaFieldsToBAL(updatedFields);
    onChange(balSchema);
  };

  /**
   * Add a new field
   */
  const addField = (type: SchemaFieldType = 'string') => {
    if (readOnly) return;
    const newField = createDefaultField(type, '');
    notifyChange([...fields, newField]);
  };

  /**
   * Update a field at a specific index
   */
  const updateField = (index: number, updatedField: SchemaField) => {
    if (readOnly) return;
    const newFields = [...fields];
    newFields[index] = updatedField;
    notifyChange(newFields);
  };

  /**
   * Delete a field at a specific index
   */
  const deleteField = (index: number) => {
    if (readOnly) return;
    notifyChange(fields.filter((_, i) => i !== index));
  };

  /**
   * Move a field up or down
   */
  const moveField = (index: number, direction: 'up' | 'down') => {
    if (readOnly) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;

    const newFields = [...fields];
    const temp = newFields[index];
    const target = newFields[newIndex];
    if (temp && target) {
      newFields[index] = target;
      newFields[newIndex] = temp;
      notifyChange(newFields);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Output Schema</Label>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => addField('string')}
            className="h-8"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Field
          </Button>
        )}
      </div>

      {/* Empty state */}
      {fields.length === 0 && (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No output fields defined yet.
          </p>
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => addField('string')}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add First Field
            </Button>
          )}
        </div>
      )}

      {/* Field list */}
      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <SchemaFieldComponent
              key={field.id}
              field={field}
              onChange={(updated) => updateField(index, updated)}
              onDelete={() => deleteField(index)}
              canDelete={!readOnly}
            />
          ))}
        </div>
      )}

      {/* Quick add buttons for common types */}
      {!readOnly && fields.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground self-center mr-2">
            Quick add:
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addField('string')}
            className="h-7 text-xs"
          >
            + String
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addField('number')}
            className="h-7 text-xs"
          >
            + Number
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addField('boolean')}
            className="h-7 text-xs"
          >
            + Boolean
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addField('enum')}
            className="h-7 text-xs"
          >
            + Enum
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addField('array')}
            className="h-7 text-xs"
          >
            + Array
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addField('object')}
            className="h-7 text-xs"
          >
            + Object
          </Button>
        </div>
      )}
    </div>
  );
}

export default SchemaBuilder;
