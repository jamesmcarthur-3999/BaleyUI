'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function FormsShowcase() {
  const [switched, setSwitched] = useState(true);
  const [checked, setChecked] = useState(true);
  const [slider, setSlider] = useState([65]);

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Text Inputs</h3>
        <div className="space-y-3">
          <Input placeholder="Default input" />
          <Input placeholder="Disabled input" disabled />
          <Textarea placeholder="Textarea for longer content..." rows={3} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Select</h3>
        <Select defaultValue="option1">
          <SelectTrigger>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option One</SelectItem>
            <SelectItem value="option2">Option Two</SelectItem>
            <SelectItem value="option3">Option Three</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Controls</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={switched} onCheckedChange={setSwitched} />
            <span className="text-sm">{switched ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            <span className="text-sm">{checked ? 'Checked' : 'Unchecked'}</span>
          </div>
          <div className="space-y-2">
            <span className="text-sm">Slider: {slider[0]}</span>
            <Slider value={slider} onValueChange={setSlider} max={100} step={1} />
          </div>
        </div>
      </div>
    </div>
  );
}
