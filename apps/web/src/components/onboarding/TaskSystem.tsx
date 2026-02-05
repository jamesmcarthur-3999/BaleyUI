'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Check,
  Circle,
  ChevronRight,
  Sparkles,
  Trophy,
  Lightbulb,
  BookOpen,
  Play,
  Star,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface Task {
  id: string;
  title: string;
  description: string;
  type: 'learn' | 'do' | 'explore';
  estimatedTime?: string;
  points?: number;
  steps?: string[];
  isCompleted: boolean;
  isLocked?: boolean;
}

export interface TaskGroup {
  id: string;
  title: string;
  description: string;
  tasks: Task[];
}

interface TaskSystemProps {
  groups?: TaskGroup[];
  completedTaskIds?: string[];
  onTaskComplete?: (taskId: string) => void;
  onTaskStart?: (taskId: string) => void;
  className?: string;
}

// ============================================================================
// DEFAULT TASK GROUPS
// ============================================================================

const defaultTaskGroups: TaskGroup[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Learn the basics of BaleyUI',
    tasks: [
      {
        id: 'welcome',
        title: 'Welcome to BaleyUI',
        description: 'Take a quick tour of the platform',
        type: 'learn',
        estimatedTime: '2 min',
        points: 10,
        steps: [
          'Read the welcome message',
          'Explore the navigation',
          'Visit the blocks library',
        ],
        isCompleted: false,
      },
      {
        id: 'concepts',
        title: 'Core Concepts',
        description: 'Understand agents, blocks, and flows',
        type: 'learn',
        estimatedTime: '5 min',
        points: 20,
        steps: [
          'Learn what agents are',
          'Understand blocks and their types',
          'See how flows connect blocks',
        ],
        isCompleted: false,
      },
    ],
  },
  {
    id: 'first-agent',
    title: 'Your First Agent',
    description: 'Create and test your first AI agent',
    tasks: [
      {
        id: 'create-agent',
        title: 'Create an Agent',
        description: 'Build a simple assistant agent',
        type: 'do',
        estimatedTime: '5 min',
        points: 50,
        steps: [
          'Open the agent playground',
          'Write a system prompt',
          'Configure temperature and tokens',
          'Save your agent',
        ],
        isCompleted: false,
      },
      {
        id: 'test-agent',
        title: 'Test Your Agent',
        description: 'Have a conversation with your agent',
        type: 'do',
        estimatedTime: '3 min',
        points: 30,
        steps: [
          'Send a test message',
          'Evaluate the response',
          'Try different prompts',
        ],
        isCompleted: false,
      },
      {
        id: 'refine-agent',
        title: 'Refine Your Agent',
        description: 'Improve based on test results',
        type: 'do',
        estimatedTime: '5 min',
        points: 40,
        steps: [
          'Identify areas for improvement',
          'Update the system prompt',
          'Re-test and compare',
        ],
        isCompleted: false,
      },
    ],
  },
  {
    id: 'explore-features',
    title: 'Explore Features',
    description: 'Discover what else you can do',
    tasks: [
      {
        id: 'add-tools',
        title: 'Add Tools to Your Agent',
        description: 'Give your agent new capabilities',
        type: 'explore',
        estimatedTime: '10 min',
        points: 60,
        isCompleted: false,
      },
      {
        id: 'build-flow',
        title: 'Build a Flow',
        description: 'Connect multiple blocks together',
        type: 'explore',
        estimatedTime: '15 min',
        points: 80,
        isCompleted: false,
      },
      {
        id: 'output-templates',
        title: 'Use Output Templates',
        description: 'Create structured outputs',
        type: 'explore',
        estimatedTime: '10 min',
        points: 50,
        isCompleted: false,
      },
    ],
  },
];

// ============================================================================
// TASK CARD
// ============================================================================

