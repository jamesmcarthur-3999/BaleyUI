/**
 * Demo Seed Data
 *
 * Comprehensive demo data for testing all BaleyUI features.
 * All IDs are deterministic UUIDs for predictable seeding.
 */

// ============================================================================
// DEMO WORKSPACE
// ============================================================================

export const DEMO_WORKSPACE = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  name: 'BaleyUI Demo Workspace',
  slug: 'demo',
  // ownerId will be set at runtime from Clerk user ID
};

// ============================================================================
// DEMO CONNECTIONS
// ============================================================================

export const DEMO_CONNECTIONS = {
  openai: {
    id: 'bbbbbbbb-0000-0000-0000-000000000001',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'openai',
    name: 'OpenAI Production',
    config: { apiKey: '', baseUrl: 'https://api.openai.com/v1' },
    isDefault: true,
    status: 'unconfigured',
  },
  anthropic: {
    id: 'bbbbbbbb-0000-0000-0000-000000000002',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'anthropic',
    name: 'Anthropic Claude',
    config: { apiKey: '', baseUrl: 'https://api.anthropic.com' },
    isDefault: false,
    status: 'unconfigured',
  },
  ollama: {
    id: 'bbbbbbbb-0000-0000-0000-000000000003',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'ollama',
    name: 'Local Ollama',
    config: { baseUrl: 'http://localhost:11434' },
    isDefault: false,
    status: 'unconfigured',
    availableModels: [],
  },
};

// ============================================================================
// DEMO TOOLS
// ============================================================================

export const DEMO_TOOLS = {
  add: {
    id: 'cccccccc-0000-0000-0000-000000000001',
    workspaceId: DEMO_WORKSPACE.id,
    name: 'add',
    description: 'Add two numbers together',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
    code: 'return input.a + input.b;',
  },
  multiply: {
    id: 'cccccccc-0000-0000-0000-000000000002',
    workspaceId: DEMO_WORKSPACE.id,
    name: 'multiply',
    description: 'Multiply two numbers together',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
    code: 'return input.a * input.b;',
  },
  getCurrentWeather: {
    id: 'cccccccc-0000-0000-0000-000000000003',
    workspaceId: DEMO_WORKSPACE.id,
    name: 'getCurrentWeather',
    description: 'Get current weather for a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or zip code' },
      },
      required: ['location'],
    },
    code: `
// Mock weather data for demo purposes
const weatherData = {
  'San Francisco': { temp: 65, condition: 'Foggy', humidity: 75 },
  'New York': { temp: 45, condition: 'Cloudy', humidity: 60 },
  'Los Angeles': { temp: 72, condition: 'Sunny', humidity: 40 },
  'Seattle': { temp: 52, condition: 'Rainy', humidity: 85 },
  'Miami': { temp: 82, condition: 'Sunny', humidity: 70 },
};
const data = weatherData[input.location] || { temp: 70, condition: 'Clear', humidity: 50 };
return { location: input.location, ...data };
    `.trim(),
  },
  searchDatabase: {
    id: 'cccccccc-0000-0000-0000-000000000004',
    workspaceId: DEMO_WORKSPACE.id,
    name: 'searchDatabase',
    description: 'Search the product database',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results', default: 5 },
      },
      required: ['query'],
    },
    code: `
// Mock product database for demo purposes
const products = [
  { id: 1, name: 'Wireless Headphones', price: 99.99, category: 'Electronics' },
  { id: 2, name: 'Smart Watch', price: 249.99, category: 'Electronics' },
  { id: 3, name: 'Running Shoes', price: 129.99, category: 'Sports' },
  { id: 4, name: 'Coffee Maker', price: 79.99, category: 'Kitchen' },
  { id: 5, name: 'Desk Lamp', price: 45.99, category: 'Home' },
  { id: 6, name: 'Bluetooth Speaker', price: 59.99, category: 'Electronics' },
  { id: 7, name: 'Yoga Mat', price: 29.99, category: 'Sports' },
  { id: 8, name: 'Water Bottle', price: 24.99, category: 'Sports' },
];
const query = input.query.toLowerCase();
const results = products.filter(p =>
  p.name.toLowerCase().includes(query) ||
  p.category.toLowerCase().includes(query)
).slice(0, input.limit || 5);
return { results, total: results.length };
    `.trim(),
  },
};

