'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BalCodeEditor } from '@/components/baleybot';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Copy, Check, BookOpen, ExternalLink } from 'lucide-react';
import { parseBalCode, type ParseResult } from './actions';

/**
 * Example BAL templates
 */
const TEMPLATES: Record<string, { name: string; description: string; code: string }> = {
  simple: {
    name: 'Simple Assistant',
    description: 'A basic single-entity assistant',
    code: `# Simple Assistant
# A basic helper that answers questions

assistant {
  "goal": "Help users answer questions clearly and concisely"
}

run("What is the capital of France?")`,
  },
  sentiment: {
    name: 'Sentiment Analysis',
    description: 'Analyze sentiment with structured output',
    code: `# Sentiment Analyzer
# Returns structured sentiment analysis

analyzer {
  "goal": "Analyze the emotional sentiment of the input text",
  "output": {
    "sentiment": "enum('positive', 'negative', 'neutral')",
    "confidence": "number(0, 1)",
    "keywords": "array<string>"
  }
}

run("I absolutely love this product! It exceeded all my expectations.")`,
  },
  chain: {
    name: 'Research Chain',
    description: 'Chain entities for research and writing',
    code: `# Research and Write Chain
# Demonstrates sequential processing

researcher {
  "goal": "Research the given topic and extract key findings",
  "output": {
    "findings": "array<string>",
    "sources": "array<string>"
  }
}

writer {
  "goal": "Write a clear summary based on the research findings",
  "output": {
    "summary": "string",
    "word_count": "number"
  }
}

chain {
  researcher => research
  writer with { findings: $research.findings }
}

run("Recent advances in quantum computing")`,
  },
  parallel: {
    name: 'Parallel Analysis',
    description: 'Run multiple analyses concurrently',
    code: `# Parallel Multi-Analysis
# Process text with multiple analyzers simultaneously

sentiment {
  "goal": "Analyze the emotional tone",
  "output": { "score": "number(-1, 1)" }
}

keywords {
  "goal": "Extract important keywords and phrases",
  "output": { "keywords": "array<string>" }
}

topics {
  "goal": "Identify main topics and themes",
  "output": { "topics": "array<string>" }
}

parallel {
  sentiment
  keywords
  topics
}

run("The new electric vehicle market is experiencing rapid growth...")`,
  },
  conditional: {
    name: 'Conditional Routing',
    description: 'Route based on classification results',
    code: `# Conditional Routing
# Route to different handlers based on classification

classifier {
  "goal": "Classify the type of customer inquiry",
  "output": {
    "type": "enum('sales', 'support', 'billing')",
    "urgency": "enum('low', 'medium', 'high')"
  }
}

sales_agent {
  "goal": "Handle sales inquiries with product information"
}

support_agent {
  "goal": "Provide technical support and troubleshooting"
}

billing_agent {
  "goal": "Address billing and payment questions"
}

chain {
  classifier => classification
  if ("$classification.type == 'sales'") {
    sales_agent
  } else {
    if ("$classification.type == 'support'") {
      support_agent
    } else {
      billing_agent
    }
  }
}

run("I need help with my invoice from last month")`,
  },
  loop: {
    name: 'Iterative Refinement',
    description: 'Loop until quality threshold is met',
    code: `# Iterative Content Refinement
# Keep improving until quality score is high enough

writer {
  "goal": "Write content on the given topic"
}

reviewer {
  "goal": "Review content and provide quality score and feedback",
  "output": {
    "quality": "number(0, 10)",
    "feedback": "array<string>"
  }
}

chain {
  writer => draft
  loop ("until": "result.quality > 8", "max": 3) {
    reviewer
    writer with {
      previous: $draft,
      feedback: result.feedback
    }
  }
}

run("Write a haiku about programming")`,
  },
};

/**
 * Interactive BAL Playground
 *
 * Allows users to experiment with BAL code without saving.
 * Features:
 * - Real-time syntax validation
 * - Example templates
 * - Parse result preview
 * - Share via URL (future)
 */
