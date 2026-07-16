// ============================================================
// ⚖️ Compliance Manager — Platform rules, source respect, DOS protection
// ============================================================

const fs = require('fs');
const path = require('path');

class ComplianceManager {
  constructor() {
    // Platform rules per source
    this.sourceRules = new Map();
    // DOS protection: track rapid requests per IP/source
    this.dosTracker = new Map();
    // Human-in-the-loop pending actions
    this.pendingApprovals = new Map();
    // Compliance violations log
    this.violations = [];
    this.violationsFile = path.join(__dirname, 'compliance-violations.json');

    this._loadViolations();
    this._initRules();
  }

  _initRules() {
    // Himalayas
    this.setSourceRule('himalayas', {
      maxRequestsPerMinute: 10,
      respectRobotsTxt: true,
      userAgentRequired: true,
      notes: 'Free API, rate limit 10 req/min',
    });
    // RemoteOK
    this.setSourceRule('remoteok', {
      maxRequestsPerMinute: 5,
      respectRobotsTxt: true,
      userAgentRequired: true,
      requireAttribution: true,
      notes: 'API data, cache for 30 min',
    });
    // Remotive
    this.setSourceRule('remotive', {
      maxRequestsPerMinute: 10,
      respectRobotsTxt: true,
      userAgentRequired: true,
      notes: 'Free API, reasonable use',
    });
    // Jobicy
    this.setSourceRule('jobicy', {
      maxRequestsPerMinute: 15,
      respectRobotsTxt: true,
      notes: 'Free API v2',
    });
    // Arbeitnow
    this.setSourceRule('arbeitnow', {
      maxRequestsPerMinute: 10,
      respectRobotsTxt: true,
      notes: 'Free API',
    });
    // Findwork
    this.setSourceRule('findwork', {
      maxRequestsPerMinute: 20,
      respectRobotsTxt: true,
      apiKeyRequired: true,
      notes: 'API key from findwork.dev',
    });
    // LinkedIn (via MCP)
    this.setSourceRule('linkedin', {
      maxRequestsPerMinute: 3,
      respectRobotsTxt: true,
      userAgentRequired: true,
      requireAuth: true,
      notes: 'Heavy scraping violates ToS. Use only via MCP/API.',
      restrictedAction: true, // Requires admin approval or special mode
    });
    // Indeed (via MCP)
    this.setSourceRule('indeed', {
      maxRequestsPerMinute: 3,
      respectRobotsTxt: true,
      userAgentRequired: true,
      requireAuth: true,
      notes: 'Indeed actively blocks scrapers. Use JobSpy MCP carefully.',
      restrictedAction: true,
    });
  }

  /**
   * Set a source rule
   */
  setSourceRule(source, rule) {
    this.sourceRules.set(source, {
      maxRequestsPerMinute: 10,
      respectRobotsTxt: true,
      userAgentRequired: false,
      requireAttribution: false,
      apiKeyRequired: false,
      requireAuth: false,
      restrictedAction: false,
      notes: '',
      ...rule,
    });
  }

  /**
   * Check if an action is allowed against a source
   */
  checkSourceAction(source) {
    const rule = this.sourceRules.get(source);
    if (!rule) return { allowed: true, warning: null };

    const warnings = [];
    if (rule.restrictedAction) {
      warnings.push(`⚠️ ${source} scraping may violate ToS. Use with caution.`);
    }
    if (rule.apiKeyRequired && !process.env.FINDWORK_API_KEY) {
      warnings.push(`⚠️ ${source} requires API key`);
    }

    return {
      allowed: !rule.restrictedAction,
      warnings,
      rule,
    };
  }

  /**
   * DOS protection: detect rapid requests
   */
  checkDOS(source, intervalMs = 1000, maxPerInterval = 3) {
    const key = `${source}`;
    const now = Date.now();

    if (!this.dosTracker.has(key)) {
      this.dosTracker.set(key, []);
    }

    const timestamps = this.dosTracker.get(key);
    // Remove old entries
    const recent = timestamps.filter(t => now - t < intervalMs);
    this.dosTracker.set(key, recent);

    if (recent.length >= maxPerInterval) {
      this._logViolation('DOS', `Rapid requests to ${source}: ${recent.length} in ${intervalMs}ms`);
      return { detected: true, count: recent.length, waitMs: intervalMs - (now - recent[0]) };
    }

    recent.push(now);
    this.dosTracker.set(key, recent);
    return { detected: false, count: recent.length, waitMs: 0 };
  }

