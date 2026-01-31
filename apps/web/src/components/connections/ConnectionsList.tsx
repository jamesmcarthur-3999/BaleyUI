'use client';

import { ConnectionCard } from './ConnectionCard';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';

export function ConnectionsList() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: connections, isLoading } = trpc.connections.list.useQuery();

  const deleteMutation = trpc.connections.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Connection Deleted',
        description: 'The connection has been removed.',
      });
      utils.connections.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setDefaultMutation = trpc.connections.setDefault.useMutation({
    onSuccess: () => {
      toast({
        title: 'Default Updated',
        description: 'This connection is now the default for its provider.',
      });
      utils.connections.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading connections...</div>
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-medium">No connections yet</p>
        <p className="text-sm text-muted-foreground">
          Add your first AI provider connection to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connections.map((connection) => (
        <ConnectionCard
          key={connection.id}
          connection={connection}
          onDelete={(id) => deleteMutation.mutate({ id })}
          onSetDefault={(id) => setDefaultMutation.mutate({ id })}
        />
      ))}
    </div>
  );
}
