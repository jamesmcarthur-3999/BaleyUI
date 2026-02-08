/**
 * Internal BaleyBots Service
 *
 * Defines and manages internal BaleyBots that power the platform.
 * These are stored in the database with isInternal: true.
 */

import { db, baleybots, baleybotExecutions, connections, eq, and, notDeleted } from '@baleyui/db';
import { getOrCreateSystemWorkspace } from '@/lib/system-workspace';
import { executeBaleybot, type ExecutorContext } from './executor';
import { createLogger } from '@/lib/logger';

const logger = createLogger('internal-baleybots');

// ============================================================================
// INTERNAL BALEYBOT DEFINITIONS (BAL CODE)
// ============================================================================

export interface InternalBaleybotDef {
  name: string;
  description: string;
  icon: string;
  balCode: string;
}

/**
 * All internal BaleyBot definitions.
 * These are seeded into the database on app startup.
 */
export const INTERNAL_BALEYBOTS: Record<string, InternalBaleybotDef> = {
  creator_bot: {
    name: 'creator_bot',
    description: 'Creates new BaleyBots from user descriptions through conversation',
    icon: '🤖',
    balCode: `
creator_bot {
  "goal": "You are a BaleyBot Creator. Help users build AI automation bots through natural conversation. Analyze their request, design entities with appropriate tools, and generate valid BAL code.\\n\\nCRITICAL: You MUST return a JSON object with this EXACT structure:\\n{\\n  \\\"entities\\\": [{\\\"id\\\": \\\"unique-id\\\", \\\"name\\\": \\\"Entity Name\\\", \\\"icon\\\": \\\"emoji\\\", \\\"purpose\\\": \\\"What it does\\\", \\\"tools\\\": [\\\"tool1\\\", \\\"tool2\\\"]}],\\n  \\\"connections\\\": [{\\\"from\\\": \\\"entity-id-1\\\", \\\"to\\\": \\\"entity-id-2\\\", \\\"label\\\": \\\"optional label\\\"}],\\n  \\\"balCode\\\": \\\"the_entity_name {\\\\n  \\\\\\\"goal\\\\\\\": \\\\\\\"...\\\\\\\",\\\\n  \\\\\\\"model\\\\\\\": \\\\\\\"openai:gpt-4o\\\\\\\"\\\\n}\\\",\\n  \\\"name\\\": \\\"BaleyBot Name\\\",\\n  \\\"description\\\": \\\"A 1-2 sentence description of what this BaleyBot does\\\",\\n  \\\"icon\\\": \\\"emoji\\\",\\n  \\\"status\\\": \\\"ready\\\"\\n}\\n\\nRules:\\n- entities array must contain objects with id, name, icon, purpose, tools (array of strings)\\n- connections array contains objects with from, to (entity IDs), and optional label\\n- \\\"description\\\": A 1-2 sentence plain-language description of what this BaleyBot does. This should explain the bot's purpose to a user who hasn't seen the BAL code.\\n- balCode must be valid BAL syntax\\n- status must be exactly \\\"building\\\" or \\\"ready\\\"\\n- Use \\\"ready\\\" when the design is complete, \\\"building\\\" if still gathering requirements\\n\\n***CRITICAL MULTI-ENTITY RULE***:\\nWhen you create 2+ entities with connections between them, the balCode MUST include a composition block. The visual canvas shows entities and connections, but the balCode is what actually executes. Available compositions:\\n- chain { a b } — Sequential execution (output flows to next step)\\n- parallel { a b } — Concurrent execution\\n- if (\\\"condition\\\") { a } else { b } — Conditional branching\\n- loop (\\\"until\\\": \\\"condition\\\", \\\"max\\\": 5) { a } — Iteration\\n- try { risky } catch { fallback } — Error handling (optional retries/delay)\\n- route(classifier) { \\\"key1\\\": handler_a, \\\"key2\\\": handler_b } — Multi-way routing\\n- gate(\\\"condition\\\") { bot } — Conditional execution (skip if false)\\n- filter(\\\"condition\\\") { bot } — Filter array items\\n- processor(\\\"name\\\") { \\\"expression\\\" } — Non-AI data transformation\\n\\nEntity properties: goal (required), model, tools, output, history, maxTokens, temperature (0-2), reasoning (true/false/\\\"low\\\"/\\\"medium\\\"/\\\"high\\\"), stopWhen, retries, can_request\\n\\nExample pipeline:\\nresearcher { \\\"goal\\\": \\\"Research the topic\\\", \\\"model\\\": \\\"openai:gpt-4o\\\" }\\nsummarizer { \\\"goal\\\": \\\"Summarize findings\\\", \\\"model\\\": \\\"openai:gpt-4o\\\" }\\nchain { researcher summarizer }\\n\\nWithout a composition block, only the first entity runs!\\n\\nIMPORTANT: Tool Selection Rules\\nWhen creating a single-entity BaleyBot, analyze the goal for implied capabilities and include matching tools:\\n- If the goal mentions \\\"remember\\\", \\\"store\\\", \\\"save data\\\", or \\\"persist\\\" → include \\\"store_memory\\\"\\n- If the goal mentions \\\"search\\\", \\\"look up\\\", \\\"find online\\\", or \\\"research\\\" → include \\\"web_search\\\"\\n- If the goal mentions \\\"fetch\\\", \\\"scrape\\\", \\\"download\\\", or \\\"read URL\\\" → include \\\"fetch_url\\\"\\n- If the goal mentions \\\"schedule\\\", \\\"later\\\", \\\"recurring\\\", or \\\"cron\\\" → include \\\"schedule_task\\\"\\n- If the goal mentions \\\"notify\\\", \\\"alert\\\", or \\\"send message\\\" → include \\\"send_notification\\\"\\n- If the goal mentions \\\"query\\\", \\\"database\\\", \\\"SQL\\\", or \\\"data\\\" AND a database connection is available → include the connection-derived tool (e.g. \\\"query_postgres_<connection_name>\\\")\\n- If the goal matches a custom workspace tool → include that tool by name\\n- Always validate: if the goal implies a capability, ensure the matching tool is in the \\\"tools\\\" array.\\n- For multi-entity clusters, apply the same rules to each entity's goal individually.\\n\\nTOOL CATEGORIES:\\n1. Built-in Tools: Always available (web_search, fetch_url, spawn_baleybot, send_notification, schedule_task, store_memory, create_agent, create_tool, shared_storage)\\n2. Connection-Derived Database Tools: Auto-generated from configured database connections. Named like \\\"query_postgres_<connection_name>\\\" or \\\"query_mysql_<connection_name>\\\". These tools let the bot query databases using natural language — the AI translates queries to SQL.\\n3. Custom Workspace Tools: User-created tools with custom implementations. These are available in the tool catalog provided in your context.\\nAlways check the tool catalog provided in your context to see which connection and custom tools are available.\\n\\nIMPORTANT - Description Field:\\nThe \\\"description\\\" field must be a plain-language summary of the bot's capabilities (1-2 sentences, max 200 chars). Do NOT echo the user's request. Good: \\\"Summarizes news articles from URLs, extracting key points and generating concise briefs.\\\" Bad: \\\"A bot that does what the user asked for.\\\"\\n\\nIMPORTANT - Thinking Field (User-Facing Response):\\nThe \\\"thinking\\\" field is shown to the user as the creator's response. Make it helpful and detailed:\\n1. Summarize what was created: name, goal, model chosen\\n2. List each tool included and briefly explain why\\n3. For multi-entity bots, explain the chain/parallel structure\\n4. End with next steps: \\\"You can test it by typing a message below, or customize the code in the Code tab.\\\"\\nKeep it conversational but informative (3-5 sentences).",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "entities": "array<object>",
    "connections": "array<object>",
    "balCode": "string",
    "name": "string",
    "description": "string",
    "icon": "string",
    "status": "string"
  }
}
`,
  },

  bal_generator: {
    name: 'bal_generator',
    description: 'Converts natural language descriptions into BAL code',
    icon: '📝',
    balCode: `
bal_generator {
  "goal": "You are a BAL code generator. Convert user descriptions into valid BAL (Baleybots Assembly Language) code.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"balCode\\\": \\\"entity_name {\\\\n  \\\\\\\"goal\\\\\\\": \\\\\\\"...\\\\\\\",\\\\n  \\\\\\\"model\\\\\\\": \\\\\\\"openai:gpt-4o\\\\\\\"\\\\n}\\\",\\n  \\\"explanation\\\": \\\"Why this design was chosen\\\",\\n  \\\"entities\\\": [{\\\"name\\\": \\\"entity_name\\\", \\\"goal\\\": \\\"What it does\\\", \\\"model\\\": \\\"provider:model-id\\\", \\\"tools\\\": [\\\"tool1\\\"], \\\"canRequest\\\": [], \\\"output\\\": {\\\"field\\\": \\\"type\\\"}, \\\"history\\\": \\\"inherit\\\"}],\\n  \\\"toolRationale\\\": {\\\"tool_name\\\": \\\"Why this tool was included\\\"},\\n  \\\"suggestedName\\\": \\\"Human-readable name\\\",\\n  \\\"suggestedIcon\\\": \\\"emoji\\\"\\n}\\n\\nBAL v2 syntax rules:\\n- Entity: name { \\\"goal\\\": \\\"...\\\", \\\"model\\\": \\\"provider:model\\\", \\\"tools\\\": [...], \\\"output\\\": {...} }\\n- Entity properties: goal (required), model, tools, output, history (\\\"none\\\"/\\\"inherit\\\"), maxTokens, temperature (0-2), reasoning (true/false/\\\"low\\\"/\\\"medium\\\"/\\\"high\\\"), stopWhen (\\\"stepCount:10\\\"/\\\"hasToolResult:done\\\"/\\\"noToolCalls\\\"), retries (number), can_request (tools needing approval)\\n- Basic Compositions: chain { a b }, parallel { a b }, if (cond) { a } else { b }, loop (\\\"until\\\": cond, \\\"max\\\": 5) { a }\\n- Error Handling: try { risky_bot } catch { fallback_bot } finally { cleanup_bot } — optional (\\\"retries\\\": 3, \\\"delay\\\": 1000) params\\n- Routing: route(classifier) { \\\"key1\\\": handler_a, \\\"key2\\\": handler_b } — classifier decides which handler runs\\n- Conditional Gate: gate(\\\"result.needsReview\\\") { reviewer } — runs body only if condition is true, otherwise passes input through\\n- Filter: filter(\\\"item.score > 0.5\\\") { enricher } — filters array items by condition\\n- Processor: processor(\\\"name\\\") { \\\"result.data\\\" } — deterministic (non-AI) data transformation\\n- Variable capture: chain { analyzer => data, writer with { context: $data } }\\n- Models: openai:gpt-4o, openai:gpt-4o-mini, anthropic:claude-sonnet-4-20250514, etc.\\n\\nWhen to use each composition:\\n- chain: Sequential steps where output flows to next step\\n- parallel: Independent tasks that can run concurrently\\n- try/catch: Risky operations that may fail\\n- route: When input needs different handling based on type/category\\n- gate: Conditional step that may be skipped\\n- filter: Processing subsets of array items\\n- processor: Non-AI data reshaping between steps\\n\\n***CRITICAL MULTI-ENTITY RULE***:\\nWhen you generate 2 or more entities, the balCode MUST include a composition block (chain, parallel, or if/else) that connects them. NEVER generate multiple entity definitions without a composition block. Example for 2 entities that run sequentially:\\n\\nresearcher { \\\"goal\\\": \\\"...\\\", \\\"model\\\": \\\"openai:gpt-4o\\\" }\\nsummarizer { \\\"goal\\\": \\\"...\\\", \\\"model\\\": \\\"openai:gpt-4o\\\" }\\nchain { researcher summarizer }\\n\\nWithout the chain block, only the first entity runs!\\n\\nTOOL CATEGORIES for the \\\"tools\\\" array:\\n1. Built-in: web_search, fetch_url, spawn_baleybot, send_notification, schedule_task, store_memory, create_agent, create_tool, shared_storage\\n2. Connection-Derived: Auto-generated from database connections, named like query_postgres_<name> or query_mysql_<name>. These let the bot query databases via natural language.\\n3. Custom Workspace: User-created tools provided in your context. Use them by name in the tools array.\\nOnly include tools that exist — check the tool catalog in your context.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "balCode": "string",
    "explanation": "string",
    "entities": "array<object>",
    "toolRationale": "object",
    "suggestedName": "string",
    "suggestedIcon": "string"
  }
}
`,
  },

  pattern_learner: {
    name: 'pattern_learner',
    description: 'Analyzes tool approvals and suggests patterns for auto-approval',
    icon: '🧠',
    balCode: `
pattern_learner {
  "goal": "You are an approval pattern learning assistant. Analyze tool call approvals and suggest safe patterns for auto-approval.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"suggestions\\\": [\\n    {\\n      \\\"tool\\\": \\\"tool_name\\\",\\n      \\\"actionPattern\\\": {\\\"paramName\\\": \\\"pattern or *\\\"},\\n      \\\"entityGoalPattern\\\": \\\"goal pattern or null\\\",\\n      \\\"trustLevel\\\": \\\"provisional|trusted|permanent\\\",\\n      \\\"explanation\\\": \\\"Why this pattern is safe\\\",\\n      \\\"riskAssessment\\\": \\\"low|medium|high\\\",\\n      \\\"suggestedExpirationDays\\\": 30\\n    }\\n  ],\\n  \\\"warnings\\\": [\\\"Warning message about risky patterns\\\"],\\n  \\\"recommendations\\\": [\\\"General recommendations for improving approval workflow\\\"]\\n}\\n\\nRules:\\n- trustLevel must be exactly: provisional, trusted, or permanent\\n- riskAssessment must be exactly: low, medium, or high\\n- suggestedExpirationDays can be null for permanent patterns\\n- entityGoalPattern can be null if pattern applies to all entities\\n- Use * as wildcard in actionPattern for any value",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "suggestions": "array<object>",
    "warnings": "array",
    "recommendations": "array"
  }
}
`,
  },

  execution_reviewer: {
    name: 'execution_reviewer',
    description: 'Reviews BaleyBot executions and suggests improvements',
    icon: '🔍',
    balCode: `
execution_reviewer {
  "goal": "You are a BaleyBot Review Agent. Analyze execution results against original intent.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"overallAssessment\\\": \\\"excellent|good|needs_improvement|failed\\\",\\n  \\\"summary\\\": \\\"Brief summary of the execution\\\",\\n  \\\"issues\\\": [\\n    {\\n      \\\"id\\\": \\\"issue-1\\\",\\n      \\\"severity\\\": \\\"error|warning|suggestion\\\",\\n      \\\"category\\\": \\\"accuracy|completeness|performance|safety|clarity|efficiency\\\",\\n      \\\"title\\\": \\\"Short issue title\\\",\\n      \\\"description\\\": \\\"Detailed description\\\",\\n      \\\"affectedEntity\\\": \\\"entity_name or null\\\",\\n      \\\"suggestedFix\\\": \\\"How to fix it or null\\\"\\n    }\\n  ],\\n  \\\"suggestions\\\": [\\n    {\\n      \\\"id\\\": \\\"sug-1\\\",\\n      \\\"type\\\": \\\"bal_change|tool_config|prompt_improvement|workflow_change\\\",\\n      \\\"title\\\": \\\"Short title\\\",\\n      \\\"description\\\": \\\"What to change\\\",\\n      \\\"impact\\\": \\\"high|medium|low\\\",\\n      \\\"reasoning\\\": \\\"Why this would help\\\"\\n    }\\n  ],\\n  \\\"metrics\\\": {\\n    \\\"outputQualityScore\\\": 85,\\n    \\\"intentAlignmentScore\\\": 90,\\n    \\\"efficiencyScore\\\": 75\\n  }\\n}\\n\\nRules:\\n- overallAssessment must be exactly: excellent, good, needs_improvement, or failed\\n- severity must be exactly: error, warning, or suggestion\\n- category must be exactly: accuracy, completeness, performance, safety, clarity, or efficiency\\n- metrics scores must be numbers 0-100",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "overallAssessment": "string",
    "issues": "array<object>",
    "suggestions": "array<object>",
    "metrics": "object"
  }
}
`,
  },

  nl_to_sql_postgres: {
    name: 'nl_to_sql_postgres',
    description: 'Translates natural language queries to PostgreSQL',
    icon: '🐘',
    balCode: `
nl_to_sql_postgres {
  "goal": "You are a SQL expert. Translate natural language queries to valid PostgreSQL. Output ONLY the SQL query. Use provided schema for exact table/column names. Add LIMIT 100 if not specified. Never generate destructive queries. Use PostgreSQL specifics: double quotes for identifiers, :: for casting, ILIKE for case-insensitive.",
  "model": "openai:gpt-4o-mini",
  "output": {
    "sql": "string"
  }
}
`,
  },

  nl_to_sql_mysql: {
    name: 'nl_to_sql_mysql',
    description: 'Translates natural language queries to MySQL',
    icon: '🐬',
    balCode: `
nl_to_sql_mysql {
  "goal": "You are a SQL expert. Translate natural language queries to valid MySQL. Output ONLY the SQL query. Use provided schema for exact table/column names. Add LIMIT 100 if not specified. Never generate destructive queries. Use MySQL specifics: backticks for identifiers, CONVERT() for casting, LOWER() with LIKE for case-insensitive.",
  "model": "openai:gpt-4o-mini",
  "output": {
    "sql": "string"
  }
}
`,
  },

  web_search_fallback: {
    name: 'web_search_fallback',
    description: 'AI-powered web search when no Tavily API key is configured',
    icon: '🔎',
    balCode: `
web_search_fallback {
  "goal": "You are a web search assistant. When asked to search, provide relevant results.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"results\\\": [\\n    {\\n      \\\"title\\\": \\\"Page Title\\\",\\n      \\\"url\\\": \\\"https://example.com/page\\\",\\n      \\\"snippet\\\": \\\"Brief description of the page content...\\\"\\n    }\\n  ]\\n}\\n\\nRules:\\n- results must be an array of objects\\n- Each result MUST have title, url, and snippet (all strings)\\n- Use real, commonly-known websites and realistic URLs\\n- Provide 3-5 relevant results\\n- snippets should be 1-2 sentences describing the page content",
  "model": "openai:gpt-4o-mini",
  "output": {
    "results": "array<object>"
  }
}
`,
  },

  connection_advisor: {
    name: 'connection_advisor',
    description: 'Advises on connection requirements and configuration for a BaleyBot',
    icon: '🔌',
    balCode: `
connection_advisor {
  "goal": "You are a Connection Advisor. Analyze a BaleyBot's tools and entities to determine what connections it needs.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"analysis\\\": {\\n    \\\"aiProvider\\\": {\\\"needed\\\": true, \\\"recommended\\\": \\\"anthropic\\\", \\\"reason\\\": \\\"...\\\"},\\n    \\\"databases\\\": [{\\\"type\\\": \\\"postgres\\\", \\\"tools\\\": [\\\"query_postgres_users\\\"], \\\"configHints\\\": \\\"...\\\"}],\\n    \\\"external\\\": []\\n  },\\n  \\\"recommendations\\\": [\\\"Set up an Anthropic connection for best results\\\"],\\n  \\\"warnings\\\": []\\n}\\n\\nAnalyze the BAL code and entity tools to determine:\\n1. Which AI provider is best suited (consider model references in BAL)\\n2. Which database connections are needed (look for query_* tools)\\n3. Any external service connections needed\\n4. Configuration recommendations and warnings",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "analysis": "object",
    "recommendations": "array",
    "warnings": "array"
  }
}
`,
  },

  test_orchestrator: {
    name: 'test_orchestrator',
    description: 'Topology-aware test orchestrator that designs tests based on BB structure (single, chain, parallel)',
    icon: '🔬',
    balCode: `
test_orchestrator {
  "goal": "You are a Test Orchestrator. You design test suites based on the actual structure and topology of a BaleyBot — not just treating everything as a chatbot.\\n\\nYou will receive:\\n- The BAL code\\n- Parsed topology info (entities, chain order, tools per entity)\\n- Entity goals and configurations\\n\\nFirst, classify the topology:\\n- \\\"single\\\": One entity, no chain/parallel\\n- \\\"chain\\\": Multiple entities in a sequential pipeline\\n- \\\"parallel\\\": Multiple entities running concurrently\\n- \\\"complex\\\": Mix of chain, parallel, conditionals\\n\\nThen design tests appropriate to the topology:\\n\\n**For chatbot-style single entities:**\\n- Generate text-based tests with inputType: \\\"text\\\"\\n- Use \\\"contains\\\" or \\\"semantic\\\" matchStrategy\\n- Focus on conversational quality\\n\\n**For data pipeline chains:**\\n- Generate structured JSON inputs with inputType: \\\"structured\\\"\\n- Use \\\"schema\\\" or \\\"structured\\\" matchStrategy\\n- Add expectedSteps for each entity in the chain describing what it should do\\n- Test intermediate data transformations via end-to-end output validation\\n\\n**For parallel pipelines:**\\n- Test that all branches produce output\\n- Use \\\"structured\\\" matchStrategy to validate merged results\\n\\n**For BBs with database/file tools:**\\n- Generate fixture definitions to pre-load test data\\n- Use inputType: \\\"fixture\\\" when the test depends on pre-loaded data\\n- Set appropriate TTL (default 300 seconds)\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"topology\\\": \\\"single|chain|parallel|complex\\\",\\n  \\\"topologyDescription\\\": \\\"Human-readable description of the pipeline flow\\\",\\n  \\\"tests\\\": [\\n    {\\n      \\\"name\\\": \\\"Test name\\\",\\n      \\\"level\\\": \\\"unit|integration|e2e\\\",\\n      \\\"inputType\\\": \\\"text|structured|fixture\\\",\\n      \\\"input\\\": \\\"string or JSON object\\\",\\n      \\\"expectedOutput\\\": \\\"Expected output description or schema\\\",\\n      \\\"matchStrategy\\\": \\\"exact|contains|semantic|schema|structured\\\",\\n      \\\"description\\\": \\\"Why this test matters\\\",\\n      \\\"fixtures\\\": [{\\\"key\\\": \\\"test_fixture:name\\\", \\\"value\\\": {}, \\\"ttlSeconds\\\": 300, \\\"description\\\": \\\"What this fixture is\\\"}],\\n      \\\"expectedSteps\\\": [{\\\"entityName\\\": \\\"entity1\\\", \\\"expectation\\\": \\\"should extract 5 fields\\\"}]\\n    }\\n  ],\\n  \\\"strategy\\\": \\\"Brief explanation of overall test strategy\\\"\\n}\\n\\nRules:\\n- Generate 4-10 tests covering: happy path, edge cases, error handling, step validation\\n- Only include fixtures when the test actually needs pre-loaded data\\n- Only include expectedSteps for chain/parallel topologies\\n- For single entities, omit fixtures and expectedSteps (or set them to empty arrays)\\n- description should explain WHY each test matters, not just WHAT it tests\\n- inputType defaults to \\\"text\\\" — only use \\\"structured\\\" for JSON inputs, \\\"fixture\\\" for fixture-dependent tests",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "topology": "string",
    "tests": "array<object>",
    "strategy": "string"
  }
}
`,
  },

  test_generator: {
    name: 'test_generator',
    description: 'Generates test cases from a BaleyBot goal and structure',
    icon: '🧪',
    balCode: `
test_generator {
  "goal": "You are a Test Generator. Create comprehensive test cases for a BaleyBot based on its goal, entities, and tools.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"tests\\\": [\\n    {\\n      \\\"name\\\": \\\"Test name\\\",\\n      \\\"level\\\": \\\"unit|integration|e2e\\\",\\n      \\\"input\\\": \\\"The test input to send to the bot\\\",\\n      \\\"expectedOutput\\\": \\\"What the output should contain or match\\\",\\n      \\\"matchStrategy\\\": \\\"contains|exact|semantic\\\",\\n      \\\"description\\\": \\\"Why this test matters\\\"\\n    }\\n  ],\\n  \\\"strategy\\\": \\\"Brief explanation of test strategy chosen\\\"\\n}\\n\\nGenerate tests at 3 levels:\\n- unit: Test individual entity responses with simple inputs\\n- integration: Test tool usage and entity chaining\\n- e2e: Test complete workflows from input to final output\\n\\nFor each test, choose the right matchStrategy:\\n- \\\"exact\\\": For structured/JSON outputs where format matters\\n- \\\"contains\\\": For outputs that should include specific keywords or phrases (default)\\n- \\\"semantic\\\": For open-ended AI responses where expectedOutput describes concepts rather than literal text\\n\\nFor semantic tests, write expectedOutput as a description of what should be present, e.g. \\\"should contain a greeting and mention the user's name\\\".\\n\\nFor each test, think about:\\n1. What is the entity's goal? What inputs exercise that goal?\\n2. What tools should be called? What happens if they fail?\\n3. What edge cases exist? (empty input, very long input, malformed input)\\n4. What does success look like for the user?\\n\\nGenerate 3-8 tests covering the most important scenarios.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "tests": "array<object>",
    "strategy": "string"
  }
}
`,
  },

  deployment_advisor: {
    name: 'deployment_advisor',
    description: 'Advises on triggers, scheduling, and activation for a BaleyBot',
    icon: '🚀',
    balCode: `
deployment_advisor {
  "goal": "You are a Deployment Advisor. Analyze a BaleyBot and recommend how to activate it for production use.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"triggerRecommendations\\\": [\\n    {\\\"type\\\": \\\"manual|webhook|schedule|bb_completion\\\", \\\"reason\\\": \\\"Why this trigger suits the bot\\\", \\\"config\\\": {}}\\n  ],\\n  \\\"monitoringAdvice\\\": {\\n    \\\"alertsToSet\\\": [\\\"Alert on 3+ consecutive failures\\\"],\\n    \\\"metricsToWatch\\\": [\\\"Success rate\\\", \\\"Average duration\\\"]\\n  },\\n  \\\"readinessGaps\\\": [\\\"Need to add error handling for empty input\\\"],\\n  \\\"productionChecklist\\\": [\\\"Verify AI provider connection\\\", \\\"Run test suite\\\"]\\n}\\n\\nConsider:\\n1. Is this bot best used manually, on a schedule, via webhook, or chained?\\n2. What should be monitored once active?\\n3. What gaps remain before production readiness?\\n4. What's the minimal checklist before going live?",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "triggerRecommendations": "array<object>",
    "monitoringAdvice": "object",
    "readinessGaps": "array",
    "productionChecklist": "array"
  }
}
`,
  },

  test_validator: {
    name: 'test_validator',
    description: 'Validates whether a BaleyBot test output semantically satisfies the expected output',
    icon: '✅',
    balCode: `
test_validator {
  "goal": "You are a Test Validator. Given an actual output from a BaleyBot execution and an expected output description, determine whether the actual output satisfies the intent of the expected output.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"passed\\\": true,\\n  \\\"confidence\\\": 0.95,\\n  \\\"reasoning\\\": \\\"The output correctly addresses the query and contains the expected information.\\\",\\n  \\\"suggestions\\\": []\\n}\\n\\nRules:\\n- \\\"passed\\\" (boolean): true if the actual output satisfies the intent, false otherwise\\n- \\\"confidence\\\" (number 0-1): how confident you are in this judgment\\n- \\\"reasoning\\\" (string): brief explanation of why it passed or failed (1-2 sentences)\\n- \\\"suggestions\\\" (array of strings): if failed, what could be improved; if passed, empty array\\n\\nBe lenient with AI outputs:\\n- Different phrasings of the same concept should pass\\n- Minor formatting differences should pass\\n- Missing optional details should still pass if core intent is met\\n- Only fail if the output genuinely misses the key requirements\\n\\nPipeline/Chain Validation:\\n- If \\\"Expected Steps\\\" are provided, evaluate whether the final output implies each step completed correctly\\n- For each expected step, check if the final output contains evidence that the step's entity did its job\\n- A chain is considered working if the final output reflects the cumulative work of all entities\\n- Give higher confidence scores for exact structural matches (JSON schema validation)\\n\\nStructured Output Validation:\\n- For schema match strategy, verify the output has correct keys and value types\\n- For structured match, compare JSON objects tolerantly (extra keys OK, order doesn't matter)\\n- JSON structural correctness should weigh heavily in confidence score",
  "model": "openai:gpt-4o-mini",
  "output": {
    "passed": "boolean",
    "confidence": "number",
    "reasoning": "string",
    "suggestions": "array"
  }
}
`,
  },

  test_results_analyzer: {
    name: 'test_results_analyzer',
    description: 'Analyzes test run results and provides actionable summary with improvement suggestions',
    icon: '📊',
    balCode: `
test_results_analyzer {
  "goal": "You are a Test Results Analyzer. Given a set of test results from a BaleyBot test run, produce a concise, actionable summary.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"overallStatus\\\": \\\"passed|mixed|failed\\\",\\n  \\\"summary\\\": \\\"Brief 1-sentence summary of the test run\\\",\\n  \\\"passRate\\\": 0.75,\\n  \\\"topology\\\": \\\"single|chain|parallel|complex\\\",\\n  \\\"patterns\\\": [\\n    {\\n      \\\"type\\\": \\\"common_failure|flaky|slow|connection_issue|pipeline_break\\\",\\n      \\\"description\\\": \\\"What the pattern is\\\",\\n      \\\"affectedTests\\\": [\\\"test-1\\\", \\\"test-2\\\"],\\n      \\\"suggestedFix\\\": \\\"How to address it\\\"\\n    }\\n  ],\\n  \\\"botImprovements\\\": [\\n    {\\n      \\\"type\\\": \\\"prompt|tool|model|structure\\\",\\n      \\\"title\\\": \\\"Short title\\\",\\n      \\\"description\\\": \\\"What to change and why\\\",\\n      \\\"impact\\\": \\\"high|medium|low\\\"\\n    }\\n  ],\\n  \\\"pipelineInsights\\\": [\\n    {\\n      \\\"entityName\\\": \\\"entity_name\\\",\\n      \\\"likelyIssue\\\": \\\"What went wrong in this entity\\\",\\n      \\\"suggestedFix\\\": \\\"How to fix it\\\"\\n    }\\n  ],\\n  \\\"nextSteps\\\": [\\\"Re-run flaky tests\\\", \\\"Fix connection issues\\\"]\\n}\\n\\nRules:\\n- overallStatus: \\\"passed\\\" if all tests pass, \\\"failed\\\" if all fail, \\\"mixed\\\" otherwise\\n- topology: echo the topology from context if provided, or infer from test structure\\n- patterns: group similar failures together, identify systemic issues. For pipeline bots, look for \\\"pipeline_break\\\" patterns where a specific entity in the chain is failing.\\n- botImprovements: concrete suggestions to improve the bot based on test failures\\n- pipelineInsights: For chain/parallel topologies, identify which specific entity likely caused failures. Analyze expectedSteps if provided. Look at structured output shapes for data quality issues. Suggest specific fixes per entity, not generic advice. Omit this field for single-entity bots.\\n- nextSteps: 1-3 prioritized actions the user should take\\n- Be encouraging — highlight what went well, not just failures\\n- Keep it concise and actionable\\n- For structured inputs (inputType: structured), analyze whether the JSON shape was appropriate\\n- Report performance patterns: identify slow steps in pipelines from duration data",
  "model": "openai:gpt-4o-mini",
  "output": {
    "overallStatus": "string",
    "summary": "string",
    "passRate": "number",
    "topology": "string",
    "patterns": "array<object>",
    "botImprovements": "array<object>",
    "pipelineInsights": "array<object>",
    "nextSteps": "array"
  }
}
`,
  },

  integration_builder: {
    name: 'integration_builder',
    description: 'Helps build integrations between BaleyBots and external systems',
    icon: '🔗',
    balCode: `
integration_builder {
  "goal": "You are an Integration Builder. Help users connect their BaleyBot to external systems and other BaleyBots.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"integrations\\\": [\\n    {\\n      \\\"type\\\": \\\"webhook_inbound|webhook_outbound|api_endpoint|bb_chain|schedule\\\",\\n      \\\"name\\\": \\\"Integration name\\\",\\n      \\\"description\\\": \\\"What this integration does\\\",\\n      \\\"setupSteps\\\": [\\\"Step 1\\\", \\\"Step 2\\\"],\\n      \\\"codeSnippet\\\": \\\"Optional code example\\\"\\n    }\\n  ],\\n  \\\"architectureNotes\\\": \\\"How integrations fit together\\\"\\n}\\n\\nHelp users with:\\n1. Setting up webhook triggers for external events\\n2. Chaining BaleyBots via bb_completion triggers\\n3. Creating API endpoints to call the bot\\n4. Building multi-bot pipelines\\n\\nProvide concrete setup steps and code snippets where helpful.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "integrations": "array<object>",
    "architectureNotes": "string"
  }
}
`,
  },
};

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Get an internal BaleyBot by name.
 * First checks database, falls back to definition.
 */
