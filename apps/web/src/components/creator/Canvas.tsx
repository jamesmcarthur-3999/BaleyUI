'use client';

// React 19 - no manual memoization needed
import { motion, AnimatePresence } from 'framer-motion';
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

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const ENTITY_SPACING = 180;
const ENTITY_START_Y = 100;

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
 */
function getEntityPosition(index: number, total: number) {
  const centerX = CANVAS_WIDTH / 2;
  const totalHeight = (total - 1) * ENTITY_SPACING;
  const startY = Math.max(ENTITY_START_Y, (CANVAS_HEIGHT - totalHeight) / 2);
  return {
    x: centerX,
    y: startY + index * ENTITY_SPACING,
  };
}

/**
 * Get connection endpoints based on entity positions
 */
function getConnectionEndpoints(
  fromId: string,
  toId: string,
  entities: VisualEntity[]
) {
  const fromEntity = entities.find((e) => e.id === fromId);
  const toEntity = entities.find((e) => e.id === toId);

  if (!fromEntity || !toEntity) return null;

  const fromIndex = entities.indexOf(fromEntity);
  const toIndex = entities.indexOf(toEntity);
  const fromPos = getEntityPosition(fromIndex, entities.length);
  const toPos = getEntityPosition(toIndex, entities.length);

  return {
    from: { x: fromPos.x, y: fromPos.y + 40 }, // Bottom of card
    to: { x: toPos.x, y: toPos.y - 40 }, // Top of card
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
 */
function ConnectionLine({
  connection,
  entities,
}: {
  connection: Connection;
  entities: VisualEntity[];
}) {
  const endpoints = getConnectionEndpoints(connection.from, connection.to, entities);

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
          opacity: connection.status === 'removing' ? 0 : 1,
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
          opacity: connection.status === 'removing' ? 0 : 1,
        }}
        transition={{ delay: 0.6 }}
      />
    </g>
  );
}

/**
 * Entity card component
 */
function EntityCard({
  entity,
  index,
  total,
}: {
  entity: VisualEntity;
  index: number;
  total: number;
}) {
  const position = getEntityPosition(index, total);

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
      animate="animate"
      exit="exit"
      transition={{
        ...springConfig,
        delay: index * 0.1, // Stagger effect
      }}
      layout
    >
      <div
        className={cn(
          'card-playful rounded-2xl p-4 min-w-[200px] max-w-[280px]',
          'border border-border/50',
          entity.status === 'appearing' && 'ring-2 ring-primary/50',
          entity.status === 'removing' && 'opacity-50'
        )}
      >
        {/* Icon and name */}
        <div className="flex items-start gap-3 mb-2">
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl text-xl',
              'bg-gradient-to-br from-primary/20 to-accent/10'
            )}
          >
            {entity.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate">
              {entity.name}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {entity.purpose}
            </p>
          </div>
        </div>

        {/* Tool badges */}
        {entity.tools.length > 0 && (
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
      </div>
    </motion.div>
  );
}

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
  // Determine what to show based on status and entities
  const showEmpty = status === 'empty';
  const showBuilding = status === 'building' && entities.length === 0;
  const showEntities = entities.length > 0;

  // Sort entities for consistent rendering (React 19 handles this efficiently)
  const sortedEntities = [...entities].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div
      role="region"
      aria-label={`BaleyBot canvas - ${status === 'empty' ? 'empty' : status === 'building' ? 'building' : `${entities.length} entities`}`}
      className={cn(
        'relative w-full h-full min-h-[500px] overflow-hidden',
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

      {/* Connections layer (SVG) */}
      {showEntities && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        >
          <AnimatePresence>
            {connections.map((connection) => (
              <ConnectionLine
                key={connection.id}
                connection={connection}
                entities={sortedEntities}
              />
            ))}
          </AnimatePresence>
        </svg>
      )}

      {/* Entities layer */}
      <div className="absolute inset-0" style={{ zIndex: 2 }}>
        <AnimatePresence mode="popLayout">
          {sortedEntities.map((entity, index) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              index={index}
              total={sortedEntities.length}
            />
          ))}
        </AnimatePresence>
      </div>

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
