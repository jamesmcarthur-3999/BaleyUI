import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'contracts.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
      overall_risk_score REAL,
      red_flag_count INTEGER DEFAULT 0,
      raw_results TEXT
    );

    CREATE TABLE IF NOT EXISTS extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id),
      category TEXT NOT NULL,
      items_json TEXT,
      confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS red_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id),
      category TEXT,
      description TEXT NOT NULL,
      severity TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Store a complete analysis result.
 * @param {object} params
 * @param {string} params.filename
 * @param {object} params.result - The parsed execution result output
 * @returns {number} The contract ID
 */
export function storeAnalysis({ filename, result }) {
  const d = getDb();

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

  const insertContract = d.prepare(`
    INSERT INTO contracts (filename, overall_risk_score, red_flag_count, raw_results)
    VALUES (?, ?, ?, ?)
  `);

  const insertExtraction = d.prepare(`
    INSERT INTO extractions (contract_id, category, items_json, confidence)
    VALUES (?, ?, ?, ?)
  `);

  const insertRedFlag = d.prepare(`
    INSERT INTO red_flags (contract_id, category, description, severity)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = d.transaction(() => {
    const { lastInsertRowid: contractId } = insertContract.run(
      filename,
      riskScore,
      redFlags.length,
      JSON.stringify(result)
    );

    // Store extractions from consolidated results
    for (const extraction of results) {
      const category = extraction.category ?? 'Unknown';
      const items = extraction.items ?? extraction.items_found ?? null;
      const confidence = extraction.confidence ?? extraction.confidence_score ?? null;
      // Store either the items array or the full extraction object as JSON
      const itemsJson = Array.isArray(items) ? JSON.stringify(items) : JSON.stringify(extraction);
      insertExtraction.run(contractId, category, itemsJson, confidence);
    }

    // Store red flags
    for (const flag of redFlags) {
      const category = typeof flag === 'string' ? null : (flag.category ?? null);
      const description = typeof flag === 'string' ? flag : (flag.description ?? flag.issue ?? JSON.stringify(flag));
      const severity = typeof flag === 'string' ? null : (flag.severity ?? flag.risk_level ?? null);
      insertRedFlag.run(contractId, category, description, severity);
    }

    return Number(contractId);
  });

  return transaction();
}

/**
 * List past analyses.
 * @param {number} [limit=10]
 * @returns {Array<object>}
 */
export function listAnalyses(limit = 10) {
  const d = getDb();
  return d.prepare(`
    SELECT id, filename, analyzed_at, overall_risk_score, red_flag_count
    FROM contracts
    ORDER BY analyzed_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get full analysis by contract ID.
 * @param {number} id
 * @returns {object|null}
 */
export function getAnalysis(id) {
  const d = getDb();
  const contract = d.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) return null;

  const extractions = d.prepare('SELECT * FROM extractions WHERE contract_id = ?').all(id);
  const flags = d.prepare('SELECT * FROM red_flags WHERE contract_id = ?').all(id);

  return { ...contract, extractions, redFlags: flags };
}
