'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wand2,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Code,
  FormInput,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

interface InputBuilderProps {
  value: string;
  onChange: (value: string) => void;
  schema?: JSONSchema;
  className?: string;
  disabled?: boolean;
}

export function InputBuilder({
  value,
  onChange,
  schema,
  className,
  disabled = false,
}: InputBuilderProps) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // Initialize form data from value
  useEffect(() => {
    if (value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null) {
          setFormData(parsed);
        }
      } catch {
        // Invalid JSON, keep current form data
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validate JSON when in JSON mode
  useEffect(() => {
    if (mode === 'json' && value.trim()) {
      try {
        JSON.parse(value);
        setJsonError(null);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    } else {
      setJsonError(null);
    }
  }, [value, mode]);

  const handleFormChange = (key: string, val: unknown) => {
    const newData = { ...formData, [key]: val };
    setFormData(newData);
    onChange(JSON.stringify(newData, null, 2));
  };

  const handleAddArrayItem = (key: string) => {
    const currentArray = Array.isArray(formData[key]) ? formData[key] : [];
    const newArray = [...(currentArray as unknown[]), ''];
    handleFormChange(key, newArray);
  };

  const handleRemoveArrayItem = (key: string, index: number) => {
    const currentArray = Array.isArray(formData[key]) ? formData[key] : [];
    const newArray = (currentArray as unknown[]).filter((_, i) => i !== index);
    handleFormChange(key, newArray);
  };

  const handleArrayItemChange = (key: string, index: number, val: unknown) => {
    const currentArray = Array.isArray(formData[key]) ? formData[key] : [];
    const newArray = [...(currentArray as unknown[])];
    newArray[index] = val;
    handleFormChange(key, newArray);
  };

  const generateSampleData = () => {
    if (!schema || !schema.properties) {
      // Generate generic sample
      const sample = {
        prompt: 'Hello, world!',
        options: {
          temperature: 0.7,
          maxTokens: 1000,
        },
      };
      const json = JSON.stringify(sample, null, 2);
      onChange(json);
      setFormData(sample);
      return;
    }

    // Generate from schema
    const sample: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.default !== undefined) {
        sample[key] = prop.default;
      } else if (prop.enum && prop.enum.length > 0) {
        sample[key] = prop.enum[0];
      } else {
        switch (prop.type) {
          case 'string':
            sample[key] = `Example ${key}`;
            break;
          case 'number':
          case 'integer':
            sample[key] = 42;
            break;
          case 'boolean':
            sample[key] = true;
            break;
          case 'array':
            sample[key] = [];
            break;
          case 'object':
            sample[key] = {};
            break;
          default:
            sample[key] = null;
        }
      }
    }

    const json = JSON.stringify(sample, null, 2);
    onChange(json);
    setFormData(sample);
  };

  const formatJSON = () => {
    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      onChange(formatted);
    } catch {
      // Error already shown
    }
  };

  const renderFormField = (key: string, prop: JSONSchema) => {
    const fieldValue = formData[key];
    const isRequired = schema?.required?.includes(key) || false;

    switch (prop.type) {
      case 'string':
        if (prop.enum) {
          return (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>
                {key}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {prop.description && (
                <p className="text-xs text-muted-foreground">{prop.description}</p>
              )}
              <select
                id={key}
                value={fieldValue as string || ''}
                onChange={(e) => handleFormChange(key, e.target.value)}
                disabled={disabled}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select...</option>
                {prop.enum.map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>
              {key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {prop.description && (
              <p className="text-xs text-muted-foreground">{prop.description}</p>
            )}
            <Textarea
              id={key}
              value={fieldValue as string || ''}
              onChange={(e) => handleFormChange(key, e.target.value)}
              disabled={disabled}
              rows={3}
              placeholder={`Enter ${key}...`}
            />
          </div>
        );

      case 'number':
      case 'integer':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>
              {key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {prop.description && (
              <p className="text-xs text-muted-foreground">{prop.description}</p>
            )}
            <Input
              id={key}
              type="number"
              value={fieldValue as number || ''}
              onChange={(e) => handleFormChange(key, parseFloat(e.target.value))}
              disabled={disabled}
              placeholder={`Enter ${key}...`}
            />
          </div>
        );

      case 'boolean':
        return (
          <div key={key} className="flex items-center justify-between space-x-2 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={key}>{key}</Label>
              {prop.description && (
                <p className="text-xs text-muted-foreground">{prop.description}</p>
              )}
            </div>
            <Checkbox
              id={key}
              checked={fieldValue as boolean || false}
              onCheckedChange={(checked: boolean) => handleFormChange(key, checked)}
              disabled={disabled}
            />
          </div>
        );

      case 'array':
        const arrayValue = Array.isArray(fieldValue) ? fieldValue : [];
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {key}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddArrayItem(key)}
                disabled={disabled}
                className="h-7"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>
            {prop.description && (
              <p className="text-xs text-muted-foreground">{prop.description}</p>
            )}
            <div className="space-y-2">
              {arrayValue.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={item as string || ''}
                    onChange={(e) => handleArrayItemChange(key, index, e.target.value)}
                    disabled={disabled}
                    placeholder={`Item ${index + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveArrayItem(key, index)}
                    disabled={disabled}
                    className="h-10 w-10 p-0"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );

      case 'object':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>
              {key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {prop.description && (
              <p className="text-xs text-muted-foreground">{prop.description}</p>
            )}
            <Textarea
              id={key}
              value={JSON.stringify(fieldValue || {}, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  handleFormChange(key, parsed);
                } catch {
                  // Invalid JSON, don't update
                }
              }}
              disabled={disabled}
              rows={5}
              placeholder={`{}`}
              className="font-mono text-sm"
            />
          </div>
        );

      default:
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>
              {key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {prop.description && (
              <p className="text-xs text-muted-foreground">{prop.description}</p>
            )}
            <Input
              id={key}
              value={fieldValue as string || ''}
              onChange={(e) => handleFormChange(key, e.target.value)}
              disabled={disabled}
              placeholder={`Enter ${key}...`}
            />
          </div>
        );
    }
  };

  const hasSchema = schema && schema.properties && Object.keys(schema.properties).length > 0;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Input Builder</CardTitle>
            <CardDescription>Configure test input for block execution</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generateSampleData}
            disabled={disabled}
          >
            <Wand2 className="h-4 w-4 mr-2" />
            Generate Sample
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'form' | 'json')}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="form" disabled={!hasSchema}>
              <FormInput className="h-4 w-4 mr-2" />
              Form
            </TabsTrigger>
            <TabsTrigger value="json">
              <Code className="h-4 w-4 mr-2" />
              JSON
            </TabsTrigger>
          </TabsList>

          {/* Form Mode */}
          <TabsContent value="form">
            {hasSchema ? (
              <div className="space-y-4">
                {Object.entries(schema.properties || {}).map(([key, prop]) =>
                  renderFormField(key, prop)
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-center">
                <div>
                  <FormInput className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No schema available for form mode
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use JSON mode to enter custom input
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* JSON Mode */}
          <TabsContent value="json">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  JSON Input
                  {value.trim() && (
                    <Badge variant={jsonError ? 'error' : 'connected'} className="text-xs">
                      {jsonError ? (
                        <>
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Invalid
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Valid
                        </>
                      )}
                    </Badge>
                  )}
                </Label>
                {!jsonError && value.trim() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={formatJSON}
                    disabled={disabled}
                    className="h-7"
                  >
                    <Wand2 className="h-3 w-3 mr-1" />
                    Format
                  </Button>
                )}
              </div>

              <Textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                rows={15}
                placeholder='{\n  "prompt": "Your prompt here"\n}'
                className={cn(
                  'font-mono text-sm resize-none',
                  jsonError && 'border-red-500 focus-visible:ring-red-500'
                )}
              />

              {jsonError && (
                <div className="flex items-start gap-2 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span className="font-mono">{jsonError}</span>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