// ============================================================================
// DEMO BLOCKS
// ============================================================================

export const DEMO_BLOCKS = {
  // AI Blocks
  sentimentAnalyzer: {
    id: 'dddddddd-0000-0000-0000-000000000001',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'ai',
    name: 'Sentiment Analyzer',
    description: 'Analyzes the sentiment of text input and returns positive, negative, or neutral classification with confidence score.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze for sentiment' },
      },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        keywords: { type: 'array', items: { type: 'string' } },
      },
      required: ['sentiment', 'confidence'],
    },
    connectionId: DEMO_CONNECTIONS.openai.id,
    model: 'gpt-4o-mini',
    goal: 'Analyze the sentiment of the provided text and return a structured response with sentiment classification and confidence score.',
    systemPrompt: 'You are a sentiment analysis expert. Analyze text and respond with JSON containing sentiment (positive/negative/neutral), confidence (0-1), and key emotional keywords.',
    temperature: '0.3',
    maxTokens: 500,
    toolIds: [],
  },
  customerSupportBot: {
    id: 'dddddddd-0000-0000-0000-000000000002',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'ai',
    name: 'Customer Support Bot',
    description: 'Handles customer support inquiries with empathy and provides helpful responses.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Customer message' },
        customerName: { type: 'string', description: 'Customer name' },
        orderId: { type: 'string', description: 'Order ID if applicable' },
      },
      required: ['message'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'Response to customer' },
        category: { type: 'string', enum: ['billing', 'technical', 'general', 'returns'] },
        sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
        requiresEscalation: { type: 'boolean' },
      },
      required: ['response', 'category'],
    },
    connectionId: DEMO_CONNECTIONS.openai.id,
    model: 'gpt-4o',
    goal: 'Provide helpful, empathetic customer support responses. Categorize inquiries and flag ones needing escalation.',
    systemPrompt: 'You are a friendly, professional customer support representative. Be empathetic, helpful, and solution-oriented. Always maintain a positive tone even with frustrated customers.',
    temperature: '0.7',
    maxTokens: 1000,
    toolIds: [],
  },
  mathSolver: {
    id: 'dddddddd-0000-0000-0000-000000000003',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'ai',
    name: 'Math Solver',
    description: 'Solves mathematical problems using available calculator tools.',
    inputSchema: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: 'Math problem to solve' },
      },
      required: ['problem'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        answer: { type: 'number', description: 'The calculated answer' },
        explanation: { type: 'string', description: 'Step-by-step explanation' },
        toolsUsed: { type: 'array', items: { type: 'string' } },
      },
      required: ['answer', 'explanation'],
    },
    connectionId: DEMO_CONNECTIONS.openai.id,
    model: 'gpt-4o-mini',
    goal: 'Solve mathematical problems step by step using the available calculator tools.',
    systemPrompt: 'You are a math tutor. Solve problems step by step, showing your work. Use the add and multiply tools for calculations.',
    temperature: '0',
    maxTokens: 1000,
    maxToolIterations: 10,
    toolIds: [DEMO_TOOLS.add.id, DEMO_TOOLS.multiply.id],
  },
  weatherAssistant: {
    id: 'dddddddd-0000-0000-0000-000000000004',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'ai',
    name: 'Weather Assistant',
    description: 'Provides weather information and recommendations for any location.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City or location to check weather' },
        activity: { type: 'string', description: 'Planned activity (optional)' },
      },
      required: ['location'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        weather: { type: 'object' },
        recommendation: { type: 'string' },
        suitableForActivity: { type: 'boolean' },
      },
      required: ['weather', 'recommendation'],
    },
    connectionId: DEMO_CONNECTIONS.openai.id,
    model: 'gpt-4o-mini',
    goal: 'Get weather information and provide activity recommendations based on conditions.',
    systemPrompt: 'You are a helpful weather assistant. Use the getCurrentWeather tool to fetch weather data, then provide friendly recommendations.',
    temperature: '0.5',
    maxTokens: 500,
    maxToolIterations: 5,
    toolIds: [DEMO_TOOLS.getCurrentWeather.id],
  },
  productRecommender: {
    id: 'dddddddd-0000-0000-0000-000000000005',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'ai',
    name: 'Product Recommender',
    description: 'Searches products and provides personalized recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What are you looking for?' },
        budget: { type: 'number', description: 'Maximum budget (optional)' },
        preferences: { type: 'string', description: 'Any specific preferences' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        recommendations: { type: 'array', items: { type: 'object' } },
        topPick: { type: 'object' },
        reasoning: { type: 'string' },
      },
      required: ['recommendations', 'reasoning'],
    },
    connectionId: DEMO_CONNECTIONS.openai.id,
    model: 'gpt-4o',
    goal: 'Search the product database and provide personalized recommendations based on user needs.',
    systemPrompt: 'You are a helpful shopping assistant. Search for products and recommend the best options based on the customer needs and budget.',
    temperature: '0.6',
    maxTokens: 1000,
    maxToolIterations: 5,
    toolIds: [DEMO_TOOLS.searchDatabase.id],
  },

  // Function Blocks
  jsonFormatter: {
    id: 'dddddddd-0000-0000-0000-000000000006',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'function',
    name: 'JSON Formatter',
    description: 'Formats and pretty-prints JSON data with customizable indentation.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object', description: 'Data to format as JSON' },
        indent: { type: 'number', default: 2, description: 'Indentation spaces' },
      },
      required: ['data'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        formatted: { type: 'string', description: 'Formatted JSON string' },
        size: { type: 'number', description: 'Size in characters' },
      },
      required: ['formatted'],
    },
    code: `
const formatted = JSON.stringify(input.data, null, input.indent ?? 2);
return { formatted, size: formatted.length };
    `.trim(),
  },
  dataValidator: {
    id: 'dddddddd-0000-0000-0000-000000000007',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'function',
    name: 'Data Validator',
    description: 'Validates input data against expected schema and returns validation results.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object', description: 'Data to validate' },
        requiredFields: { type: 'array', items: { type: 'string' }, description: 'Required field names' },
      },
      required: ['data'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        errors: { type: 'array', items: { type: 'string' } },
        fieldCount: { type: 'number' },
      },
      required: ['valid', 'errors'],
    },
    code: `
const errors = [];
const requiredFields = input.requiredFields || [];
for (const field of requiredFields) {
  if (!(field in input.data) || input.data[field] === null || input.data[field] === undefined) {
    errors.push(\`Missing required field: \${field}\`);
  }
}
return {
  valid: errors.length === 0,
  errors,
  fieldCount: Object.keys(input.data).length,
};
    `.trim(),
  },
  responseWrapper: {
    id: 'dddddddd-0000-0000-0000-000000000008',
    workspaceId: DEMO_WORKSPACE.id,
    type: 'function',
    name: 'Response Wrapper',
    description: 'Wraps output in a standard API response format with metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object', description: 'Data to wrap' },
        status: { type: 'string', default: 'success', description: 'Response status' },
      },
      required: ['data'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object' },
        metadata: { type: 'object' },
      },
      required: ['success', 'data'],
    },
    code: `
return {
  success: input.status !== 'error',
  data: input.data,
  metadata: {
    timestamp: new Date().toISOString(),
    processingTime: Date.now() - (input._startTime || Date.now()),
    version: '1.0.0',
  },
};
    `.trim(),
  },
};

