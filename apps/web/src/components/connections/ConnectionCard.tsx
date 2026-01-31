'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PROVIDERS } from '@/lib/connections/providers';
import { Trash2, Star } from 'lucide-react';
import { TestConnectionButton } from './TestConnectionButton';

interface Connection {
  id: string;
  type: string;
  name: string;
  status: string | null;
  isDefault: boolean | null;
  config: any;
  createdAt: Date;
  lastCheckedAt: Date | null;
}

interface ConnectionCardProps {
  connection: Connection;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export function ConnectionCard({ connection, onDelete, onSetDefault }: ConnectionCardProps) {
  const provider = PROVIDERS[connection.type as keyof typeof PROVIDERS];

  const getStatusBadge = () => {
    switch (connection.status) {
      case 'connected':
        return <Badge className="bg-green-600 hover:bg-green-700">Connected</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Unconfigured</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>{connection.name}</CardTitle>
              {connection.isDefault && (
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              )}
            </div>
            <CardDescription>
              {provider?.name} - {provider?.description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Configuration Details */}
          <div className="space-y-2 text-sm">
            {connection.config.baseUrl && (
              <div>
                <span className="text-muted-foreground">Base URL:</span>{' '}
                <span className="font-mono text-xs">{connection.config.baseUrl}</span>
              </div>
            )}
            {connection.config._hasApiKey && (
              <div>
                <span className="text-muted-foreground">API Key:</span>{' '}
                <span className="font-mono text-xs">{connection.config.apiKey}</span>
              </div>
            )}
            {connection.lastCheckedAt && (
              <div>
                <span className="text-muted-foreground">Last checked:</span>{' '}
                <span className="text-xs">
                  {new Date(connection.lastCheckedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <TestConnectionButton connectionId={connection.id} />

            <div className="flex items-center gap-2">
              {!connection.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetDefault(connection.id)}
                >
                  Set as Default
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(connection.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
