'use client';

/**
 * SchemaForm Component
 *
 * Generates a form from a JSON Schema.
 * Supports basic types: string, number, boolean, array, object
 * Falls back to JSON textarea for complex schemas.
 */

import { useState, useCallback, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, AlertCircle, Code2, FormInput } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: (string | number | boolean)[];
  default?: unknown;
  description?: string;
  title?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

export interface SchemaFormProps {
  /** JSON Schema to generate form from */
  schema?: JSONSchema;
  /** Current form value */
  value: Record<string, unknown>;
  /** Callback when value changes */
  onChange: (value: Record<string, unknown>) => void;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Schema Analysis
// ============================================================================

function isSimpleSchema(schema?: JSONSchema): boolean {
  if (!schema || !schema.properties) return false;

  const props = Object.values(schema.properties);
  if (props.length > 10) return false; // Too many properties

  return props.every((prop) => {
    const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
    if (type === 'object') {
      // Only allow one level of nesting
      return !prop.properties;
    }
    if (type === 'array') {
      // Only simple arrays
      const itemType = prop.items?.type;
      return itemType === 'string' || itemType === 'number';
    }
    return ['string', 'number', 'integer', 'boolean'].includes(type || '');
  });
}

// ============================================================================
// Field Components
// ============================================================================

interface FieldProps {
  name: string;
  schema: JSONSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
  disabled?: boolean;
}

function StringField({ name, schema, value, onChange, required, disabled }: FieldProps) {
  const hasEnum = schema.enum && schema.enum.length > 0;
  const isLongText = schema.format === 'textarea' || (schema.maxLength && schema.maxLength > 200);

  if (hasEnum) {
    return (
      <Select
        value={String(value || '')}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={`Select ${schema.title || name}...`} />
        </SelectTrigger>
        <SelectContent>
          {schema.enum!.map((option) => (
            <SelectItem key={String(option)} value={String(option)}>
              {String(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (isLongText) {
    return (
      <Textarea
        value={String(value || '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={schema.description || `Enter ${schema.title || name}...`}
        disabled={disabled}
        className="min-h-[80px]"
      />
    );
  }

  return (
    <Input
      type={schema.format === 'email' ? 'email' : schema.format === 'uri' ? 'url' : 'text'}
      value={String(value || '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder={schema.description || `Enter ${schema.title || name}...`}
      disabled={disabled}
      minLength={schema.minLength}
      maxLength={schema.maxLength}
      pattern={schema.pattern}
    />
  );
}

function NumberField({ name, schema, value, onChange, disabled }: FieldProps) {
  return (
    <Input
      type="number"
      value={value !== undefined ? String(value) : ''}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val === '' ? undefined : Number(val));
      }}
      placeholder={schema.description || `Enter ${schema.title || name}...`}
      disabled={disabled}
      min={schema.minimum}
      max={schema.maximum}
    />
  );
}

function BooleanField({ schema, value, onChange, disabled }: FieldProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={Boolean(value)}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      {schema.description && (
        <span className="text-sm text-muted-foreground">{schema.description}</span>
      )}
    </div>
  );
}

function ArrayField({ name, schema, value, onChange, disabled }: FieldProps) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = schema.items || { type: 'string' };
  const itemType = Array.isArray(itemSchema.type) ? itemSchema.type[0] : itemSchema.type;

  const addItem = () => {
    const defaultValue = itemType === 'number' ? 0 : '';
    onChange([...items, defaultValue]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, newValue: unknown) => {
    const newItems = [...items];
    newItems[index] = newValue;
    onChange(newItems);
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {itemType === 'number' ? (
            <Input
              type="number"
              value={String(item)}
              onChange={(e) => updateItem(index, Number(e.target.value))}
              disabled={disabled}
              className="flex-1"
            />
          ) : (
            <Input
              value={String(item)}
              onChange={(e) => updateItem(index, e.target.value)}
              disabled={disabled}
              className="flex-1"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeItem(index)}
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addItem}
        disabled={disabled}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add Item
      </Button>
    </div>
  );
}

function SchemaField({ name, schema, value, onChange, required, disabled }: FieldProps) {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (type) {
    case 'string':
      return <StringField name={name} schema={schema} value={value} onChange={onChange} required={required} disabled={disabled} />;
    case 'number':
    case 'integer':
      return <NumberField name={name} schema={schema} value={value} onChange={onChange} required={required} disabled={disabled} />;
    case 'boolean':
      return <BooleanField name={name} schema={schema} value={value} onChange={onChange} required={required} disabled={disabled} />;
    case 'array':
      return <ArrayField name={name} schema={schema} value={value} onChange={onChange} required={required} disabled={disabled} />;
    default:
      // For complex types, show a JSON textarea
      return (
        <Textarea
          value={typeof value === 'string' ? value : JSON.stringify(value || '', null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              // Keep as string if not valid JSON
              onChange(e.target.value);
            }
          }}
          placeholder="Enter JSON..."
          disabled={disabled}
          className="font-mono text-sm min-h-[60px]"
        />
      );
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function SchemaForm({
  schema,
  value,
  onChange,
  disabled = false,
  className,
}: SchemaFormProps) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonValue, setJsonValue] = useState(() => JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const canUseForm = useMemo(() => isSimpleSchema(schema), [schema]);

  const handleJsonChange = useCallback((newJson: string) => {
    setJsonValue(newJson);
    try {
      const parsed = JSON.parse(newJson);
      onChange(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, [onChange]);

  const handleFieldChange = useCallback((fieldName: string, fieldValue: unknown) => {
    const newValue = { ...value, [fieldName]: fieldValue };
    onChange(newValue);
    setJsonValue(JSON.stringify(newValue, null, 2));
  }, [value, onChange]);

  // If no schema or complex schema, show JSON only
  if (!schema || !schema.properties) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 mb-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Input (JSON)</Label>
        </div>
        <Textarea
          value={jsonValue}
          onChange={(e) => handleJsonChange(e.target.value)}
          placeholder='{"key": "value"}'
          disabled={disabled}
          className={cn(
            "font-mono text-sm min-h-[120px]",
            jsonError && "border-red-500"
          )}
        />
        {jsonError && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {jsonError}
          </p>
        )}
      </div>
    );
  }

  const properties = schema.properties || {};
  const required = schema.required || [];

  return (
    <div className={className}>
      {/* Mode toggle */}
      {canUseForm && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <Button
            type="button"
            variant={mode === 'form' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('form')}
          >
            <FormInput className="h-4 w-4 mr-1" />
            Form
          </Button>
          <Button
            type="button"
            variant={mode === 'json' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('json')}
          >
            <Code2 className="h-4 w-4 mr-1" />
            JSON
          </Button>
        </div>
      )}

      {mode === 'json' || !canUseForm ? (
        // JSON mode
        <div>
          <Textarea
            value={jsonValue}
            onChange={(e) => handleJsonChange(e.target.value)}
            placeholder='{"key": "value"}'
            disabled={disabled}
            className={cn(
              "font-mono text-sm min-h-[160px]",
              jsonError && "border-red-500"
            )}
          />
          {jsonError && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {jsonError}
            </p>
          )}
        </div>
      ) : (
        // Form mode
        <div className="space-y-4">
          {Object.entries(properties).map(([fieldName, fieldSchema]) => {
            const isRequired = required.includes(fieldName);
            const fieldValue = value[fieldName];

            return (
              <div key={fieldName}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Label htmlFor={fieldName} className="text-sm font-medium">
                    {fieldSchema.title || fieldName}
                  </Label>
                  {isRequired && (
                    <Badge variant="secondary" className="text-[10px] px-1">
                      required
                    </Badge>
                  )}
                </div>
                {fieldSchema.description && !['boolean'].includes(
                  (Array.isArray(fieldSchema.type) ? fieldSchema.type[0] : fieldSchema.type) || ''
                ) && (
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {fieldSchema.description}
                  </p>
                )}
                <SchemaField
                  name={fieldName}
                  schema={fieldSchema}
                  value={fieldValue}
                  onChange={(newValue) => handleFieldChange(fieldName, newValue)}
                  required={isRequired}
                  disabled={disabled}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
