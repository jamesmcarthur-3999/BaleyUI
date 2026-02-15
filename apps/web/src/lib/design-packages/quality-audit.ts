import { checkContrast } from './css-variables';
import {
  DESIGN_COLOR_KEYS,
  createDefaultGenerationReport,
  generationReportSchema,
  type DesignPackageDataV2,
} from './schema';

export interface QualityAuditCheck {
  id: string;
  label: string;
  passed: boolean;
  score: number;
  detail: string;
}

export interface QualityAuditResult {
  overallScore: number;
  checks: QualityAuditCheck[];
  failedChecks: string[];
  failedHardChecks: string[];
}

function scoreFromBoolean(passed: boolean, passScore = 100, failScore = 55): number {
  return passed ? passScore : failScore;
}

function hasAllColorKeys(data: DesignPackageDataV2): boolean {
  return DESIGN_COLOR_KEYS.every(
    (key) =>
      typeof data.colors.light[key] === 'string' &&
      data.colors.light[key].length > 0 &&
      typeof data.colors.dark[key] === 'string' &&
      data.colors.dark[key].length > 0
  );
}

function wcagCoreChecks(data: DesignPackageDataV2): { passed: boolean; score: number; detail: string } {
  const pairs = [
    ['light foreground/background', data.colors.light.foreground, data.colors.light.background],
    ['light primaryForeground/primary', data.colors.light.primaryForeground, data.colors.light.primary],
    ['dark foreground/background', data.colors.dark.foreground, data.colors.dark.background],
    ['dark primaryForeground/primary', data.colors.dark.primaryForeground, data.colors.dark.primary],
  ] as const;

  const evaluations = pairs.map(([label, fg, bg]) => {
    const check = checkContrast(fg, bg);
    return {
      label,
      ratio: check.ratio,
      passed: check.passesAA,
    };
  });
  const passes = evaluations.filter((item) => item.passed).length;
  const score = Math.round((passes / evaluations.length) * 100);
  const detail = evaluations
    .map((item) => `${item.label}: ${item.ratio}:1`)
    .join('; ');
  return {
    passed: passes === evaluations.length,
    score,
    detail,
  };
}

export function auditDesignPackageQuality(data: DesignPackageDataV2): QualityAuditResult {
  const wcag = wcagCoreChecks(data);
  const checks: QualityAuditCheck[] = [
    {
      id: 'wcag-core',
      label: 'Core WCAG contrast pairs',
      passed: wcag.passed,
      score: wcag.score,
      detail: wcag.detail,
    },
    {
      id: 'token-completeness',
      label: 'Semantic color token completeness',
      passed: hasAllColorKeys(data),
      score: scoreFromBoolean(hasAllColorKeys(data), 100, 20),
      detail: hasAllColorKeys(data)
        ? 'All required semantic color keys exist in both light and dark palettes'
        : 'One or more required semantic color keys are missing',
    },
    {
      id: 'system-completeness',
      label: 'Foundation, motion, and layout completeness',
      passed: Boolean(data.foundation && data.motionSystem && data.layoutSystem),
      score: scoreFromBoolean(Boolean(data.foundation && data.motionSystem && data.layoutSystem), 100, 20),
      detail: data.foundation && data.motionSystem && data.layoutSystem
        ? 'Core V2.5 systems are present'
        : 'One or more core V2.5 systems are missing',
    },
    {
      id: 'blueprint-completeness',
      label: 'Three-surface blueprint completeness',
      passed: Boolean(
        data.surfaceBlueprints?.landing &&
        data.surfaceBlueprints?.customerApp &&
        data.surfaceBlueprints?.internalApp
      ),
      score: scoreFromBoolean(
        Boolean(
          data.surfaceBlueprints?.landing &&
          data.surfaceBlueprints?.customerApp &&
          data.surfaceBlueprints?.internalApp
        ),
        100,
        20
      ),
      detail: data.surfaceBlueprints?.landing &&
        data.surfaceBlueprints?.customerApp &&
        data.surfaceBlueprints?.internalApp
        ? 'All three surface blueprints are present'
        : 'One or more surface blueprints are missing',
    },
  ];

  const overallScore = Math.round(
    checks.reduce((sum, check) => sum + check.score, 0) / checks.length
  );
  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.id);
  const hardChecks = new Set(['token-completeness', 'system-completeness', 'blueprint-completeness']);
  const failedHardChecks = checks
    .filter((check) => !check.passed && hardChecks.has(check.id))
    .map((check) => check.id);

  return {
    overallScore,
    checks,
    failedChecks,
    failedHardChecks,
  };
}

export function passesQualityGate(
  result: QualityAuditResult,
  minimumScore = 82
): boolean {
  if (result.failedHardChecks.length > 0) return false;

  if (result.overallScore >= minimumScore) return true;

  // Allow near-threshold scores when only advisory checks failed.
  return (
    result.overallScore >= Math.max(minimumScore - 6, 70) &&
    result.failedChecks.every((check) => !result.failedHardChecks.includes(check))
  );
}

export function buildGenerationReport(args: {
  selectedConceptId: string;
  selectedConceptTitle: string;
  conceptScores: Array<{
    id: string;
    title: string;
    score: number;
    rationale: string;
  }>;
  qualityAudit: QualityAuditResult;
  repairAttempts: number;
  repairApplied: boolean;
  verificationStatus?: 'passed' | 'repaired' | 'degraded';
  verificationIssues?: Array<{
    id: string;
    severity: 'error' | 'warning';
    path: string;
    message: string;
    source: 'schema' | 'invariant' | 'quality' | 'ai_review';
    attempt: number;
    recoverable: boolean;
  }>;
  repairTrace?: Array<{
    attempt: number;
    source: 'generator' | 'refiner' | 'fallback';
    status: 'applied' | 'skipped' | 'failed';
    issueCount: number;
    message: string;
  }>;
  orchestrationRunId?: string;
  taskSummary?: Array<{
    taskId: string;
    assignedBot: string;
    expectedArtifact?: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    attempt: number;
    depth: number;
    durationMs?: number;
    error?: string;
  }>;
  degradedReasons?: string[];
  replanTrace?: Array<{
    step: string;
    reason: string;
    action: string;
    timestamp: number;
  }>;
}): DesignPackageDataV2['generationReport'] {
  return generationReportSchema.parse(
    createDefaultGenerationReport({
      selectedConceptId: args.selectedConceptId,
      overallScore: args.qualityAudit.overallScore,
      repairAttempts: args.repairAttempts,
      repairApplied: args.repairApplied,
      failedChecks: args.qualityAudit.failedChecks,
      qualityChecks: args.qualityAudit.checks,
      verificationStatus: args.verificationStatus,
      verificationIssues: args.verificationIssues,
      repairTrace: args.repairTrace,
      orchestrationRunId: args.orchestrationRunId,
      taskSummary: args.taskSummary,
      degradedReasons: args.degradedReasons,
      replanTrace: args.replanTrace,
      conceptScores:
        args.conceptScores.length > 0
          ? args.conceptScores
          : [
              {
                id: args.selectedConceptId,
                title: args.selectedConceptTitle,
                score: args.qualityAudit.overallScore,
                rationale: 'Selected as the highest quality concept',
              },
            ],
    })
  );
}
