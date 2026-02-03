'use client';

import { useState, useCallback, useEffect, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VisualEntity, Connection, CreationStatus } from '@/lib/baleybot/creator-types';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface CanvasProps {
  /** Entities to display on the canvas */
  entities: VisualEntity[];
  /** Connections between entities */
  connections: Connection[];
  /** Current creation status */
  status: CreationStatus;
  /** Optional CSS class */
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Desktop dimensions
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const ENTITY_SPACING = 180;
const ENTITY_START_Y = 100;

// Mobile dimensions (Phase 4.1)
const MOBILE_CANVAS_WIDTH = 320;
const MOBILE_ENTITY_SPACING = 140;
const MOBILE_ENTITY_START_Y = 80;

// Zoom constants (Phase 5.3)
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;
const ENTITIES_BEFORE_AUTO_ZOOM = 5;

// Animation variants for entities
const entityVariants = {
  initial: { opacity: 0, scale: 0.8, y: 20 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.8, y: -20 },
};

// Spring animation config
const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 25,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate entity position based on index
 * Responsive to mobile/desktop (Phase 4.1)
 */
function getEntityPosition(index: number, total: number, isMobile: boolean) {
  const canvasWidth = isMobile ? MOBILE_CANVAS_WIDTH : CANVAS_WIDTH;
  const spacing = isMobile ? MOBILE_ENTITY_SPACING : ENTITY_SPACING;
  const startYBase = isMobile ? MOBILE_ENTITY_START_Y : ENTITY_START_Y;
  const canvasHeight = CANVAS_HEIGHT;

  const centerX = canvasWidth / 2;
  const totalHeight = (total - 1) * spacing;
  const startY = Math.max(startYBase, (canvasHeight - totalHeight) / 2);
  return {
    x: centerX,
    y: startY + index * spacing,
  };
}

/**
 * Get connection endpoints based on entity positions
 * Responsive to mobile/desktop (Phase 4.1)
 */
function getConnectionEndpoints(
  fromId: string,
  toId: string,
  entities: VisualEntity[],
  isMobile: boolean
) {
  const fromEntity = entities.find((e) => e.id === fromId);
  const toEntity = entities.find((e) => e.id === toId);

  if (!fromEntity || !toEntity) return null;

  const fromIndex = entities.indexOf(fromEntity);
  const toIndex = entities.indexOf(toEntity);
  const fromPos = getEntityPosition(fromIndex, entities.length, isMobile);
  const toPos = getEntityPosition(toIndex, entities.length, isMobile);

  // Smaller card offset on mobile
  const cardOffset = isMobile ? 32 : 40;

  return {
    from: { x: fromPos.x, y: fromPos.y + cardOffset },
    to: { x: toPos.x, y: toPos.y - cardOffset },
  };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Dot grid background pattern
 */
function DotGridBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="dot-grid"
          x="0"
          y="0"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx="2"
            cy="2"
            r="1"
            className="fill-muted-foreground/20"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid)" />
    </svg>
  );
}

/**
 * Empty state display
 */
function EmptyState() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.span
        className="text-6xl mb-4"
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        ✨
      </motion.span>
      <p className="text-muted-foreground text-center max-w-xs">
        Describe what you want your BaleyBot to do, and watch it come to life
      </p>
    </motion.div>
  );
}

/**
 * Building indicator (pulsing orb)
 */