export default function PlaygroundPage() {
  const [code, setCode] = useState(TEMPLATES['simple']?.code ?? '');
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof TEMPLATES>('simple');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Parse the current code using server action
   */
  const handleParse = async () => {
    setIsParsing(true);

    try {
      const result = await parseBalCode(code);
      setParseResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setParseResult({
        success: false,
        error: message,
      });
    } finally {
      setIsParsing(false);
    }
  };

  /**
   * Handle template selection
   */
  const handleTemplateChange = (templateId: string) => {
    const template = TEMPLATES[templateId as keyof typeof TEMPLATES];
    if (template) {
      setSelectedTemplate(templateId as keyof typeof TEMPLATES);
      setCode(template.code);
      setParseResult(null);
    }
  };

  /**
   * Copy code to clipboard
   */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">BAL Playground</h1>
            <p className="text-sm text-muted-foreground">
              Experiment with BAL syntax without saving
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/docs/BAL_LANGUAGE_REFERENCE.md" target="_blank">
                <BookOpen className="h-4 w-4 mr-2" />
                Docs
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/baleybots/new">
                <ExternalLink className="h-4 w-4 mr-2" />
                Create BaleyBot
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor Section */}
          <div className="lg:col-span-2 space-y-4">
            {/* Template Selector */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TEMPLATES).map(([id, template]) => (
                      <SelectItem key={id} value={id}>
                        <div className="flex flex-col items-start">
                          <span>{template.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {template.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                title="Copy code"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Code Editor */}
            <BalCodeEditor
              value={code}
              onChange={setCode}
              height={500}
              className="shadow-lg"
            />

            {/* Action Bar */}
            <div className="flex items-center justify-between">
              <Button onClick={handleParse} disabled={isParsing}>
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Validate & Parse
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                {code.split('\n').length} lines
              </p>
            </div>
          </div>

          {/* Results Section */}
          <div className="space-y-4">
            {/* Parse Result Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Parse Result</CardTitle>
                <CardDescription>
                  Validation and structure analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                {parseResult === null ? (
                  <p className="text-sm text-muted-foreground">
                    Click &quot;Validate &amp; Parse&quot; to check your code.
                  </p>
                ) : parseResult.success ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-green-500">
                        Valid
                      </Badge>
                    </div>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Entities:</dt>
                        <dd className="font-medium">{parseResult.entityCount}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Composition:</dt>
                        <dd className="font-medium">
                          {parseResult.hasComposition ? 'Yes' : 'No'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Error</Badge>
                      {parseResult.errorLine && (
                        <span className="text-xs text-muted-foreground">
                          Line {parseResult.errorLine}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-destructive font-mono bg-destructive/10 p-2 rounded">
                      {parseResult.error}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Reference Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Reference</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <h4 className="font-medium mb-1">Entity Definition</h4>
                  <code className="text-xs bg-muted p-1 rounded block">
                    {'name { "goal": "..." }'}
                  </code>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Compositions</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>
                      <code>chain {'{ a b c }'}</code> - Sequential
                    </li>
                    <li>
                      <code>parallel {'{ a b }'}</code> - Concurrent
                    </li>
                    <li>
                      <code>if (&quot;cond&quot;) {'{ }'}</code> - Conditional
                    </li>
                    <li>
                      <code>loop (&quot;until&quot;: &quot;...&quot;, &quot;max&quot;: N) {'{ }'}</code> - Iterate
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Output Types</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>
                      <code>string</code>, <code>number</code>, <code>boolean</code>
                    </li>
                    <li>
                      <code>{"enum('a', 'b')"}</code>
                    </li>
                    <li>
                      <code>{'array<type>'}</code>
                    </li>
                    <li>
                      <code>{'object { field: type }'}</code>
                    </li>
                    <li>
                      <code>?type</code> - Optional
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
