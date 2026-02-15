import { describe, it, expect } from 'vitest';
import { stripLargeJsonBlocks } from '../strip-json';

describe('stripLargeJsonBlocks - Creator Scenario', () => {
  it('should strip bal_generator output from Baley response text', () => {
    // Simulate a Baley response that echoes the bal_generator JSON
    const baleyResponse = `I've created a customer support bot for you.

{"balCode":"support_agent { \\"goal\\": \\"Help customers with common product questions using web search\\", \\"model\\": \\"anthropic:claude-sonnet-4-20250514\\", \\"tools\\": { \\"web_search\\" } }","explanation":"This bot is designed to help customers with common product questions by searching the web for up-to-date information about your products and services.","entities":[{"type":"bot","name":"support_agent","role":"main","goal":"Help customers with common product questions using web search","tools":["web_search"]}],"toolRationale":{"web_search":"Enables the bot to find current information about products, pricing, and troubleshooting steps"},"suggestedName":"Product Support Bot","suggestedIcon":"headset"}

The bot will search the web to answer customer questions about your products. Would you like to test it?`;

    const result = stripLargeJsonBlocks(baleyResponse);

    // Should preserve the narrative text
    expect(result).toContain("I've created a customer support bot for you.");
    expect(result).toContain("The bot will search the web");
    expect(result).toContain("Would you like to test it?");

    // Should NOT contain any JSON keys
    expect(result).not.toContain('balCode');
    expect(result).not.toContain('entities');
    expect(result).not.toContain('toolRationale');
    expect(result).not.toContain('suggestedName');
    expect(result).not.toContain('suggestedIcon');
  });

  it('should strip even small JSON blocks with creator bot keys', () => {
    // Small JSON with creator keys should be stripped regardless of size
    const text = `Here's what I built: {"balCode":"bot { \\"goal\\": \\"test\\" }","suggestedName":"Test"} Let me know!`;

    const result = stripLargeJsonBlocks(text);

    expect(result).toContain("Here's what I built:");
    expect(result).toContain('Let me know!');
    expect(result).not.toContain('balCode');
    expect(result).not.toContain('suggestedName');
  });

  it('should handle multiple internal bot outputs in one message', () => {
    const text = `First, I generated the code: {"balCode":"bot1 { \\"goal\\": \\"Task 1\\" }","explanation":"Bot 1","entities":[],"toolRationale":{},"suggestedName":"Bot1","suggestedIcon":"icon1"}

Then I analyzed the connections: {"analysis":{"required":["openai"]},"recommendations":["Add database"],"warnings":[],"remediationSteps":[],"verificationPlan":[]}

All set!`;

    const result = stripLargeJsonBlocks(text);

    expect(result).toContain('First, I generated the code:');
    expect(result).toContain('Then I analyzed the connections:');
    expect(result).toContain('All set!');
    expect(result).not.toContain('balCode');
    expect(result).not.toContain('analysis');
    expect(result).not.toContain('recommendations');
  });

  it('should preserve JSON in code blocks for documentation', () => {
    const text = `Here's the configuration format:

\`\`\`json
{
  "balCode": "example { \\"goal\\": \\"test\\" }",
  "explanation": "This is an example"
}
\`\`\`

Use this format when creating bots manually.`;

    const result = stripLargeJsonBlocks(text);

    // Should preserve the code block
    expect(result).toContain('```json');
    expect(result).toContain('balCode');
    expect(result).toContain('explanation');
    expect(result).toContain('```');
  });

  it('should strip test orchestrator output', () => {
    const text = `I've designed the tests: {"topology":"chain","topologyDescription":"Two-step pipeline","tests":[{"input":"test","expected":"result"}],"strategy":"comprehensive"} Ready to run?`;

    const result = stripLargeJsonBlocks(text);

    expect(result).toContain("I've designed the tests:");
    expect(result).toContain('Ready to run?');
    // Check that JSON keys were removed (but "tests" might appear in narrative text)
    expect(result).not.toContain('"topology"');
    expect(result).not.toContain('[{"input"');
    expect(result).not.toContain('"strategy"');
  });

  it('should strip execution reviewer output', () => {
    const text = `Here's my review: {"overallAssessment":"good","summary":"Works well","issues":[],"suggestions":[{"text":"Add error handling"}],"metrics":{"quality":85}} Looks solid!`;

    const result = stripLargeJsonBlocks(text);

    expect(result).toContain("Here's my review:");
    expect(result).toContain('Looks solid!');
    expect(result).not.toContain('overallAssessment');
    expect(result).not.toContain('issues');
    expect(result).not.toContain('suggestions');
  });
});