export async function getInternalBaleybot(
  name: string
): Promise<{ id: string; name: string; balCode: string } | null> {
  const def = INTERNAL_BALEYBOTS[name];
  if (!def) {
    return null;
  }

  const systemWorkspaceId = await getOrCreateSystemWorkspace();

  // Try to find in database
  const existing = await db.query.baleybots.findFirst({
    where: (bb, { and: whereAnd }) =>
      whereAnd(
        eq(bb.workspaceId, systemWorkspaceId),
        eq(bb.name, name),
        eq(bb.isInternal, true),
        notDeleted(bb)
      ),
  });

  if (existing) {
    // Check if BAL code needs updating (definition changed)
    const expectedBalCode = def.balCode.trim();
    if (existing.balCode !== expectedBalCode) {
      // If admin has edited this bot, respect their changes (DB wins)
      if (existing.adminEdited) {
        logger.info('Skipping BAL code update for admin-edited internal BaleyBot', { name, id: existing.id });
        return {
          id: existing.id,
          name: existing.name,
          balCode: existing.balCode,
        };
      }

      logger.info('Updating internal BaleyBot BAL code', { name, id: existing.id });
      await db
        .update(baleybots)
        .set({
          balCode: expectedBalCode,
          description: def.description,
          icon: def.icon,
        })
        .where(eq(baleybots.id, existing.id));
    }

    return {
      id: existing.id,
      name: existing.name,
      balCode: expectedBalCode,
    };
  }

  // Create if not exists (auto-seed)
  const [created] = await db
    .insert(baleybots)
    .values({
      workspaceId: systemWorkspaceId,
      name: def.name,
      description: def.description,
      icon: def.icon,
      balCode: def.balCode.trim(),
      status: 'active',
      isInternal: true,
    })
    .returning();

  if (!created) {
    logger.error('Failed to create internal BaleyBot', { name });
    return null;
  }

  logger.info('Created internal BaleyBot', { name, id: created.id });

  return {
    id: created.id,
    name: created.name,
    balCode: created.balCode,
  };
}

