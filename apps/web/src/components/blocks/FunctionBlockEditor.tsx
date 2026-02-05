'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Editor from '@monaco-editor/react';

interface FunctionBlockEditorProps {
  block: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

export function FunctionBlockEditor({ block, onChange }: FunctionBlockEditorProps) {
  const [code, setCode] = useState((block.code as string) || '');
  const [inputSchema, setInputSchema] = useState(
    JSON.stringify(block.inputSchema || {}, null, 2)
  );
  const [outputSchema, setOutputSchema] = useState(
    JSON.stringify(block.outputSchema || {}, null, 2)
  );

  useEffect(() => {
    try {
      onChange({
        code,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : {},
        outputSchema: outputSchema ? JSON.parse(outputSchema) : {},
      });
    } catch (error) {
      // Invalid JSON, don't update
      console.error('Invalid JSON schema:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, inputSchema, outputSchema]);

  return (
    <div className="space-y-6">
      {/* Code Editor */}
      <Card>
        <CardHeader>
          <CardTitle>Function Code</CardTitle>
          <CardDescription>
            Write JavaScript/TypeScript code for this function block
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Editor
              height="400px"
              defaultLanguage="typescript"
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The function should export a default async function that takes input and returns output.
          </p>
          <div className="mt-4 p-4 bg-muted rounded-md">
            <p className="text-xs font-mono">
              {`// Example:\nexport default async function(input) {\n  // Your code here\n  return { result: "success" };\n}`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Schemas */}
      <Card>
        <CardHeader>
          <CardTitle>Schemas</CardTitle>
          <CardDescription>Define input and output schemas (JSON)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inputSchema">Input Schema</Label>
            <Textarea
              id="inputSchema"
              value={inputSchema}
              onChange={(e) => setInputSchema(e.target.value)}
              placeholder='{"type": "object", "properties": {...}}'
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              JSON schema defining the expected input format.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outputSchema">Output Schema</Label>
            <Textarea
              id="outputSchema"
              value={outputSchema}
              onChange={(e) => setOutputSchema(e.target.value)}
              placeholder='{"type": "object", "properties": {...}}'
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              JSON schema defining the expected output format.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
