import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { DeprecationDetector } from '../../../src/migration/detector.js';

const FIXTURES_DIR = join(__dirname, '../../fixtures/deprecated-code-samples');
const BALANCE_FIXTURE = join(FIXTURES_DIR, 'balance-query.ts');
const RECORD_FIXTURE = join(FIXTURES_DIR, 'record-file-usage.ts');

// Use a reference date before removedAt so severity stays at base level
const REF_DATE = new Date('2026-06-01');

function createDetector(overrides?: Record<string, unknown>) {
  return new DeprecationDetector({
    referenceDate: REF_DATE,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// scanCode — inline source detection
// ---------------------------------------------------------------------------

describe('DeprecationDetector.scanCode()', () => {
  it('detects new AccountBalanceQuery() → HIERO-001', () => {
    const detector = createDetector();
    const report = detector.scanCode('const q = new AccountBalanceQuery();');

    expect(report.totalMatches).toBeGreaterThanOrEqual(1);
    const match = report.matches.find((m) => m.rule.id === 'HIERO-001');
    expect(match).toBeDefined();
    expect(match!.matchedText).toContain('AccountBalanceQuery');
  });

  it('detects new TokenInfoQuery() → HIERO-010', () => {
    const detector = createDetector();
    const report = detector.scanCode('await new TokenInfoQuery().setTokenId(id).execute(client);');

    const match = report.matches.find((m) => m.rule.id === 'HIERO-010');
    expect(match).toBeDefined();
  });

  it('detects RecordFile → HIERO-030', () => {
    const detector = createDetector();
    const report = detector.scanCode('import { RecordFile } from "./parser";');

    const match = report.matches.find((m) => m.rule.id === 'HIERO-030');
    expect(match).toBeDefined();
    expect(match!.matchedText).toBe('RecordFile');
  });

  it('returns empty report for clean code', () => {
    const detector = createDetector();
    const report = detector.scanCode(`
      function add(a: number, b: number) {
        return a + b;
      }
    `);

    expect(report.totalMatches).toBe(0);
    expect(report.matches).toEqual([]);
    expect(report.filesScanned).toBe(1);
  });

  it('reports correct line and column numbers', () => {
    const detector = createDetector({ ruleIds: ['HIERO-001'] });
    const source = [
      '// line 1: clean',
      '// line 2: clean',
      'const q = new AccountBalanceQuery();',
    ].join('\n');

    const report = detector.scanCode(source);
    expect(report.totalMatches).toBe(1);

    const match = report.matches[0];
    expect(match.line).toBe(3);
    expect(match.column).toBeGreaterThan(0);
  });

  it('multiple matches on the same line are all reported', () => {
    const detector = createDetector({ ruleIds: ['HIERO-030'] });
    // RecordFile appears twice on the same line
    const report = detector.scanCode('const a = RecordFile; const b = RecordFile;');

    expect(report.totalMatches).toBe(2);
    expect(report.matches[0].line).toBe(1);
    expect(report.matches[1].line).toBe(1);
    expect(report.matches[0].column).not.toBe(report.matches[1].column);
  });

  it('report counts match actual match count per severity', () => {
    const detector = createDetector();
    const source = [
      'new AccountBalanceQuery();',  // HIERO-001: warning
      'RecordFile.parse();',          // HIERO-030: error (past removedAt 2026-06-01)
    ].join('\n');

    const report = detector.scanCode(source);
    const totalFromCounts = report.counts.info + report.counts.warning + report.counts.error;
    expect(totalFromCounts).toBe(report.totalMatches);
  });
});

// ---------------------------------------------------------------------------
// scanCode — filtering options
// ---------------------------------------------------------------------------

describe('DeprecationDetector — filtering', () => {
  it('minSeverity: "warning" filters out info-level matches', () => {
    const detector = createDetector({ minSeverity: 'warning' });
    // HIERO-005 (ContractCallQuery) has severity: 'info'
    const report = detector.scanCode('new ContractCallQuery();');

    const infoMatch = report.matches.find((m) => m.rule.id === 'HIERO-005');
    expect(infoMatch).toBeUndefined();
  });

  it('ruleIds option restricts to specific rules', () => {
    const detector = createDetector({ ruleIds: ['HIERO-001'] });
    const source = [
      'new AccountBalanceQuery();',  // HIERO-001 — should match
      'new AccountInfoQuery();',      // HIERO-002 — should be filtered out
      'RecordFile.parse();',          // HIERO-030 — should be filtered out
    ].join('\n');

    const report = detector.scanCode(source);
    expect(report.totalMatches).toBe(1);
    expect(report.matches[0].rule.id).toBe('HIERO-001');
  });
});

// ---------------------------------------------------------------------------
// scanFile — fixture files
// ---------------------------------------------------------------------------

describe('DeprecationDetector.scanFile()', () => {
  it('scans balance-query fixture and finds expected matches', async () => {
    const detector = createDetector();
    const report = await detector.scanFile(BALANCE_FIXTURE);

    expect(report.filesScanned).toBe(1);
    expect(report.totalMatches).toBeGreaterThanOrEqual(5);

    const ruleIds = new Set(report.matches.map((m) => m.rule.id));
    expect(ruleIds.has('HIERO-001')).toBe(true); // AccountBalanceQuery
    expect(ruleIds.has('HIERO-002')).toBe(true); // AccountInfoQuery
    expect(ruleIds.has('HIERO-003')).toBe(true); // AccountRecordsQuery
    expect(ruleIds.has('HIERO-005')).toBe(true); // ContractCallQuery
  });

  it('scans record-file fixture and finds expected matches', async () => {
    const detector = createDetector();
    const report = await detector.scanFile(RECORD_FIXTURE);

    expect(report.totalMatches).toBeGreaterThanOrEqual(3);

    const ruleIds = new Set(report.matches.map((m) => m.rule.id));
    expect(ruleIds.has('HIERO-030')).toBe(true); // RecordFile
    expect(ruleIds.has('HIERO-031')).toBe(true); // .getRecord()
    expect(ruleIds.has('HIERO-010')).toBe(true); // TokenInfoQuery
  });
});

// ---------------------------------------------------------------------------
// scanDirectory — recursive scan
// ---------------------------------------------------------------------------

describe('DeprecationDetector.scanDirectory()', () => {
  it('recursively finds all matches in fixture dir', async () => {
    const detector = createDetector();
    const report = await detector.scanDirectory(FIXTURES_DIR);

    expect(report.filesScanned).toBe(2);
    expect(report.totalMatches).toBeGreaterThanOrEqual(8);

    const ruleIds = new Set(report.matches.map((m) => m.rule.id));
    // Should find rules from both files
    expect(ruleIds.has('HIERO-001')).toBe(true);
    expect(ruleIds.has('HIERO-030')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

describe('DeprecationDetector.formatReport()', () => {
  it('produces readable output for matches', () => {
    const detector = createDetector();
    const report = detector.scanCode('new AccountBalanceQuery();');
    const output = DeprecationDetector.formatReport(report);

    expect(output).toContain('Deprecation Scan Report');
    expect(output).toContain('HIERO-001');
    expect(output).toContain('AccountBalanceQuery');
    expect(output).toContain('→');
  });

  it('shows clean message for no matches', () => {
    const detector = createDetector();
    const report = detector.scanCode('const x = 1;');
    const output = DeprecationDetector.formatReport(report);

    expect(output).toContain('No deprecated API usage found');
  });

  it('shows auto-fix indicator when available', () => {
    const detector = createDetector({ ruleIds: ['HIERO-001'] });
    const report = detector.scanCode('new AccountBalanceQuery();');
    const output = DeprecationDetector.formatReport(report);

    expect(output).toContain('Auto-fix available');
  });
});
