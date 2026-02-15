import type { ZodIssue } from 'zod';
import { designPackageDataV2Schema, type DesignPackageDataV2 } from './schema';
import {
  auditDesignPackageQuality,
  type QualityAuditResult,
} from './quality-audit';

export type VerificationSeverity = 'error' | 'warning';
export type VerificationIssueSource = 'schema' | 'invariant' | 'quality' | 'ai_review';

export interface VerificationIssue {
  id: string;
  severity: VerificationSeverity;
  path: string;
  message: string;
  source: VerificationIssueSource;
  attempt: number;
  recoverable: boolean;
}

export type VerificationStatus = 'passed' | 'repairable' | 'degraded';

export interface SelfVerificationResult {
  status: VerificationStatus;
  issues: VerificationIssue[];
  invariantsPassed: boolean;
  qualityAudit: QualityAuditResult;
  score: number;
}

function zodIssueToVerificationIssue(issue: ZodIssue, attempt: number): VerificationIssue {
  return {
    id: `schema-${issue.code}-${issue.path.join('.') || 'root'}`,
    severity: 'error',
    path: issue.path.join('.') || '$',
    message: issue.message,
    source: 'schema',
    attempt,
    recoverable: true,
  };
}

function qualityIssueToVerificationIssue(args: {
  id: string;
  detail: string;
  passed: boolean;
  attempt: number;
  isHard: boolean;
}): VerificationIssue {
  return {
    id: args.id,
    severity: args.isHard ? 'error' : 'warning',
    path: '$.generation',
    message: args.detail,
    source: 'quality',
    attempt: args.attempt,
    recoverable: !args.passed,
  };
}

export function verifyDesignPackageCandidate(args: {
  packageData: unknown;
  attempt: number;
  maxAttempts: number;
  minimumScore: number;
  strictQualityGate?: boolean;
}): SelfVerificationResult {
  const issues: VerificationIssue[] = [];

  const parsed = designPackageDataV2Schema.safeParse(args.packageData);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map((issue) => zodIssueToVerificationIssue(issue, args.attempt)));

    const degraded = args.attempt >= args.maxAttempts;
    return {
      status: degraded ? 'degraded' : 'repairable',
      issues,
      invariantsPassed: false,
      qualityAudit: {
        overallScore: 0,
        checks: [],
        failedChecks: ['schema-invalid'],
        failedHardChecks: ['schema-invalid'],
      },
      score: 0,
    };
  }

  const data: DesignPackageDataV2 = parsed.data;
  const qualityAudit = auditDesignPackageQuality(data);
  const strictQualityGate = args.strictQualityGate ?? false;

  for (const check of qualityAudit.checks) {
    if (check.passed) continue;
    issues.push(
      qualityIssueToVerificationIssue({
        id: check.id,
        detail: `${check.label}: ${check.detail}`,
        passed: check.passed,
        attempt: args.attempt,
        isHard: strictQualityGate && qualityAudit.failedHardChecks.includes(check.id),
      })
    );
  }

  const invariantsPassed = true;

  if (!strictQualityGate) {
    return {
      status: 'passed',
      issues,
      invariantsPassed: true,
      qualityAudit,
      score: qualityAudit.overallScore,
    };
  }

  const invariantsHardPassed = qualityAudit.failedHardChecks.length === 0;
  const scorePassed = qualityAudit.overallScore >= args.minimumScore;

  if (invariantsHardPassed && scorePassed) {
    return {
      status: 'passed',
      issues,
      invariantsPassed: true,
      qualityAudit,
      score: qualityAudit.overallScore,
    };
  }

  return {
    status: args.attempt >= args.maxAttempts ? 'degraded' : 'repairable',
    issues,
    invariantsPassed: invariantsHardPassed,
    qualityAudit,
    score: qualityAudit.overallScore,
  };
}