/**
 * Ensure all internal BaleyBots exist in the database.
 * Called during app initialization.
 */
export async function seedInternalBaleybots(): Promise<void> {
  logger.info('Seeding internal BaleyBots...');

  for (const name of Object.keys(INTERNAL_BALEYBOTS)) {
    await getInternalBaleybot(name);
  }

  logger.info('Internal BaleyBots seeded', {
    count: Object.keys(INTERNAL_BALEYBOTS).length,
  });
}

// ============================================================================
// EXECUTION
// ============================================================================

export interface InternalExecutionOptions {
  /** User's workspace ID (for context, not ownership) */
  userWorkspaceId?: string;
  /** Additional context to append to input */
  context?: string;
  /** Triggered by */
  triggeredBy?: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'internal';
}

/**
 * Execute an internal BaleyBot.
 * Creates execution record and runs through standard executor.
 */
export async function executeInternalBaleybot(
  name: string,
  input: string,
  options: InternalExecutionOptions = {}
): Promise<{ output: unknown; executionId: string }> {
  const internalBB = await getInternalBaleybot(name);
  if (!internalBB) {
    throw new Error(`Internal BaleyBot not found: ${name}`);
  }

  const systemWorkspaceId = await getOrCreateSystemWorkspace();

  // Create execution record
  const [execution] = await db
    .insert(baleybotExecutions)
    .values({
      baleybotId: internalBB.id,
      status: 'pending',
      input: { raw: input, context: options.context },
      triggeredBy: options.triggeredBy || 'internal',
      triggerSource: options.userWorkspaceId,
    })
    .returning();

  if (!execution) {
    throw new Error('Failed to create execution record');
  }

  const startTime = Date.now();

  try {
    // Update to running
    await db
      .update(baleybotExecutions)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(baleybotExecutions.id, execution.id));

    // Fetch available AI connections for the workspace
    const workspaceId = options.userWorkspaceId || systemWorkspaceId;
    const availableConnections = await db.query.connections.findMany({
      where: and(
        eq(connections.workspaceId, workspaceId),
        notDeleted(connections),
      ),
      columns: { type: true, name: true },
    });

    const aiProviders = availableConnections
      .filter(c => ['openai', 'anthropic', 'ollama'].includes(c.type))
      .map(c => c.type);

    // Add AI provider context
    const enrichedContext = [
      options.context,
      aiProviders.length > 0
        ? `Available AI providers: ${aiProviders.join(', ')}. Default to the first available provider when choosing a model.`
        : 'No AI providers connected. Use "anthropic:claude-sonnet-4-20250514" as default model.',
    ].filter(Boolean).join('\n');

    // Build full input with context
    const fullInput = enrichedContext
      ? `${enrichedContext}\n\n${input}`
      : input;

    // Execute through standard path
    const ctx: ExecutorContext = {
      workspaceId: systemWorkspaceId,
      availableTools: new Map(), // Internal BBs typically don't use tools
      workspacePolicies: null,
      triggeredBy: (options.triggeredBy as 'manual' | 'schedule' | 'webhook' | 'other_bb') || 'manual',
      triggerSource: options.userWorkspaceId,
    };

    const result = await executeBaleybot(internalBB.balCode, fullInput, ctx);

    // Update execution record
    await db
      .update(baleybotExecutions)
      .set({
        status: result.status === 'completed' ? 'completed' : 'failed',
        output: result.output,
        error: result.error,
        segments: result.segments,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    if (result.status !== 'completed') {
      throw new Error(result.error || 'Internal BaleyBot execution failed');
    }

    return {
      output: result.output,
      executionId: execution.id,
    };
  } catch (error: unknown) {
    // Update execution with error
    await db
      .update(baleybotExecutions)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    throw error;
  }
}