// ============================================================================
// DEMO FLOWS
// ============================================================================

export const DEMO_FLOWS = {
  sentimentPipeline: {
    id: 'eeeeeeee-0000-0000-0000-000000000001',
    workspaceId: DEMO_WORKSPACE.id,
    name: 'Simple Sentiment Analysis',
    description: 'A basic pipeline that analyzes text sentiment and wraps the response.',
    enabled: true,
    triggers: [{ type: 'manual' }, { type: 'webhook', secret: 'demo-webhook-secret-1' }],
    nodes: [
      {
        id: 'source-1',
        type: 'source',
        position: { x: 100, y: 200 },
        data: { name: 'Input', triggerType: 'manual' },
      },
      {
        id: 'ai-1',
        type: 'aiBlock',
        position: { x: 350, y: 200 },
        data: {
          name: 'Sentiment Analyzer',
          blockId: DEMO_BLOCKS.sentimentAnalyzer.id,
          model: 'gpt-4o-mini',
        },
      },
      {
        id: 'func-1',
        type: 'functionBlock',
        position: { x: 600, y: 200 },
        data: {
          name: 'Response Wrapper',
          blockId: DEMO_BLOCKS.responseWrapper.id,
        },
      },
      {
        id: 'sink-1',
        type: 'sink',
        position: { x: 850, y: 200 },
        data: { name: 'Output', outputType: 'json' },
      },
    ],
    edges: [
      { id: 'e-source-ai', source: 'source-1', target: 'ai-1', type: 'smoothstep', animated: true },
      { id: 'e-ai-func', source: 'ai-1', target: 'func-1', type: 'smoothstep', animated: true },
      { id: 'e-func-sink', source: 'func-1', target: 'sink-1', type: 'smoothstep', animated: true },
    ],
  },
  customerSupportRouter: {
    id: 'eeeeeeee-0000-0000-0000-000000000002',
    workspaceId: DEMO_WORKSPACE.id,
    name: 'Customer Support Pipeline',
    description: 'Routes customer inquiries to appropriate handlers based on category.',
    enabled: true,
    triggers: [{ type: 'webhook', secret: 'demo-webhook-secret-2' }],
    nodes: [
      {
        id: 'source-1',
        type: 'source',
        position: { x: 100, y: 300 },
        data: { name: 'Customer Message', triggerType: 'webhook' },
      },
      {
        id: 'router-1',
        type: 'router',
        position: { x: 350, y: 300 },
        data: {
          name: 'Category Router',
          routes: [
            { key: 'billing', condition: 'category === "billing"' },
            { key: 'technical', condition: 'category === "technical"' },
            { key: 'general', condition: 'true' },
          ],
        },
      },
      {
        id: 'ai-billing',
        type: 'aiBlock',
        position: { x: 600, y: 100 },
        data: {
          name: 'Billing Handler',
          blockId: DEMO_BLOCKS.customerSupportBot.id,
          model: 'gpt-4o',
        },
      },
      {
        id: 'ai-technical',
        type: 'aiBlock',
        position: { x: 600, y: 300 },
        data: {
          name: 'Tech Support',
          blockId: DEMO_BLOCKS.customerSupportBot.id,
          model: 'gpt-4o',
        },
      },
      {
        id: 'ai-general',
        type: 'aiBlock',
        position: { x: 600, y: 500 },
        data: {
          name: 'General Support',
          blockId: DEMO_BLOCKS.customerSupportBot.id,
          model: 'gpt-4o',
        },
      },
      {
        id: 'func-wrapper',
        type: 'functionBlock',
        position: { x: 850, y: 300 },
        data: {
          name: 'Response Wrapper',
          blockId: DEMO_BLOCKS.responseWrapper.id,
        },
      },
      {
        id: 'sink-1',
        type: 'sink',
        position: { x: 1100, y: 300 },
        data: { name: 'Response', outputType: 'json' },
      },
    ],
    edges: [
      { id: 'e-source-router', source: 'source-1', target: 'router-1', type: 'smoothstep', animated: true },
      { id: 'e-router-billing', source: 'router-1', target: 'ai-billing', sourceHandle: 'billing', type: 'smoothstep', animated: true },
      { id: 'e-router-technical', source: 'router-1', target: 'ai-technical', sourceHandle: 'technical', type: 'smoothstep', animated: true },
      { id: 'e-router-general', source: 'router-1', target: 'ai-general', sourceHandle: 'general', type: 'smoothstep', animated: true },
      { id: 'e-billing-wrapper', source: 'ai-billing', target: 'func-wrapper', type: 'smoothstep', animated: true },
      { id: 'e-technical-wrapper', source: 'ai-technical', target: 'func-wrapper', type: 'smoothstep', animated: true },
      { id: 'e-general-wrapper', source: 'ai-general', target: 'func-wrapper', type: 'smoothstep', animated: true },
      { id: 'e-wrapper-sink', source: 'func-wrapper', target: 'sink-1', type: 'smoothstep', animated: true },
    ],
  },
  mathSolverPipeline: {
    id: 'eeeeeeee-0000-0000-0000-000000000003',
    workspaceId: DEMO_WORKSPACE.id,
    name: 'Math Problem Solver',
    description: 'Solves math problems using AI with calculator tools.',
    enabled: true,
    triggers: [{ type: 'manual' }],
    nodes: [
      {
        id: 'source-1',
        type: 'source',
        position: { x: 100, y: 200 },
        data: { name: 'Math Problem', triggerType: 'manual' },
      },
      {
        id: 'ai-1',
        type: 'aiBlock',
        position: { x: 350, y: 200 },
        data: {
          name: 'Math Solver',
          blockId: DEMO_BLOCKS.mathSolver.id,
          model: 'gpt-4o-mini',
        },
      },
      {
        id: 'func-1',
        type: 'functionBlock',
        position: { x: 600, y: 200 },
        data: {
          name: 'Data Validator',
          blockId: DEMO_BLOCKS.dataValidator.id,
        },
      },
      {
        id: 'sink-1',
        type: 'sink',
        position: { x: 850, y: 200 },
        data: { name: 'Solution', outputType: 'json' },
      },
    ],
    edges: [
      { id: 'e-source-ai', source: 'source-1', target: 'ai-1', type: 'smoothstep', animated: true },
      { id: 'e-ai-func', source: 'ai-1', target: 'func-1', type: 'smoothstep', animated: true },
      { id: 'e-func-sink', source: 'func-1', target: 'sink-1', type: 'smoothstep', animated: true },
    ],
  },
  parallelAnalyzer: {
    id: 'eeeeeeee-0000-0000-0000-000000000004',
    workspaceId: DEMO_WORKSPACE.id,
    name: 'Parallel Analysis Pipeline',
    description: 'Runs sentiment analysis and product recommendations in parallel.',
    enabled: true,
    triggers: [{ type: 'manual' }],
    nodes: [
      {
        id: 'source-1',
        type: 'source',
        position: { x: 100, y: 300 },
        data: { name: 'Input', triggerType: 'manual' },
      },
      {
        id: 'parallel-1',
        type: 'parallel',
        position: { x: 350, y: 300 },
        data: { name: 'Parallel Analysis', branches: ['sentiment', 'products'] },
      },
      {
        id: 'ai-sentiment',
        type: 'aiBlock',
        position: { x: 600, y: 150 },
        data: {
          name: 'Sentiment Analyzer',
          blockId: DEMO_BLOCKS.sentimentAnalyzer.id,
          model: 'gpt-4o-mini',
        },
      },
      {
        id: 'ai-products',
        type: 'aiBlock',
        position: { x: 600, y: 450 },
        data: {
          name: 'Product Recommender',
          blockId: DEMO_BLOCKS.productRecommender.id,
          model: 'gpt-4o',
        },
      },
      {
        id: 'func-formatter',
        type: 'functionBlock',
        position: { x: 850, y: 300 },
        data: {
          name: 'JSON Formatter',
          blockId: DEMO_BLOCKS.jsonFormatter.id,
        },
      },
      {
        id: 'sink-1',
        type: 'sink',
        position: { x: 1100, y: 300 },
        data: { name: 'Combined Output', outputType: 'json' },
      },
    ],
    edges: [
      { id: 'e-source-parallel', source: 'source-1', target: 'parallel-1', type: 'smoothstep', animated: true },
      { id: 'e-parallel-sentiment', source: 'parallel-1', target: 'ai-sentiment', sourceHandle: 'sentiment', type: 'smoothstep', animated: true },
      { id: 'e-parallel-products', source: 'parallel-1', target: 'ai-products', sourceHandle: 'products', type: 'smoothstep', animated: true },
      { id: 'e-sentiment-formatter', source: 'ai-sentiment', target: 'func-formatter', type: 'smoothstep', animated: true },
      { id: 'e-products-formatter', source: 'ai-products', target: 'func-formatter', type: 'smoothstep', animated: true },
      { id: 'e-formatter-sink', source: 'func-formatter', target: 'sink-1', type: 'smoothstep', animated: true },
    ],
  },
};

