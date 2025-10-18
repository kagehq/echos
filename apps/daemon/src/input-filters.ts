/**
 * Input Filter System for Echos
 * 
 * Provides content sanitization, validation, and classification
 * to prevent sensitive data from entering agent conversations.
 * 
 * Key Features:
 * - PII Detection & Redaction
 * - Content Classification (personal vs business)
 * - Input Validation (malformed data, injection attempts)
 * - DSR Compliance (GDPR, CCPA data handling)
 */

export type InputFilterRule = {
  name: string;
  pattern: RegExp;
  action: 'redact' | 'block' | 'warn' | 'classify';
  replacement?: string;
  category?: 'pii' | 'sensitive' | 'malformed' | 'injection';
  severity: 'low' | 'medium' | 'high' | 'critical';
};

export type InputFilterResult = {
  allowed: boolean;
  sanitized: string;
  warnings: string[];
  classifications: string[];
  redactions: Array<{
    pattern: string;
    position: number;
    length: number;
    category: string;
  }>;
};

export type InputFilterPolicy = {
  rules: InputFilterRule[];
  defaultAction: 'allow' | 'block' | 'sanitize';
  strictMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

// Common PII patterns
const PII_PATTERNS: InputFilterRule[] = [
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    action: 'redact',
    replacement: '[EMAIL_REDACTED]',
    category: 'pii',
    severity: 'high'
  },
  {
    name: 'phone',
    pattern: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    action: 'redact',
    replacement: '[PHONE_REDACTED]',
    category: 'pii',
    severity: 'high'
  },
  {
    name: 'ssn',
    pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
    action: 'redact',
    replacement: '[SSN_REDACTED]',
    category: 'pii',
    severity: 'critical'
  },
  {
    name: 'credit_card',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    action: 'redact',
    replacement: '[CARD_REDACTED]',
    category: 'pii',
    severity: 'critical'
  },
  {
    name: 'ip_address',
    pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
    action: 'redact',
    replacement: '[IP_REDACTED]',
    category: 'pii',
    severity: 'medium'
  }
];

// Content classification patterns
const CLASSIFICATION_PATTERNS: InputFilterRule[] = [
  {
    name: 'personal_health',
    pattern: /\b(?:medical|health|diagnosis|treatment|symptoms|medication|doctor|hospital)\b/gi,
    action: 'classify',
    category: 'sensitive',
    severity: 'high'
  },
  {
    name: 'financial_data',
    pattern: /\b(?:salary|income|debt|loan|mortgage|bank|account|balance|investment)\b/gi,
    action: 'classify',
    category: 'sensitive',
    severity: 'high'
  },
  {
    name: 'legal_content',
    pattern: /\b(?:lawsuit|legal|court|attorney|lawyer|settlement|contract|agreement)\b/gi,
    action: 'classify',
    category: 'sensitive',
    severity: 'medium'
  }
];

