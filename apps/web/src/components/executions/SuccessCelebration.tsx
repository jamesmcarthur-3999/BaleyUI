'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, PartyPopper, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SuccessCelebrationProps {
  show: boolean;
  message?: string;
  duration?: number;
  className?: string;
}

// Particle component for the celebration effect
function Particle({
  index,
  color,
}: {
  index: number;
  color: string;
}) {
  const randomAngle = (index * 137.5) % 360; // Golden angle distribution
  const randomDistance = 50 + Math.random() * 100;
  const randomDelay = Math.random() * 0.3;
  const randomScale = 0.5 + Math.random() * 0.5;

  return (
    <div
      className="absolute w-2 h-2 rounded-full animate-celebration-particle"
      style={{
        backgroundColor: color,
        '--tx': `${Math.cos((randomAngle * Math.PI) / 180) * randomDistance}px`,
        '--ty': `${Math.sin((randomAngle * Math.PI) / 180) * randomDistance}px`,
        animationDelay: `${randomDelay}s`,
        transform: `scale(${randomScale})`,
      } as React.CSSProperties}
    />
  );
}

export function SuccessCelebration({
  show,
  message = 'Execution Complete!',
  duration = 3000,
  className,
}: SuccessCelebrationProps) {
  const [visible, setVisible] = useState(false);
  const [particles, setParticles] = useState<{ id: number; color: string }[]>([]);

  useEffect(() => {
    if (show) {
      setVisible(true);

      // Create particles
      const colors = [
        '#22c55e', // green
        '#3b82f6', // blue
        '#f59e0b', // amber
        '#8b5cf6', // purple
        '#ec4899', // pink
      ];

      const newParticles = Array.from({ length: 24 }, (_, i) => ({
        id: i,
        color: colors[i % colors.length]!,
      }));
      setParticles(newParticles);

      // Hide after duration
      const timer = setTimeout(() => {
        setVisible(false);
        setParticles([]);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center pointer-events-none',
        className
      )}
    >
      {/* Backdrop flash */}
      <div className="absolute inset-0 bg-green-500/5 animate-celebration-flash" />

      {/* Central success indicator */}
      <div className="relative animate-celebration-bounce">
        {/* Particles container */}
        <div className="absolute inset-0 flex items-center justify-center">
          {particles.map((particle) => (
            <Particle
              key={particle.id}
              index={particle.id}
              color={particle.color}
            />
          ))}
        </div>

        {/* Main icon and message */}
        <div className="relative flex flex-col items-center gap-3 p-6 bg-background/95 backdrop-blur border rounded-2xl shadow-2xl animate-celebration-scale">
          <div className="relative">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <Sparkles className="absolute -top-1 -right-1 h-6 w-6 text-yellow-500 animate-pulse" />
          </div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <PartyPopper className="h-5 w-5 text-amber-500" />
            <span>{message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Add these to your globals.css:
// @keyframes celebration-particle {
//   0% { opacity: 1; transform: translate(0, 0) scale(1); }
//   100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0); }
// }
// @keyframes celebration-flash { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
// @keyframes celebration-bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
// @keyframes celebration-scale { 0% { opacity: 0; transform: scale(0.5); } 100% { opacity: 1; transform: scale(1); } }
