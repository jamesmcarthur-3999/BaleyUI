'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

interface TestConnectionButtonProps {
  connectionId?: string;
  type?: 'openai' | 'anthropic' | 'ollama';
  config?: {
    apiKey?: string;
    baseUrl?: string;
    organization?: string;
  };
  onTestComplete?: (success: boolean) => void;
}

export function TestConnectionButton({
  connectionId,
  type,
  config,
  onTestComplete,
}: TestConnectionButtonProps) {
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const { toast } = useToast();

  const testMutation = trpc.connections.test.useMutation({
    onSuccess: (result) => {
      setLastResult(result);
      toast({
        title: result.success ? 'Connection Successful' : 'Connection Failed',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      onTestComplete?.(result.success);
    },
    onError: (error) => {
      setLastResult({
        success: false,
        message: error.message,
      });
      toast({
        title: 'Test Failed',
        description: error.message,
        variant: 'destructive',
      });
      onTestComplete?.(false);
    },
    onSettled: () => {
      setTesting(false);
    },
  });

  const handleTest = () => {
    setTesting(true);
    testMutation.mutate({
      id: connectionId,
      type,
      config,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleTest}
        disabled={testing}
      >
        {testing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Testing...
          </>
        ) : (
          'Test Connection'
        )}
      </Button>

      {lastResult && !testing && (
        <div className="flex items-center gap-1 text-sm">
          {lastResult.success ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-green-600">Connected</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-600">Failed</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