// Injection attack patterns
const INJECTION_PATTERNS: InputFilterRule[] = [
  {
    name: 'sql_injection',
    pattern: /(?:union|select|insert|update|delete|drop|create|alter|exec|execute)\s+.*(?:from|into|where|set|values)/gi,
    action: 'block',
    category: 'injection',
    severity: 'critical'
  },
  {
    name: 'xss_attempt',
    pattern: /<script[^>]*>.*?<\/script>/gi,
    action: 'block',
    category: 'injection',
    severity: 'critical'
  },
  {
    name: 'command_injection',
    pattern: /[;&|`$(){}[\]]/g,
    action: 'warn',
    category: 'injection',
    severity: 'medium'
  }
];

// Malformed data patterns
const VALIDATION_PATTERNS: InputFilterRule[] = [
  {
    name: 'excessive_length',
    pattern: /.{10000,}/g,
    action: 'warn',
    category: 'malformed',
    severity: 'medium'
  },
  {
    name: 'binary_data',
    pattern: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g,
    action: 'block',
    category: 'malformed',
    severity: 'high'
  }
];

// Default input filter policies
export const INPUT_FILTER_POLICIES = {
  // Strict policy for sensitive environments
  strict: {
    rules: [...PII_PATTERNS, ...CLASSIFICATION_PATTERNS, ...INJECTION_PATTERNS, ...VALIDATION_PATTERNS],
    defaultAction: 'sanitize' as const,
    strictMode: true,
    logLevel: 'warn' as const
  },
  
  // Balanced policy for most use cases
  balanced: {
    rules: [...PII_PATTERNS, ...INJECTION_PATTERNS],
    defaultAction: 'allow' as const,
    strictMode: false,
    logLevel: 'info' as const
  },
  
  // Minimal policy for development
  permissive: {
    rules: [...INJECTION_PATTERNS],
    defaultAction: 'allow' as const,
    strictMode: false,
    logLevel: 'debug' as const
  }
};

/**
 * Apply input filtering to content
 */
export function filterInput(
  content: string, 
  policy: InputFilterPolicy = INPUT_FILTER_POLICIES.balanced
): InputFilterResult {
  let sanitized = content;
  const warnings: string[] = [];
  const classifications: string[] = [];
  const redactions: Array<{
    pattern: string;
    position: number;
    length: number;
    category: string;
  }> = [];

  let allowed = true;

  // Apply each rule in the policy
  for (const rule of policy.rules) {
    const matches = [...content.matchAll(rule.pattern)];
    
    if (matches.length > 0) {
      // Log based on severity and log level
      const shouldLog = shouldLogRule(rule, policy.logLevel);
      if (shouldLog) {
        console.log(`[INPUT_FILTER] ${rule.name}: ${matches.length} matches (${rule.severity})`);
      }

      // Handle based on action
      switch (rule.action) {
        case 'redact':
          for (const match of matches) {
            if (match.index !== undefined) {
              redactions.push({
                pattern: rule.name,
                position: match.index,
                length: match[0].length,
                category: rule.category || 'unknown'
              });
            }
          }
          sanitized = sanitized.replace(rule.pattern, rule.replacement || '[REDACTED]');
          break;

        case 'block':
          allowed = false;
          warnings.push(`Content blocked by rule: ${rule.name}`);
          break;

        case 'warn':
          warnings.push(`Content flagged by rule: ${rule.name} (${rule.severity})`);
          break;

        case 'classify':
          classifications.push(rule.category || rule.name);
          break;
      }

      // In strict mode, any high/critical severity blocks the content
      if (policy.strictMode && (rule.severity === 'high' || rule.severity === 'critical')) {
        if (rule.action !== 'redact') {
          allowed = false;
        }
      }
    }
  }

  // Apply default action if no rules matched
  if (policy.defaultAction === 'block' && allowed) {
    allowed = false;
    warnings.push('Content blocked by default policy');
  } else if (policy.defaultAction === 'sanitize' && allowed) {
    // Apply basic sanitization
    sanitized = sanitized
      .replace(/[<>]/g, '') // Remove potential HTML
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  return {
    allowed,
    sanitized,
    warnings,
    classifications,
    redactions
  };
}

/**
 * Check if a rule should be logged based on severity and log level
 */
function shouldLogRule(rule: InputFilterRule, logLevel: string): boolean {
  const severityLevels = { debug: 0, info: 1, warn: 2, error: 3 };
  const ruleLevels = { low: 1, medium: 2, high: 3, critical: 4 };
  
  return ruleLevels[rule.severity] >= severityLevels[logLevel];
}

/**
 * Create a custom input filter policy
 */
export function createInputFilterPolicy(
  rules: InputFilterRule[],
  options: {
    defaultAction?: 'allow' | 'block' | 'sanitize';
    strictMode?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  } = {}
): InputFilterPolicy {
  return {
    rules,
    defaultAction: options.defaultAction || 'allow',
    strictMode: options.strictMode || false,
    logLevel: options.logLevel || 'info'
  };
}

/**
 * Test input filtering (for dev tools)
 */
export function testInputFilter(
  content: string,
  policy: InputFilterPolicy
): InputFilterResult {
  return filterInput(content, policy);
}