  /**
   * Log a compliance violation
   */
  _logViolation(type, detail) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      detail,
    };
    this.violations.push(entry);
    if (this.violations.length > 500) {
      this.violations = this.violations.slice(-500);
    }
    this._saveViolations();
    console.warn(`⚖️ Compliance [${type}]: ${detail}`);
  }

  _loadViolations() {
    try {
      if (fs.existsSync(this.violationsFile)) {
        this.violations = JSON.parse(fs.readFileSync(this.violationsFile, 'utf8'));
      }
    } catch {}
  }

  _saveViolations() {
    try {
      fs.writeFileSync(this.violationsFile, JSON.stringify(this.violations.slice(-100), null, 2));
    } catch {}
  }

  // ─── Human-in-the-loop Approval ───

  /**
   * Request human approval for an action
   */
  requestApproval(actionId, action, data, requires = ['admin']) {
    this.pendingApprovals.set(actionId, {
      id: actionId,
      action,
      data,
      requires,
      status: 'pending',
      createdAt: Date.now(),
      approvedBy: null,
      approvedAt: null,
      notes: '',
    });
    return actionId;
  }

  /**
   * Approve a pending action
   */
  approveAction(actionId, userId, notes = '') {
    const pending = this.pendingApprovals.get(actionId);
    if (!pending) throw new Error(`No pending approval: ${actionId}`);
    if (pending.status !== 'pending') throw new Error(`Action ${actionId} already ${pending.status}`);

    pending.status = 'approved';
    pending.approvedBy = String(userId);
    pending.approvedAt = Date.now();
    pending.notes = notes;

    this._logViolation('APPROVE', `Action ${actionId} approved by ${userId}: ${pending.action}`);
    return pending;
  }

  /**
   * Reject a pending action
   */
  rejectAction(actionId, userId, reason = '') {
    const pending = this.pendingApprovals.get(actionId);
    if (!pending) throw new Error(`No pending approval: ${actionId}`);

    pending.status = 'rejected';
    pending.approvedBy = String(userId);
    pending.approvedAt = Date.now();
    pending.notes = reason;

    this._logViolation('REJECT', `Action ${actionId} rejected by ${userId}: ${reason}`);
    return pending;
  }

  /**
   * Get all pending approvals
   */
  getPendingApprovals() {
    const pending = [];
    for (const [, p] of this.pendingApprovals) {
      if (p.status === 'pending') {
        pending.push(p);
      }
    }
    // Clean up old pending (> 30 min)
    const now = Date.now();
    for (const [id, p] of this.pendingApprovals) {
      if (p.status !== 'pending' || now - p.createdAt > 30 * 60 * 1000) {
        this.pendingApprovals.delete(id);
      }
    }
    return pending;
  }

  /**
   * Get compliance summary
   */
  summary() {
    const lines = ['╔═══════════════════════╗'];
    lines.push('║   ⚖️ COMPLIANCE      ║');
    lines.push('╚═══════════════════════╝');
    lines.push('');
    lines.push('── Source Rules ──');
    for (const [name, rule] of this.sourceRules) {
      const status = rule.restrictedAction ? '⚠️' : '✅';
      lines.push(`${status} ${name}: ${rule.maxRequestsPerMinute}/min${rule.restrictedAction ? ' [RESTRICTED]' : ''}`);
    }
    lines.push('');
    lines.push(`── DOS Protection ──`);
    lines.push(`Active: ${this.dosTracker.size > 0}`);
    lines.push(`Total violations: ${this.violations.length}`);
    lines.push('');
    lines.push(`── Pending Approvals ──`);
    lines.push(`${this.getPendingApprovals().length} pending`);
    return lines.join('\n');
  }
}

const complianceManager = new ComplianceManager();

module.exports = { ComplianceManager, complianceManager };