function BuildingIndicator() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative"
        animate={{
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {/* Outer glow */}
        <div className="absolute inset-0 w-20 h-20 rounded-full bg-primary/20 blur-xl" />
        {/* Inner orb */}
        <motion.div
          className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60"
          animate={{
            boxShadow: [
              '0 0 20px hsl(262 83% 58% / 0.3)',
              '0 0 40px hsl(262 83% 58% / 0.5)',
              '0 0 20px hsl(262 83% 58% / 0.3)',
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        {/* Sparkles */}
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-primary"
            style={{
              top: '50%',
              left: '50%',
            }}
            animate={{
              x: [0, Math.cos((i * Math.PI) / 2) * 40],
              y: [0, Math.sin((i * Math.PI) / 2) * 40],
              opacity: [1, 0],
              scale: [1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.25,
              ease: 'easeOut',
            }}
          />
        ))}
      </motion.div>
      <p className="absolute mt-32 text-sm text-muted-foreground animate-pulse-soft">
        Building your BaleyBot...
      </p>
    </motion.div>
  );
}

/**
 * Connection line between entities
 * Responsive to mobile/desktop (Phase 4.1)
 */
function ConnectionLine({
  connection,
  entities,
  dimmed = false,
  isMobile = false,
}: {
  connection: Connection;
  entities: VisualEntity[];
  dimmed?: boolean;
  isMobile?: boolean;
}) {
  const endpoints = getConnectionEndpoints(connection.from, connection.to, entities, isMobile);

  if (!endpoints) return null;

  const { from, to } = endpoints;

  // Calculate control points for a smooth curve
  const midY = (from.y + to.y) / 2;
  const path = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;

  return (
    <g>
      {/* Gradient definition */}
      <defs>
        <linearGradient
          id={`gradient-${connection.id}`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="hsl(262 83% 58%)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="hsl(15 90% 65%)" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Connection path */}
      <motion.path
        d={path}
        fill="none"
        stroke={`url(#gradient-${connection.id})`}
        strokeWidth="2"
        strokeDasharray="6 4"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{
          pathLength: connection.status === 'drawing' ? 0.5 : 1,
          opacity: connection.status === 'removing' ? 0 : dimmed ? 0.3 : 1,
        }}
        transition={{
          pathLength: { duration: 0.8, ease: 'easeInOut' },
          opacity: { duration: 0.3 },
        }}
      />
      {/* Arrow head */}
      <motion.circle
        cx={to.x}
        cy={to.y}
        r="4"
        fill="hsl(15 90% 65%)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: connection.status === 'removing' ? 0 : 1,
          opacity: connection.status === 'removing' ? 0 : dimmed ? 0.3 : 1,
        }}
        transition={{ delay: 0.6 }}
      />
    </g>
  );
}

const MemoizedConnectionLine = memo(ConnectionLine);

/**
 * Entity card component
 * Responsive to mobile/desktop (Phase 4.1)
 */
