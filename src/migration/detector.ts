import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import {
  DEPRECATION_RULES,
  getEffectiveSeverity,
  type DeprecationRule,
  type DeprecationSeverity,
} from './deprecation-rules.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeprecationMatch {
  /** The rule that matched. */
  rule: DeprecationRule;
  /** Effective severity at scan time. */
  severity: DeprecationSeverity;
  /** File path where the match was found. */
  file: string;
  /** 1-indexed line number. */
  line: number;
  /** Column offset within the line. */
  column: number;
  /** The matched source text. */
  matchedText: string;
  /** The full line of source code. */
  sourceLine: string;
  /** Suggested replacement. */
  replacement: string;
  /** Whether an auto-fix is available. */
  autoFixAvailable: boolean;
}

export interface DeprecationReport {
  /** Total files scanned. */
  filesScanned: number;
  /** Total matches found. */
  totalMatches: number;
  /** Matches grouped by severity. */
  counts: Record<DeprecationSeverity, number>;
  /** All individual matches. */
  matches: DeprecationMatch[];
  /** Scan timestamp. */
  timestamp: string;
  /** Scan duration in milliseconds. */
  durationMs: number;
}

export interface DetectorOptions {
  /** File extensions to scan. Default: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']. */
  extensions?: string[];
  /** Glob patterns to exclude. Default: ['node_modules', 'dist', '.git']. */
  excludeDirs?: string[];
  /** Only report rules with this severity or higher. */
  minSeverity?: DeprecationSeverity;
  /** Specific rule IDs to check (empty = all rules). */
  ruleIds?: string[];
  /** Reference date for severity calculation. Default: now. */
  referenceDate?: Date;
}

// ---------------------------------------------------------------------------
// Severity ordering
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<DeprecationSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

// ---------------------------------------------------------------------------
// DeprecationDetector
// ---------------------------------------------------------------------------

/**
 * Scans source files for deprecated Hedera API usage and reports
 * matches with suggested replacements. Supports single files,
 * directories, and raw source code strings.
 */
export class DeprecationDetector {
  private readonly options: Required<DetectorOptions>;
  private readonly rules: DeprecationRule[];

  constructor(options?: DetectorOptions) {
    this.options = {
      extensions: options?.extensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      excludeDirs: options?.excludeDirs ?? ['node_modules', 'dist', '.git', 'coverage'],
      minSeverity: options?.minSeverity ?? 'info',
      ruleIds: options?.ruleIds ?? [],
      referenceDate: options?.referenceDate ?? new Date(),
    };

    this.rules = this.resolveRules();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Scan a single file for deprecated API usage. */
  async scanFile(filePath: string): Promise<DeprecationReport> {
    const start = Date.now();
    const source = await readFile(filePath, 'utf-8');
    const matches = this.scanSource(source, filePath);

    return this.buildReport(1, matches, start);
  }

  /** Recursively scan a directory for deprecated API usage. */
  async scanDirectory(dirPath: string): Promise<DeprecationReport> {
    const start = Date.now();
    const files = await this.collectFiles(dirPath);
    const allMatches: DeprecationMatch[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf-8');
      const matches = this.scanSource(source, file);
      allMatches.push(...matches);
    }

    return this.buildReport(files.length, allMatches, start);
  }

  /** Scan a raw source code string. */
  scanCode(source: string, virtualPath = '<inline>'): DeprecationReport {
    const start = Date.now();
    const matches = this.scanSource(source, virtualPath);
    return this.buildReport(1, matches, start);
  }

  /** Format a report as a CLI-friendly table string. */
  static formatReport(report: DeprecationReport): string {
    const lines: string[] = [];

    lines.push(`Deprecation Scan Report`);
    lines.push(`${'─'.repeat(80)}`);
    lines.push(
      `Files scanned: ${report.filesScanned} | ` +
      `Matches: ${report.totalMatches} | ` +
      `Errors: ${report.counts.error} | ` +
      `Warnings: ${report.counts.warning} | ` +
      `Info: ${report.counts.info}`,
    );
    lines.push(`${'─'.repeat(80)}`);

    if (report.matches.length === 0) {
      lines.push('  ✓ No deprecated API usage found.');
      return lines.join('\n');
    }

    // Group by file
    const byFile = new Map<string, DeprecationMatch[]>();
    for (const match of report.matches) {
      const existing = byFile.get(match.file) ?? [];
      existing.push(match);
      byFile.set(match.file, existing);
    }

    for (const [file, matches] of byFile) {
      lines.push(`\n  ${file}`);

      for (const m of matches) {
        const icon = m.severity === 'error' ? '✗' : m.severity === 'warning' ? '⚠' : 'ℹ';
        const sev = m.severity.toUpperCase().padEnd(7);
        lines.push(`    ${icon} [${sev}] L${m.line}:${m.column}  ${m.rule.id} — ${m.rule.api}`);
        lines.push(`      ${m.sourceLine.trim()}`);
        lines.push(`      → ${m.replacement}`);
        if (m.autoFixAvailable) {
          lines.push(`      ⚡ Auto-fix available`);
        }
      }
    }

    lines.push(`\n${'─'.repeat(80)}`);
    lines.push(`Scan completed in ${report.durationMs}ms`);

    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Run all rules against a source string and collect matches. */
  private scanSource(source: string, filePath: string): DeprecationMatch[] {
    const lines = source.split('\n');
    const matches: DeprecationMatch[] = [];

    for (const rule of this.rules) {
      const severity = getEffectiveSeverity(rule, this.options.referenceDate);

      if (SEVERITY_ORDER[severity] < SEVERITY_ORDER[this.options.minSeverity]) {
        continue;
      }

      // Reset regex state for each file
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match: RegExpExecArray | null;

        // Reset for each line
        pattern.lastIndex = 0;

        while ((match = pattern.exec(line)) !== null) {
          matches.push({
            rule,
            severity,
            file: filePath,
            line: i + 1,
            column: match.index + 1,
            matchedText: match[0],
            sourceLine: line,
            replacement: rule.replacement,
            autoFixAvailable: rule.autoFixAvailable,
          });

          // Prevent infinite loops on zero-length matches
          if (match[0].length === 0) {
            pattern.lastIndex++;
          }
        }
      }
    }

    // Sort by line number
    matches.sort((a, b) => a.line - b.line || a.column - b.column);
    return matches;
  }

  /** Recursively collect files matching the allowed extensions. */
  private async collectFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (this.options.excludeDirs.includes(entry.name)) continue;
        const nested = await this.collectFiles(fullPath);
        files.push(...nested);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (this.options.extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /** Filter rules based on detector options. */
  private resolveRules(): DeprecationRule[] {
    if (this.options.ruleIds.length === 0) return DEPRECATION_RULES;
    return DEPRECATION_RULES.filter((r) => this.options.ruleIds.includes(r.id));
  }

  /** Assemble a DeprecationReport from collected matches. */
  private buildReport(
    filesScanned: number,
    matches: DeprecationMatch[],
    startTime: number,
  ): DeprecationReport {
    const counts: Record<DeprecationSeverity, number> = { info: 0, warning: 0, error: 0 };
    for (const m of matches) {
      counts[m.severity]++;
    }

    return {
      filesScanned,
      totalMatches: matches.length,
      counts,
      matches,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }
}
