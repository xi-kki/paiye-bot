// ============================================================
// 👑 Admin Manager — Admin controls, audit log, broadcast
// ============================================================

const fs = require('fs');
const path = require('path');

class AdminManager {
  constructor(options = {}) {
    this.adminIds = new Set();
    this.auditLog = [];
    this.maxAuditEntries = options.maxAuditEntries || 1000;
    this.auditFile = options.auditFile || path.join(__dirname, 'admin-audit.json');
    this.blockedUsers = new Set();
    this.globalBroadcastCooldown = 0; // ms between broadcasts
    this._lastBroadcast = 0;

    // Load admin IDs from env
    this._loadAdmins();
    // Load audit log
    this._loadAudit();
    // Load blocked users
    this._loadBlocked();
  }

  _loadAdmins() {
    const admins = process.env.ADMIN_IDS || '';
    for (const id of admins.split(',').map(s => s.trim()).filter(Boolean)) {
      this.adminIds.add(String(id));
    }
    if (this.adminIds.size > 0) {
      console.log(`👑 Admin IDs loaded: ${[...this.adminIds].join(', ')}`);
    } else {
      console.log('👑 No admin IDs configured. Set ADMIN_IDS in .env');
    }
  }

  _loadAudit() {
    try {
      if (fs.existsSync(this.auditFile)) {
        this.auditLog = JSON.parse(fs.readFileSync(this.auditFile, 'utf8'));
        console.log(`📋 Loaded ${this.auditLog.length} audit entries`);
      }
    } catch {}
  }

  _saveAudit() {
    try {
      fs.writeFileSync(this.auditFile, JSON.stringify(this.auditLog.slice(-this.maxAuditEntries), null, 2));
    } catch {}
  }

  _loadBlocked() {
    try {
      const file = path.join(__dirname, 'blocked-users.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        this.blockedUsers = new Set(data);
        console.log(`🚫 Loaded ${this.blockedUsers.size} blocked users`);
      }
    } catch {}
  }

  _saveBlocked() {
    try {
      fs.writeFileSync(path.join(__dirname, 'blocked-users.json'), 
        JSON.stringify([...this.blockedUsers], null, 2));
    } catch {}
  }

  /**
   * Check if a user is admin
   */
  isAdmin(userId) {
    return this.adminIds.has(String(userId));
  }

  /**
   * Require admin - throws if not
   */
  requireAdmin(userId) {
    if (!this.isAdmin(userId)) {
      throw new Error('⛔ Admin only. You are not authorized.');
    }
  }

  /**
   * Check if a user is blocked
   */
  isBlocked(userId) {
    return this.blockedUsers.has(String(userId));
  }

  /**
   * Block a user
   */
  blockUser(adminId, userId, reason = '') {
    this.requireAdmin(adminId);
    this.blockedUsers.add(String(userId));
    this._saveBlocked();
    this._log(adminId, 'block', `Blocked user ${userId}`, { reason });
    return `✅ Blocked user ${userId}${reason ? ` (${reason})` : ''}`;
  }

  /**
   * Unblock a user
   */
  unblockUser(adminId, userId) {
    this.requireAdmin(adminId);
    this.blockedUsers.delete(String(userId));
    this._saveBlocked();
    this._log(adminId, 'unblock', `Unblocked user ${userId}`);
    return `✅ Unblocked user ${userId}`;
  }

  /**
   * Set rate limit mode
   */
  setRateLimitMode(adminId, mode) {
    this.requireAdmin(adminId);
    this._log(adminId, 'config', `Set rate limit mode to ${mode}`);
    // Return the mode so caller can apply it
    return mode;
  }

  /**
   * Can we broadcast? Respects cooldown
   */
  canBroadcast() {
    if (this.globalBroadcastCooldown === 0) return true;
    const elapsed = Date.now() - this._lastBroadcast;
    return elapsed >= this.globalBroadcastCooldown;
  }

  /**
   * Internal audit log
   */
  _log(adminId, action, description, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      adminId: String(adminId),
      action,
      description,
      meta,
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog = this.auditLog.slice(-this.maxAuditEntries);
    }
    this._saveAudit();
    console.log(`👑 [${adminId}] ${action}: ${description}`);
  }

  /**
   * Log any event
   */
  log(userId, action, description, meta = {}) {
    this._log(userId, action, description, meta);
  }

  /**
   * Get audit log as text
   */
  getAuditText(lines = 20) {
    const recent = this.auditLog.slice(-lines);
    if (recent.length === 0) return '📋 No audit entries yet.';
    
    let text = '📋 *Audit Log*\n\n';
    for (const entry of recent.reverse()) {
      const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });
      text += `[${time}] 👤${entry.adminId} → ${entry.action}: ${entry.description}\n`;
    }
    return text;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      admins: this.adminIds.size,
      blockedUsers: this.blockedUsers.size,
      auditEntries: this.auditLog.length,
      lastBroadcast: this._lastBroadcast ? new Date(this._lastBroadcast).toISOString() : 'Never',
    };
  }

  /**
   * Record broadcast time
   */
  recordBroadcast() {
    this._lastBroadcast = Date.now();
  }
}

// ─── Singleton ───
const adminManager = new AdminManager();

module.exports = { AdminManager, adminManager };
