# BaleyUI Design System Components

This directory contains all the UI components for the BaleyUI application. Components follow the shadcn/ui pattern and are built with:
- **Radix UI** primitives for accessibility
- **Tailwind CSS** for styling
- **class-variance-authority (cva)** for variant management
- Full **dark mode** support

## Components

### Badge (`badge.tsx`)
Versatile badge component with custom variants for BaleyUI.

**Variants:**
- **Block Types**: `ai`, `function`, `router`, `parallel`
- **Providers**: `openai`, `anthropic`, `ollama`
- **Status**: `connected`, `error`, `unconfigured`
- **Standard**: `default`, `secondary`, `destructive`, `outline`

**Usage:**
```tsx
import { Badge } from '@/components/ui/badge';

<Badge variant="ai">AI Block</Badge>
<Badge variant="openai">OpenAI</Badge>
<Badge variant="connected">Connected</Badge>
```

### Status Indicator (`status-indicator.tsx`)
Small dot indicator for connection status with animated pulse.

**Props:**
- `status: 'connected' | 'error' | 'unconfigured' | 'pending'`

**Usage:**
```tsx
import { StatusIndicator } from '@/components/ui/status-indicator';

<StatusIndicator status="connected" />
<StatusIndicator status="pending" /> {/* Animated pulse */}
```

### Loading Dots (`loading-dots.tsx`)
Animated three-dot indicator for streaming/loading states.

**Props:**
- `size?: 'sm' | 'md' | 'lg'`

**Usage:**
```tsx
import { LoadingDots } from '@/components/ui/loading-dots';

<LoadingDots size="md" />
```

### Form Components

#### Input (`input.tsx`)
Standard text input component.

```tsx
import { Input } from '@/components/ui/input';

<Input type="text" placeholder="Enter text..." />
```

#### Label (`label.tsx`)
Form label component with accessibility support.

```tsx
import { Label } from '@/components/ui/label';

<Label htmlFor="email">Email</Label>
```

#### Select (`select.tsx`)
Dropdown select component.

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="1">Option 1</SelectItem>
    <SelectItem value="2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### Dialog (`dialog.tsx`)
Modal dialog component.

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

<Dialog>
  <DialogTrigger>Open Dialog</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

### Tabs (`tabs.tsx`)
Tabbed interface component.

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
```

### Toast (`toast.tsx`, `toaster.tsx`, `use-toast.ts`)
Notification toast system using Radix UI Toast.

**Setup:**
Add `<Toaster />` to your root layout:

```tsx
import { Toaster } from '@/components/ui/toaster';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

**Usage:**
```tsx
import { useToast } from '@/components/ui/use-toast';

function MyComponent() {
  const { toast } = useToast();

  return (
    <button
      onClick={() => {
        toast({
          title: "Success!",
          description: "Your action was completed.",
        });
      }}
    >
      Show Toast
    </button>
  );
}
```

### Button (`button.tsx`)
Standard button component.

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default">Click me</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
```

### Card (`card.tsx`)
Card container component.

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    Card content
  </CardContent>
  <CardFooter>
    Card footer
  </CardFooter>
</Card>
```

## CSS Variables

All custom colors are defined in `globals.css`:

```css
/* Block type colors */
--color-block-ai: 271 91% 65%;
--color-block-function: 199 89% 48%;
--color-block-router: 38 92% 50%;
--color-block-parallel: 280 87% 65%;

/* Provider colors */
--color-provider-openai: 160 84% 39%;
--color-provider-anthropic: 24 95% 53%;
--color-provider-ollama: 210 100% 50%;

/* Streaming states */
--color-stream-active: 142 76% 36%;
--color-stream-tool: 38 92% 50%;
--color-stream-error: 0 84% 60%;
```

These colors automatically adjust for dark mode.

## Dark Mode

All components support dark mode out of the box. Dark mode is controlled via the `.dark` class on the root HTML element (following the Tailwind CSS convention).