// ============================================================================
// HISTORICAL EXECUTION DATA GENERATORS
// ============================================================================

// Sample inputs for different block types
export const SAMPLE_INPUTS = {
  sentiment: [
    { text: "I absolutely love this product! Best purchase ever!" },
    { text: "This is terrible. Complete waste of money." },
    { text: "It's okay, nothing special but does the job." },
    { text: "Amazing customer service, will definitely buy again!" },
    { text: "Disappointed with the quality, expected better." },
    { text: "The product arrived on time and works as expected." },
    { text: "Worst experience I've ever had with any company." },
    { text: "Pretty good value for the price." },
    { text: "Outstanding! Exceeded all my expectations!" },
    { text: "Meh, could be better but could be worse too." },
  ],
  support: [
    { message: "I can't log into my account", customerName: "John" },
    { message: "When will my order arrive?", customerName: "Jane", orderId: "ORD-12345" },
    { message: "I want a refund for my purchase", customerName: "Bob", orderId: "ORD-67890" },
    { message: "How do I update my payment method?", customerName: "Alice" },
    { message: "The app keeps crashing on my phone", customerName: "Charlie" },
    { message: "Thank you for the quick delivery!", customerName: "Diana" },
    { message: "I need to change my shipping address", customerName: "Eve", orderId: "ORD-11111" },
    { message: "Why was I charged twice?", customerName: "Frank", orderId: "ORD-22222" },
  ],
  math: [
    { problem: "What is 15 + 27?" },
    { problem: "Calculate 8 * 9" },
    { problem: "What is 100 + 50 * 2?" },
    { problem: "Add 33 and 44, then multiply by 2" },
    { problem: "What is 7 * 8 + 6?" },
  ],
  weather: [
    { location: "San Francisco", activity: "hiking" },
    { location: "New York", activity: "outdoor dining" },
    { location: "Seattle", activity: "running" },
    { location: "Miami", activity: "beach" },
    { location: "Los Angeles", activity: "picnic" },
  ],
  products: [
    { query: "electronics under $100", budget: 100 },
    { query: "sports gear for running", preferences: "lightweight" },
    { query: "home office", budget: 200 },
    { query: "kitchen gadgets" },
    { query: "gifts for runners", budget: 50 },
  ],
};