function TaskCard({
  task,
  onComplete,
  onStart,
}: {
  task: Task;
  onComplete: () => void;
  onStart: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const typeConfig: Record<
    Task['type'],
    { icon: typeof BookOpen; color: string; label: string }
  > = {
    learn: { icon: BookOpen, color: 'text-blue-500', label: 'Learn' },
    do: { icon: Play, color: 'text-green-500', label: 'Do' },
    explore: { icon: Sparkles, color: 'text-purple-500', label: 'Explore' },
  };

  const { icon: TypeIcon, color, label } = typeConfig[task.type];

  return (
    <Card
      className={cn(
        'transition-all',
        task.isCompleted && 'opacity-75',
        task.isLocked && 'opacity-50 pointer-events-none'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Status */}
          <div className="mt-0.5">
            {task.isCompleted ? (
              <div className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="h-4 w-4 text-white" />
              </div>
            ) : (
              <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
                <Circle className="h-3 w-3 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className={cn('font-medium', task.isCompleted && 'line-through')}>
                  {task.title}
                </h4>
                <p className="text-sm text-muted-foreground">{task.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={cn('gap-1', color)}>
                  <TypeIcon className="h-3 w-3" />
                  {label}
                </Badge>
                {task.points && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" />
                    {task.points}
                  </Badge>
                )}
              </div>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {task.estimatedTime && <span>{task.estimatedTime}</span>}
              {task.steps && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <span>{task.steps.length} steps</span>
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 transition-transform',
                      expanded && 'rotate-90'
                    )}
                  />
                </button>
              )}
            </div>

            {/* Steps */}
            {expanded && task.steps && (
              <div className="mt-3 space-y-1.5">
                {task.steps.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs">
                      {index + 1}
                    </div>
                    {step}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {!task.isCompleted && !task.isLocked && (
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" onClick={onStart}>
                  Start Task
                </Button>
                <Button size="sm" variant="outline" onClick={onComplete}>
                  Mark Complete
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TASK GROUP
// ============================================================================

function TaskGroupSection({
  group,
  completedTaskIds,
  onTaskComplete,
  onTaskStart,
}: {
  group: TaskGroup;
  completedTaskIds: string[];
  onTaskComplete: (taskId: string) => void;
  onTaskStart: (taskId: string) => void;
}) {
  const completedCount = group.tasks.filter((t) =>
    completedTaskIds.includes(t.id)
  ).length;
  const progress = (completedCount / group.tasks.length) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{group.title}</h3>
          <p className="text-sm text-muted-foreground">{group.description}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">
            {completedCount}/{group.tasks.length} complete
          </p>
          <Progress value={progress} className="w-24 h-2 mt-1" />
        </div>
      </div>

      <div className="space-y-3">
        {group.tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={{
              ...task,
              isCompleted: completedTaskIds.includes(task.id),
            }}
            onComplete={() => onTaskComplete(task.id)}
            onStart={() => onTaskStart(task.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TaskSystem({
  groups = defaultTaskGroups,
  completedTaskIds = [],
  onTaskComplete,
  onTaskStart,
  className,
}: TaskSystemProps) {
  const [localCompletedIds, setLocalCompletedIds] = useState<string[]>(completedTaskIds);

  const allTasks = groups.flatMap((g) => g.tasks);
  const totalPoints = allTasks.reduce((sum, t) => sum + (t.points || 0), 0);
  const earnedPoints = allTasks
    .filter((t) => localCompletedIds.includes(t.id))
    .reduce((sum, t) => sum + (t.points || 0), 0);
  const overallProgress = (localCompletedIds.length / allTasks.length) * 100;

  const handleComplete = (taskId: string) => {
    setLocalCompletedIds((prev) => [...prev, taskId]);
    onTaskComplete?.(taskId);
  };

  const handleStart = (taskId: string) => {
    onTaskStart?.(taskId);
  };

  const isComplete = localCompletedIds.length === allTasks.length;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Onboarding Tasks
              </h2>
              <p className="text-muted-foreground mt-1">
                Complete these tasks to master BaleyUI
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Trophy className="h-5 w-5 text-yellow-500" />
                {earnedPoints}/{totalPoints} points
              </div>
              <p className="text-sm text-muted-foreground">
                {localCompletedIds.length}/{allTasks.length} tasks complete
              </p>
            </div>
          </div>

          <Progress value={overallProgress} className="mt-4 h-3" />

          {isComplete && (
            <div className="mt-4 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-green-500" />
                <span className="font-medium text-green-700 dark:text-green-400">
                  Congratulations! You&apos;ve completed all onboarding tasks!
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Groups */}
      {groups.map((group) => (
        <TaskGroupSection
          key={group.id}
          group={group}
          completedTaskIds={localCompletedIds}
          onTaskComplete={handleComplete}
          onTaskStart={handleStart}
        />
      ))}

      {/* Tips */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Pro Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              Complete tasks in order for the best learning experience
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              Earn points to unlock advanced features
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              Ask the AI companion if you get stuck
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
