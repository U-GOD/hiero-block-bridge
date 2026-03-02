import { describe, it, expect } from 'vitest';
import {
  DEPRECATION_RULES,
  getEffectiveSeverity,
  getRulesByCategory,
  getAutoFixableRules,
  getRuleById,
  getActiveRules,
} from '../../../src/migration/deprecation-rules.js';

// ---------------------------------------------------------------------------
// DEPRECATION_RULES array
// ---------------------------------------------------------------------------

describe('DEPRECATION_RULES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEPRECATION_RULES)).toBe(true);
    expect(DEPRECATION_RULES.length).toBeGreaterThan(0);
  });

  it('all rules have unique IDs', () => {
    const ids = DEPRECATION_RULES.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all rules have valid regex patterns', () => {
    for (const rule of DEPRECATION_RULES) {
      expect(rule.pattern).toBeInstanceOf(RegExp);
      // Pattern should not throw when executed
      expect(() => rule.pattern.test('sample code')).not.toThrow();
    }
  });

  it('each rule has all required fields', () => {
    for (const rule of DEPRECATION_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.api).toBeTruthy();
      expect(rule.category).toBeTruthy();
      expect(rule.deprecatedSince).toBeTruthy();
      expect(rule.removedAt).toBeTruthy();
      expect(rule.replacement).toBeTruthy();
      expect(['info', 'warning', 'error']).toContain(rule.severity);
      expect(typeof rule.autoFixAvailable).toBe('boolean');
    }
  });

  it("each rule's pattern matches its API name in sample code", () => {
    // HIERO-001: AccountBalanceQuery
    const rule001 = getRuleById('HIERO-001')!;
    expect(rule001.pattern.test('new AccountBalanceQuery(')).toBe(true);

    // HIERO-002: AccountInfoQuery
    const rule002 = getRuleById('HIERO-002')!;
    rule002.pattern.lastIndex = 0; // reset global regex
    expect(rule002.pattern.test('new AccountInfoQuery(')).toBe(true);

    // HIERO-030: Record file patterns
    const rule030 = getRuleById('HIERO-030')!;
    rule030.pattern.lastIndex = 0;
    expect(rule030.pattern.test('RecordFile')).toBe(true);
    rule030.pattern.lastIndex = 0;
    expect(rule030.pattern.test('file.rcd')).toBe(true);

    // HIERO-031: .getRecord()
    const rule031 = getRuleById('HIERO-031')!;
    rule031.pattern.lastIndex = 0;
    expect(rule031.pattern.test('.getRecord(')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getEffectiveSeverity
// ---------------------------------------------------------------------------

describe('getEffectiveSeverity()', () => {
  it('returns base severity before removedAt date', () => {
    const rule = getRuleById('HIERO-001')!; // removedAt: 2026-07-01, severity: warning
    const beforeRemoval = new Date('2026-06-01');

    expect(getEffectiveSeverity(rule, beforeRemoval)).toBe('warning');
  });

  it('escalates to error after removedAt date', () => {
    const rule = getRuleById('HIERO-001')!; // removedAt: 2026-07-01
    const afterRemoval = new Date('2026-08-01');

    expect(getEffectiveSeverity(rule, afterRemoval)).toBe('error');
  });

  it('escalates to error on exact removedAt date', () => {
    const rule = getRuleById('HIERO-001')!; // removedAt: 2026-07-01
    const exactDate = new Date('2026-07-01');

    expect(getEffectiveSeverity(rule, exactDate)).toBe('error');
  });

  it('info severity stays info before removedAt', () => {
    const rule = getRuleById('HIERO-005')!; // severity: info, removedAt: 2026-08-01
    const before = new Date('2026-06-01');

    expect(getEffectiveSeverity(rule, before)).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// getRulesByCategory
// ---------------------------------------------------------------------------

describe('getRulesByCategory()', () => {
  it('returns only query rules for category "query"', () => {
    const queryRules = getRulesByCategory('query');
    expect(queryRules.length).toBeGreaterThan(0);
    for (const rule of queryRules) {
      expect(rule.category).toBe('query');
    }
  });

  it('returns only token rules for category "token"', () => {
    const tokenRules = getRulesByCategory('token');
    expect(tokenRules.length).toBeGreaterThan(0);
    for (const rule of tokenRules) {
      expect(rule.category).toBe('token');
    }
  });

  it('returns empty array for category with no rules', () => {
    const rules = getRulesByCategory('transaction');
    expect(rules).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAutoFixableRules
// ---------------------------------------------------------------------------

describe('getAutoFixableRules()', () => {
  it('returns only rules with autoFixAvailable: true', () => {
    const fixable = getAutoFixableRules();
    expect(fixable.length).toBeGreaterThan(0);
    for (const rule of fixable) {
      expect(rule.autoFixAvailable).toBe(true);
    }
  });

  it('all returned rules have a fix string', () => {
    const fixable = getAutoFixableRules();
    for (const rule of fixable) {
      expect(rule.fix).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// getRuleById
// ---------------------------------------------------------------------------

describe('getRuleById()', () => {
  it('returns the correct rule for HIERO-001', () => {
    const rule = getRuleById('HIERO-001');
    expect(rule).toBeDefined();
    expect(rule!.api).toBe('AccountBalanceQuery');
    expect(rule!.category).toBe('query');
  });

  it('returns the correct rule for HIERO-030', () => {
    const rule = getRuleById('HIERO-030');
    expect(rule).toBeDefined();
    expect(rule!.api).toContain('Record File');
    expect(rule!.category).toBe('network');
  });

  it('returns undefined for non-existent ID', () => {
    expect(getRuleById('NONEXISTENT')).toBeUndefined();
    expect(getRuleById('HIERO-999')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getActiveRules
// ---------------------------------------------------------------------------

describe('getActiveRules()', () => {
  it('returns rules that have been deprecated by the given date', () => {
    // All rules are deprecated by 2026-06-01
    const active = getActiveRules(new Date('2026-06-01'));
    expect(active.length).toBe(DEPRECATION_RULES.length);
  });

  it('filters out rules not yet deprecated', () => {
    // Before any deprecations (2025-01-01)
    const active = getActiveRules(new Date('2025-01-01'));
    expect(active.length).toBe(0);
  });

  it('includes rules deprecated on the exact date', () => {
    // HIERO-030 deprecated since 2026-01-01
    const active = getActiveRules(new Date('2026-01-01'));
    const ids = active.map((r) => r.id);
    expect(ids).toContain('HIERO-030');
    expect(ids).toContain('HIERO-040');
  });
});