// Sample outputs for different scenarios
export const SAMPLE_OUTPUTS = {
  sentimentPositive: { sentiment: 'positive', confidence: 0.95, keywords: ['love', 'best', 'amazing'] },
  sentimentNegative: { sentiment: 'negative', confidence: 0.88, keywords: ['terrible', 'waste', 'disappointed'] },
  sentimentNeutral: { sentiment: 'neutral', confidence: 0.72, keywords: ['okay', 'expected', 'decent'] },
  supportBilling: { response: "I'll help you with that billing concern.", category: 'billing', requiresEscalation: false },
  supportTechnical: { response: "Let me troubleshoot this technical issue.", category: 'technical', requiresEscalation: false },
  supportGeneral: { response: "Thank you for reaching out!", category: 'general', requiresEscalation: false },
  mathResult: { answer: 42, explanation: "Using the add and multiply tools...", toolsUsed: ['add', 'multiply'] },
};

// Feedback categories for decisions
export const FEEDBACK_CATEGORIES = ['perfect', 'partial', 'wrong_format', 'hallucination', 'missing_info'] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateUUID(prefix: string, index: number): string {
  const paddedIndex = index.toString().padStart(12, '0');
  return `${prefix}-${paddedIndex.slice(0, 4)}-${paddedIndex.slice(4, 8)}-${paddedIndex.slice(8, 12)}`;
}

export function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]!;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomDate(startDays: number, endDays: number): Date {
  const now = Date.now();
  const start = now - startDays * 24 * 60 * 60 * 1000;
  const end = now - endDays * 24 * 60 * 60 * 1000;
  return new Date(randomInt(start, end));
}

export function randomStatus(): 'completed' | 'failed' | 'cancelled' {
  const rand = Math.random();
  if (rand < 0.80) return 'completed';
  if (rand < 0.95) return 'failed';
  return 'cancelled';
}
