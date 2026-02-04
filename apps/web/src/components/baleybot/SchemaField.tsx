'use client';

import { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { SchemaField, SchemaFieldType } from './schema-utils';
import { createDefaultField, generateFieldId } from './schema-utils';

interface SchemaFieldComponentProps {
  field: SchemaField;
  onChange: (field: SchemaField) => void;
  onDelete: () => void;
  depth?: number;
  canDelete?: boolean;
}

/**
 * Available field types for the dropdown
 */
const FIELD_TYPES: { value: SchemaFieldType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'enum', label: 'Enum' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
];

/**
 * Schema Field Component
 *
 * A single field in the schema builder with controls for:
 * - Field name
 * - Field type
 * - Optional flag
 * - Type-specific configuration (enum values, number range, etc.)
 * - Nested fields (for array and object types)
 */
export function SchemaFieldComponent({
  field,
  onChange,
  onDelete,
  depth = 0,
  canDelete = true,
}: SchemaFieldComponentProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasNestedContent =
    field.type === 'object' ||
    field.type === 'array' ||
    field.type === 'enum' ||
    (field.type === 'number' && (field.range?.min !== undefined || field.range?.max !== undefined));

  /**
   * Update a single field property
   */
  const updateField = <K extends keyof SchemaField>(
    key: K,
    value: SchemaField[K]
  ) => {
    onChange({ ...field, [key]: value });
  };

  /**
   * Handle type change (resets type-specific properties)
   */
  const handleTypeChange = (newType: SchemaFieldType) => {
    const newField: SchemaField = {
      id: field.id,
      name: field.name,
      type: newType,
      isOptional: field.isOptional,
    };

    // Initialize type-specific properties
    switch (newType) {
      case 'enum':
        newField.enumValues = ['option1', 'option2'];
        break;
      case 'number':
        newField.range = {};
        break;
      case 'array':
        newField.elementType = createDefaultField('string');
        break;
      case 'object':
        newField.properties = [];
        break;
    }

    onChange(newField);
  };

  /**
   * Add a new property to an object field
   */
  const addObjectProperty = () => {
    if (field.type !== 'object') return;
    const newProperty = createDefaultField('string', '');
    updateField('properties', [...(field.properties || []), newProperty]);
  };

  /**
   * Update a property in an object field
   */
  const updateObjectProperty = (index: number, updatedProperty: SchemaField) => {
    if (field.type !== 'object' || !field.properties) return;
    const newProperties = [...field.properties];
    newProperties[index] = updatedProperty;
    updateField('properties', newProperties);
  };

  /**
   * Delete a property from an object field
   */
  const deleteObjectProperty = (index: number) => {
    if (field.type !== 'object' || !field.properties) return;
    updateField(
      'properties',
      field.properties.filter((_, i) => i !== index)
    );
  };

  /**
   * Add an enum value
   */
  const addEnumValue = () => {
    if (field.type !== 'enum') return;
    const values = field.enumValues || [];
    updateField('enumValues', [...values, `option${values.length + 1}`]);
  };

  /**
   * Update an enum value
   */
  const updateEnumValue = (index: number, value: string) => {
    if (field.type !== 'enum' || !field.enumValues) return;
    const newValues = [...field.enumValues];
    newValues[index] = value;
    updateField('enumValues', newValues);
  };

  /**
   * Delete an enum value
   */
  const deleteEnumValue = (index: number) => {
    if (field.type !== 'enum' || !field.enumValues) return;
    updateField(
      'enumValues',
      field.enumValues.filter((_, i) => i !== index)
    );
  };

  return (
    <div
      className={cn(
        'border rounded-lg bg-background',
        depth > 0 && 'border-dashed'
      )}
    >
      {/* Main field row */}
      <div className="flex items-center gap-2 p-3">
        {/* Drag handle (for future drag-and-drop) */}
        <div className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Expand/collapse for nested content */}
        {hasNestedContent && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-muted rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Field name input */}
        <Input
          value={field.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="field name"
          className="w-32 sm:w-40 h-9"
        />

        {/* Type selector */}
        <Select
          value={field.type}
          onValueChange={(value) => handleTypeChange(value as SchemaFieldType)}
        >
          <SelectTrigger className="w-28 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Optional toggle */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Switch
            id={`optional-${field.id}`}
            checked={field.isOptional ?? false}
            onCheckedChange={(checked) => updateField('isOptional', checked)}
            className="scale-90"
          />
          <Label
            htmlFor={`optional-${field.id}`}
            className="text-xs text-muted-foreground cursor-pointer"
          >
            Optional
          </Label>
        </div>

        {/* Delete button */}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Nested content (expanded) */}
      {hasNestedContent && isExpanded && (
        <div className="px-3 pb-3 pt-0 ml-6 space-y-3">
          {/* Enum values */}
          {field.type === 'enum' && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Allowed Values
              </Label>
              <div className="space-y-1">
                {(field.enumValues || []).map((value, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={value}
                      onChange={(e) => updateEnumValue(index, e.target.value)}
                      placeholder="value"
                      className="h-8 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteEnumValue(index)}
                      className="h-8 w-8 shrink-0"
                      disabled={(field.enumValues?.length || 0) <= 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addEnumValue}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Value
              </Button>
            </div>
          )}

          {/* Number range */}
          {field.type === 'number' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Min:</Label>
                <Input
                  type="number"
                  value={field.range?.min ?? ''}
                  onChange={(e) =>
                    updateField('range', {
                      ...field.range,
                      min: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  placeholder="none"
                  className="w-20 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Max:</Label>
                <Input
                  type="number"
                  value={field.range?.max ?? ''}
                  onChange={(e) =>
                    updateField('range', {
                      ...field.range,
                      max: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  placeholder="none"
                  className="w-20 h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* Array element type */}
          {field.type === 'array' && field.elementType && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Element Type
              </Label>
              <SchemaFieldComponent
                field={{ ...field.elementType, name: '(element)' }}
                onChange={(updated) => updateField('elementType', { ...updated, name: '' })}
                onDelete={() => {}}
                depth={depth + 1}
                canDelete={false}
              />
            </div>
          )}

          {/* Object properties */}
          {field.type === 'object' && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Properties
              </Label>
              <div className="space-y-2">
                {(field.properties || []).map((prop, index) => (
                  <SchemaFieldComponent
                    key={prop.id}
                    field={prop}
                    onChange={(updated) => updateObjectProperty(index, updated)}
                    onDelete={() => deleteObjectProperty(index)}
                    depth={depth + 1}
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addObjectProperty}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Property
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SchemaFieldComponent;
