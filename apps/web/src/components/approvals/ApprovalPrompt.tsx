'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Check,
  X,
  BookmarkPlus,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ApproveAndRememberDialog } from './ApproveAndRememberDialog';

export interface ToolCallDetails {
  id: string;
  tool: string;
  toolDescription?: string;
  action: string;
  parameters: Record<string, unknown>;
  dangerLevel?: 'safe' | 'moderate' | 'dangerous';
  entityName?: string;
  entityGoal?: string;
}

export interface ApprovalPromptProps {
  toolCall: ToolCallDetails;
  executionId: string;
  baleybotName: string;
  onApprove: () => Promise<void>;
  onDeny: (reason?: string) => Promise<void>;
  onApproveAndRemember: (pattern: PatternDefinition) => Promise<void>;
  isProcessing?: boolean;
}

export interface PatternDefinition {
  tool: string;
  actionPattern: Record<string, unknown>;
  entityGoalPattern?: string;
  trustLevel: 'provisional' | 'trusted' | 'permanent';
}

export function ApprovalPrompt({
  toolCall,
  executionId,
  baleybotName,
  onApprove,
  onDeny,
  onApproveAndRemember,
  isProcessing = false,
}: ApprovalPromptProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showRememberDialog, setShowRememberDialog] = useState(false);
  const [localProcessing, setLocalProcessing] = useState<
    'approve' | 'deny' | 'remember' | null
  >(null);

  const handleApprove = async () => {
    setLocalProcessing('approve');
    try {
      await onApprove();
    } finally {
      setLocalProcessing(null);
    }
  };

  const handleDeny = async () => {
    setLocalProcessing('deny');
    try {
      await onDeny();
    } finally {
      setLocalProcessing(null);
    }
  };

  const handleRemember = async (pattern: PatternDefinition) => {
    setLocalProcessing('remember');
    try {
      await onApproveAndRemember(pattern);
      setShowRememberDialog(false);
    } finally {
      setLocalProcessing(null);
    }
  };

  const getDangerBadge = () => {
    switch (toolCall.dangerLevel) {
      case 'dangerous':
        return (
          <Badge variant="destructive" className="ml-2">
            <AlertTriangle className="h-3 w-3 mr-1" />
            High Risk
          </Badge>
        );
      case 'moderate':
        return (
          <Badge variant="secondary" className="ml-2 bg-yellow-100 text-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Moderate Risk
          </Badge>
        );
      default:
        return null;
    }
  };

  const processing = isProcessing || localProcessing !== null;

  return (
    <>
      <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
              Approval Required
              {getDangerBadge()}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{baleybotName}</span> wants to use{' '}
            <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
              {toolCall.tool}
            </span>
          </p>
        </CardHeader>

        {isExpanded && (
          <CardContent className="space-y-4">
            {/* Tool Details */}
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Action:</span>{' '}
                <span className="font-medium">{toolCall.action}</span>
              </div>

              {toolCall.toolDescription && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Description:</span>{' '}
                  <span>{toolCall.toolDescription}</span>
                </div>
              )}

              {toolCall.entityName && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Entity:</span>{' '}
                  <span className="font-medium">{toolCall.entityName}</span>
                </div>
              )}
            </div>

            {/* Parameters */}
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Parameters:</div>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                {JSON.stringify(toolCall.parameters, null, 2)}
              </pre>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={handleApprove}
                disabled={processing}
                size="sm"
                className="bg-green-600 hover:bg-green-700"
              >
                {localProcessing === 'approve' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Approve
              </Button>

              <Button
                onClick={handleDeny}
                disabled={processing}
                size="sm"
                variant="destructive"
              >
                {localProcessing === 'deny' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                Deny
              </Button>

              <Button
                onClick={() => setShowRememberDialog(true)}
                disabled={processing}
                size="sm"
                variant="outline"
              >
                <BookmarkPlus className="h-4 w-4 mr-2" />
                Approve &amp; Remember
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Execution ID: {executionId}
            </p>
          </CardContent>
        )}
      </Card>

      <ApproveAndRememberDialog
        open={showRememberDialog}
        onOpenChange={setShowRememberDialog}
        toolCall={toolCall}
        onConfirm={handleRemember}
        isProcessing={localProcessing === 'remember'}
      />
    </>
  );
}
