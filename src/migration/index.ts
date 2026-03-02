export {
  DEPRECATION_RULES,
  getEffectiveSeverity,
  getRulesByCategory,
  getAutoFixableRules,
  getRuleById,
  getActiveRules,
  type DeprecationRule,
  type DeprecationSeverity,
} from './deprecation-rules.js';

export {
  DeprecationDetector,
  type DeprecationMatch,
  type DeprecationReport,
  type DetectorOptions,
} from './detector.js';

export {
  ThrottleMonitor,
  type ThrottleLimit,
  type ThrottleSnapshot,
  type ThrottleStatus,
  type ThrottleMonitorEvents,
  type ThrottleMonitorConfig,
} from './throttle-monitor.js';
