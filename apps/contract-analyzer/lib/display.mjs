// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BG_RED = '\x1b[41m';
const BG_YELLOW = '\x1b[43m';
const BG_GREEN = '\x1b[42m';

function riskColor(level) {
  const l = (level ?? '').toString().toLowerCase();
  if (l === 'high' || l === 'critical') return RED;
  if (l === 'medium' || l === 'moderate') return YELLOW;
  if (l === 'low') return GREEN;
  return WHITE;
}

function riskScoreBadge(score) {
  if (score == null) return `${DIM}N/A${RESET}`;
  const n = Number(score);
  if (n >= 7) return `${BG_RED}${WHITE}${BOLD} ${n.toFixed(1)}/10 HIGH RISK ${RESET}`;
  if (n >= 4) return `${BG_YELLOW}${BOLD} ${n.toFixed(1)}/10 MEDIUM RISK ${RESET}`;
  return `${BG_GREEN}${BOLD} ${n.toFixed(1)}/10 LOW RISK ${RESET}`;
}

function separator(char = '─', len = 60) {
  return DIM + char.repeat(len) + RESET;
}

/**
 * Display the full analysis result in the terminal.
 * @param {object} result - Parsed execution output
 * @param {string} filename - Source filename
 */
export function displayResult(result, filename) {
  const riskScore = result.overallRiskScore ?? result.overall_risk_score ?? null;
  const redFlags = result.redFlags ?? result.red_flags ?? [];
  const rawResults = result.results ?? result.consolidated_results ?? [];
  const missingClauses = result.missingClauses ?? result.missing_clauses ?? [];

  // Normalize results: may be an array or an object keyed by category
  const results = Array.isArray(rawResults)
    ? rawResults
    : Object.entries(rawResults).map(([key, val]) => ({
        category: key,
        ...(typeof val === 'object' && val !== null ? val : { summary: val }),
      }));

  console.log('\n' + separator('═', 60));
  console.log(`${BOLD}${CYAN}  SaaS Contract Analysis Report${RESET}`);
  console.log(separator('═', 60));
  console.log(`  ${DIM}File:${RESET} ${filename}`);
  console.log(`  ${DIM}Date:${RESET} ${new Date().toLocaleString()}`);
  console.log(`  ${DIM}Overall Risk:${RESET} ${riskScoreBadge(riskScore)}`);
  console.log(separator());

  // Red Flags
  if (redFlags.length > 0) {
    console.log(`\n${RED}${BOLD}  ⚠ RED FLAGS (${redFlags.length})${RESET}\n`);
    for (const flag of redFlags) {
      if (typeof flag === 'string') {
        console.log(`  ${RED}•${RESET} ${flag}`);
      } else {
        const clause = flag.clause ?? flag.clause_name ?? '';
        const desc = flag.description ?? flag.issue ?? flag.risk ?? '';
        const impact = flag.impact ?? '';
        const sev = flag.severity ?? flag.risk_level ?? '';
        const cat = flag.category ?? '';
        const title = clause || desc || JSON.stringify(flag);
        console.log(`  ${RED}•${RESET} ${BOLD}${title}${RESET}`);
        if (desc && clause) console.log(`    ${desc}`);
        if (impact) console.log(`    ${DIM}Impact: ${impact}${RESET}`);
        if (sev || cat) {
          console.log(`    ${DIM}${cat ? `Category: ${cat}` : ''}${sev ? ` | Severity: ${sev}` : ''}${RESET}`);
        }
      }
    }
    console.log(separator());
  }

  // Missing Clauses
  if (missingClauses.length > 0) {
    console.log(`\n${YELLOW}${BOLD}  ⊘ MISSING CLAUSES (${missingClauses.length})${RESET}\n`);
    for (const clause of missingClauses) {
      const text = typeof clause === 'string' ? clause : (clause.clause ?? clause.name ?? JSON.stringify(clause));
      console.log(`  ${YELLOW}•${RESET} ${text}`);
    }
    console.log(separator());
  }

  // Category Extractions
  if (results.length > 0) {
    console.log(`\n${BOLD}${BLUE}  📋 EXTRACTION RESULTS BY CATEGORY${RESET}\n`);
    for (const extraction of results) {
      const category = extraction.category ?? 'Unknown';
      const items = extraction.items ?? extraction.items_found ?? [];
      const confidence = extraction.confidence ?? extraction.confidence_score ?? null;

      const confStr = confidence != null && !isNaN(Number(confidence))
        ? ` ${DIM}(confidence: ${(Number(confidence) * (confidence > 1 ? 1 : 100)).toFixed(0)}%)${RESET}`
        : '';
      console.log(`  ${MAGENTA}${BOLD}${category}${RESET}${confStr}`);
      console.log(`  ${DIM}${'─'.repeat(category.length + 10)}${RESET}`);

      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          const name = item.clause_name ?? item.clauseName ?? item.name ?? 'Unnamed';
          const summary = item.summary ?? item.description ?? '';
          const risk = item.risk_level ?? item.riskLevel ?? '';
          const quote = item.verbatim_quote ?? item.quote ?? item.verbatimQuote ?? '';

          console.log(`    ${BOLD}${name}${RESET} ${risk ? `[${riskColor(risk)}${risk}${RESET}]` : ''}`);
          if (summary) console.log(`      ${summary}`);
          if (quote) console.log(`      ${DIM}"${quote.slice(0, 120)}${quote.length > 120 ? '...' : ''}"${RESET}`);
        }
      } else {
        // Object-format summary (validator consolidated results)
        const fields = Object.entries(extraction).filter(([k]) => k !== 'category');
        if (fields.length > 0) {
          for (const [key, val] of fields) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const value = typeof val === 'object' ? JSON.stringify(val) : String(val ?? 'Not specified');
            console.log(`    ${BOLD}${label}:${RESET} ${value}`);
          }
        } else {
          console.log(`    ${DIM}No items extracted${RESET}`);
        }
      }
      console.log('');
    }
  }

  console.log(separator('═', 60));
  console.log(`${DIM}  Analysis complete. Results stored in contracts.db${RESET}\n`);
}

/**
 * Display a spinner-like progress indicator for streaming.
 * @param {string} message
 */
export function progress(message) {
  process.stdout.write(`${DIM}  ◦ ${message}${RESET}\n`);
}

/**
 * Display a success message.
 * @param {string} message
 */
export function success(message) {
  console.log(`${GREEN}  ✓ ${message}${RESET}`);
}

/**
 * Display an error message.
 * @param {string} message
 */
export function error(message) {
  console.error(`${RED}  ✗ ${message}${RESET}`);
}