function EntityCard({
  entity,
  index,
  total,
  dimmed = false,
  isMobile = false,
}: {
  entity: VisualEntity;
  index: number;
  total: number;
  dimmed?: boolean;
  isMobile?: boolean;
}) {
  const position = getEntityPosition(index, total, isMobile);

  return (
    <motion.div
      className="absolute"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
      variants={entityVariants}
      initial="initial"
      animate={dimmed ? { opacity: 0.4, scale: 0.95, y: 0 } : 'animate'}
      exit="exit"
      transition={{
        ...springConfig,
        delay: index * 0.1, // Stagger effect
      }}
      layout
    >
      <div
        className={cn(
          'card-playful rounded-2xl border border-border/50 transition-all duration-300',
          // Responsive sizing (Phase 4.1)
          isMobile ? 'p-3 min-w-[160px] max-w-[200px]' : 'p-4 min-w-[200px] max-w-[280px]',
          entity.status === 'appearing' && 'ring-2 ring-primary/50',
          entity.status === 'removing' && 'opacity-50',
          dimmed && 'grayscale-[30%]'
        )}
      >
        {/* Icon and name */}
        <div className={cn('flex items-start mb-2', isMobile ? 'gap-2' : 'gap-3')}>
          <div
            className={cn(
              'flex items-center justify-center rounded-xl',
              'bg-gradient-to-br from-primary/20 to-accent/10',
              // Responsive icon size (Phase 4.1)
              isMobile ? 'w-8 h-8 text-base' : 'w-10 h-10 text-xl'
            )}
          >
            {entity.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              'font-semibold text-foreground truncate',
              isMobile ? 'text-xs' : 'text-sm'
            )}>
              {entity.name}
            </h3>
            <p className={cn(
              'text-muted-foreground line-clamp-2',
              isMobile ? 'text-[10px]' : 'text-xs'
            )}>
              {entity.purpose}
            </p>
          </div>
        </div>

        {/* Tool badges - hide on mobile to save space */}
        {entity.tools.length > 0 && !isMobile && (
          <div className="flex flex-wrap gap-1 mt-3">
            {entity.tools.slice(0, 4).map((tool) => (
              <span
                key={tool}
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full',
                  'text-[10px] font-medium',
                  'bg-secondary text-secondary-foreground'
                )}
              >
                {tool}
              </span>
            ))}
            {entity.tools.length > 4 && (
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full',
                  'text-[10px] font-medium',
                  'bg-muted text-muted-foreground'
                )}
              >
                +{entity.tools.length - 4}
              </span>
            )}
          </div>
        )}
        {/* Show tool count on mobile */}
        {entity.tools.length > 0 && isMobile && (
          <div className="mt-2">
            <span className="text-[9px] text-muted-foreground">
              {entity.tools.length} tool{entity.tools.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

const MemoizedEntityCard = memo(EntityCard);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Canvas component for visualizing BaleyBot assembly.
 *
 * Displays entities and connections with animations as the AI
 * progressively builds the BaleyBot structure.
 */
export function Canvas({ entities, connections, status, className }: CanvasProps) {
  // Zoom state (Phase 5.3)
  const [zoom, setZoom] = useState(1);

  // Responsive state (Phase 4.1)
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size (Phase 4.1)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // Tailwind's sm breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Determine what to show based on status and entities
  const showEmpty = status === 'empty';
  const showBuilding = status === 'building' && entities.length === 0;
  const isRebuilding = status === 'building' && entities.length > 0;
  const showEntities = entities.length > 0;

  // Sort entities for consistent rendering (memoized to prevent unnecessary re-renders)
  const sortedEntities = useMemo(
    () => [...entities].sort((a, b) => a.id.localeCompare(b.id)),
    [entities]
  );

  // Auto-zoom when many entities (Phase 5.3)
  const calculateAutoZoom = useCallback((entityCount: number) => {
    if (entityCount <= ENTITIES_BEFORE_AUTO_ZOOM) return 1;
    // Gradually reduce zoom as entities increase
    const excess = entityCount - ENTITIES_BEFORE_AUTO_ZOOM;
    const reduction = Math.min(excess * 0.08, 1 - MIN_ZOOM);
    return Math.max(MIN_ZOOM, 1 - reduction);
  }, []);

  // Apply auto-zoom when entity count changes significantly
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(calculateAutoZoom(entities.length));
  }, [calculateAutoZoom, entities.length]);

  return (
    <div
      role="region"
      aria-label={`BaleyBot canvas - ${status === 'empty' ? 'empty' : status === 'building' ? 'building' : `${entities.length} entities`}`}
      className={cn(
        'relative w-full h-full overflow-hidden',
        // Responsive min-height (Phase 4.1)
        'min-h-[300px] sm:min-h-[500px]',
        'bg-gradient-playful rounded-2xl',
        className
      )}
    >
      {/* Background */}
      <DotGridBackground />

      {/* Empty state */}
      <AnimatePresence mode="wait">
        {showEmpty && <EmptyState />}
      </AnimatePresence>

      {/* Building indicator */}
      <AnimatePresence mode="wait">
        {showBuilding && <BuildingIndicator />}
      </AnimatePresence>

      {/* Zoomable content container (Phase 5.3, responsive Phase 4.1) */}
      <div
        className="absolute inset-0 overflow-auto"
        style={{ zIndex: 1 }}
      >
        <div
          className="relative w-full h-full origin-center transition-transform duration-200"
          style={{
            transform: `scale(${zoom})`,
            minWidth: isMobile ? MOBILE_CANVAS_WIDTH : CANVAS_WIDTH,
            minHeight: CANVAS_HEIGHT,
          }}
        >
          {/* Connections layer (SVG) */}
          {showEntities && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <AnimatePresence>
                {connections.map((connection) => (
                  <MemoizedConnectionLine
                    key={connection.id}
                    connection={connection}
                    entities={sortedEntities}
                    dimmed={isRebuilding}
                    isMobile={isMobile}
                  />
                ))}
              </AnimatePresence>
            </svg>
          )}

          {/* Entities layer */}
          <div className="absolute inset-0">
            <AnimatePresence mode="popLayout">
              {sortedEntities.map((entity, index) => (
                <MemoizedEntityCard
                  key={entity.id}
                  entity={entity}
                  index={index}
                  total={sortedEntities.length}
                  dimmed={isRebuilding}
                  isMobile={isMobile}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Rebuilding overlay */}
      <AnimatePresence>
        {isRebuilding && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 5 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="bg-background/80 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg border border-border/50"
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              transition={springConfig}
            >
              <div className="flex items-center gap-3">
                <motion.div
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60"
                  animate={{
                    scale: [1, 1.1, 1],
                    boxShadow: [
                      '0 0 10px hsl(262 83% 58% / 0.3)',
                      '0 0 20px hsl(262 83% 58% / 0.5)',
                      '0 0 10px hsl(262 83% 58% / 0.3)',
                    ],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
                <p className="text-sm font-medium text-foreground">
                  Updating your BaleyBot...
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom controls (Phase 5.3, responsive Phase 4.1) */}
      {showEntities && (
        <div
          role="group"
          aria-label="Canvas zoom controls"
          className={cn(
            'absolute flex items-center bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 shadow-sm',
            // Responsive positioning and sizing (Phase 4.1)
            isMobile ? 'bottom-2 right-2 gap-0.5 p-0.5' : 'bottom-4 right-4 gap-1 p-1'
          )}
          style={{ zIndex: 10 }}
        >
          <Button
            variant="ghost"
            size="icon"
            className={isMobile ? 'h-7 w-7' : 'h-8 w-8'}
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            aria-label={`Zoom out (current zoom: ${Math.round(zoom * 100)}%)`}
          >
            <ZoomOut className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
          </Button>
          <span
            className={cn(
              'font-medium text-muted-foreground text-center',
              isMobile ? 'text-[10px] min-w-[2.5rem]' : 'text-xs min-w-[3rem]'
            )}
            aria-live="polite"
            role="status"
          >
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={isMobile ? 'h-7 w-7' : 'h-8 w-8'}
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            aria-label={`Zoom in (current zoom: ${Math.round(zoom * 100)}%)`}
          >
            <ZoomIn className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
          </Button>
          <div className={cn('w-px bg-border', isMobile ? 'h-3 mx-0.5' : 'h-4 mx-1')} aria-hidden="true" />
          <Button
            variant="ghost"
            size="icon"
            className={isMobile ? 'h-7 w-7' : 'h-8 w-8'}
            onClick={handleZoomReset}
            aria-label="Fit to view (reset zoom)"
          >
            <Maximize2 className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Status indicator */}
      {status === 'ready' && entities.length > 0 && (
        <motion.div
          className="absolute bottom-4 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <span className="badge-success px-3 py-1.5 rounded-full text-xs font-medium">
            Ready to deploy
          </span>
        </motion.div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <motion.div
          className="absolute bottom-4 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="badge-error px-3 py-1.5 rounded-full text-xs font-medium">
            Something went wrong
          </span>
        </motion.div>
      )}
    </div>
  );
}

export default Canvas;
