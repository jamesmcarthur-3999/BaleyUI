/**
 * Canonical canvas quick-start actions.
 *
 * Used by both ChatPanel (as pill shortcuts) and WelcomeView (as cards).
 * Keep these in sync — they're the same user intent presented in two contexts.
 */

export interface CanvasQuickAction {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

export const CANVAS_QUICK_ACTIONS: CanvasQuickAction[] = [
  {
    id: 'dashboard',
    label: 'Analytics Dashboard',
    description: 'Real-time metrics with charts and filters',
    prompt:
      'Build me an analytics dashboard with a sidebar navigation, KPI cards at the top, and interactive charts showing revenue, users, and engagement metrics.',
  },
  {
    id: 'landing',
    label: 'Landing Page',
    description: 'Modern landing page with hero section',
    prompt:
      'Build a modern SaaS landing page with a hero section, feature grid, pricing cards, testimonials carousel, and a CTA footer.',
  },
  {
    id: 'ecommerce',
    label: 'E-commerce Store',
    description: 'Product catalog with cart and checkout',
    prompt:
      'Build an e-commerce product catalog page with a grid of product cards (image, title, price, rating), filters sidebar, search bar, and a shopping cart drawer.',
  },
  {
    id: 'chat',
    label: 'Chat Interface',
    description: 'Real-time messaging UI with threads',
    prompt:
      'Build a chat application interface with a contacts sidebar, message thread area with bubbles, typing indicators, and a message input with emoji picker.',
  },
];
