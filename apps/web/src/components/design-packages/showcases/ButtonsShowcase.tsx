'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, ArrowRight, Download, Trash2 } from 'lucide-react';

export function ButtonsShowcase() {
  const [count, setCount] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Variants</h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCount((c) => c + 1)}>
            Default ({count})
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Sizes</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon"><Plus className="h-4 w-4" /></Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">With Icons</h3>
        <div className="flex flex-wrap gap-2">
          <Button><Plus className="mr-2 h-4 w-4" />Create New</Button>
          <Button variant="outline">Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
          <Button variant="secondary"><Download className="mr-2 h-4 w-4" />Download</Button>
          <Button variant="destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">States</h3>
        <div className="flex flex-wrap gap-2">
          <Button disabled>Disabled</Button>
          <Button disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</Button>
        </div>
      </div>
    </div>
  );
}
