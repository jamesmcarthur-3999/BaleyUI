'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseHSL, formatHSL, hslToHex, hexToHSL } from '@/lib/design-packages/css-variables';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  label: string;
  value: string; // HSL string: "262 83% 58%"
  onChange: (hsl: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const hex = hslToHex(value);
  const parsed = parseHSL(value);
  const [hexInput, setHexInput] = useState(hex);
  const [isValidHex, setIsValidHex] = useState(true);

  // Sync hex input when value changes externally (e.g. AI refinement)
  useEffect(() => {
    const newHex = hslToHex(value);
    setHexInput(newHex);
    setIsValidHex(true);
  }, [value]);

  const handleHexChange = (newHex: string) => {
    setHexInput(newHex);
    const valid = /^#[0-9a-fA-F]{6}$/.test(newHex);
    setIsValidHex(valid || newHex.length < 7); // Only show error after full input
    if (valid) {
      onChange(hexToHSL(newHex));
    }
  };

  const handleColorInput = (newHex: string) => {
    setHexInput(newHex);
    setIsValidHex(true);
    onChange(hexToHSL(newHex));
  };

  const handleHSLChange = (h: number, s: number, l: number) => {
    // Clamp values to valid ranges
    const clampedH = Math.max(0, Math.min(360, h));
    const clampedS = Math.max(0, Math.min(100, s));
    const clampedL = Math.max(0, Math.min(100, l));
    const newHSL = formatHSL(clampedH, clampedS, clampedL);
    onChange(newHSL);
    setHexInput(hslToHex(newHSL));
    setIsValidHex(true);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={hex}
            onChange={(e) => handleColorInput(e.target.value)}
            className="absolute inset-0 h-8 w-8 cursor-pointer opacity-0"
          />
          <div
            className="h-8 w-8 rounded-md border border-border shadow-sm transition-shadow hover:shadow-md cursor-pointer"
            style={{ backgroundColor: `hsl(${value})` }}
          />
        </div>
        <Input
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          className={cn(
            'h-8 w-24 font-mono text-xs transition-colors',
            !isValidHex && 'border-destructive focus-visible:ring-destructive/50'
          )}
          placeholder="#000000"
          maxLength={7}
        />
      </div>
      {parsed ? (
        <div className="flex gap-1.5">
          <div className="space-y-0.5">
            <span className="text-[9px] uppercase text-muted-foreground/60 font-medium">H</span>
            <Input
              type="number"
              min={0}
              max={360}
              value={Math.round(parsed.h)}
              onChange={(e) => handleHSLChange(Number(e.target.value), parsed.s, parsed.l)}
              className="h-7 w-14 text-xs text-center"
            />
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] uppercase text-muted-foreground/60 font-medium">S</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={Math.round(parsed.s)}
              onChange={(e) => handleHSLChange(parsed.h, Number(e.target.value), parsed.l)}
              className="h-7 w-14 text-xs text-center"
            />
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] uppercase text-muted-foreground/60 font-medium">L</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={Math.round(parsed.l)}
              onChange={(e) => handleHSLChange(parsed.h, parsed.s, Number(e.target.value))}
              className="h-7 w-14 text-xs text-center"
            />
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-destructive">Invalid color format</div>
      )}
    </div>
  );
}
