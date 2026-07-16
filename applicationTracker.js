// ============================================================
// 📋 Application Tracker — Track job applications from Telegram
// ============================================================

const fs = require('fs');
const path = require('path');

class ApplicationTracker {
  constructor() {
    this.applications = new Map();
    this.dataFile = path.join(__dirname, 'applications.json');
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        for (const [userId, apps] of Object.entries(data)) {
          this.applications.set(String(userId), apps);
        }
        console.log(`📋 Loaded ${this.totalCount()} tracked applications`);
      }
    } catch (err) {
      console.error('⚠️ Could not load applications:', err.message);
    }
  }

  _save() {
    try {
      const obj = {};
      for (const [userId, apps] of this.applications) {
        obj[userId] = apps;
      }
      fs.writeFileSync(this.dataFile, JSON.stringify(obj, null, 2));
    } catch (err) {
      console.error('⚠️ Could not save applications:', err.message);
    }
  }

  /**
   * Add a tracked application
   */
  add(userId, app) {
    if (!this.applications.has(String(userId))) {
      this.applications.set(String(userId), []);
    }
    const apps = this.applications.get(String(userId));

    const entry = {
      id: apps.length > 0 ? Math.max(...apps.map(a => a.id)) + 1 : 1,
      company: app.company || 'Unknown',
      role: app.role || app.title || 'Unknown',
      url: app.url || '',
      status: app.status || 'draft',
      notes: app.notes || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      history: [
        { status: app.status || 'draft', timestamp: Date.now() },
      ],
    };

    apps.push(entry);
    this._save();
    return entry;
  }

  /**
   * Application status options
   */
  static STATUSES = [
    { value: 'draft', label: '📝 Draft', emoji: '📝' },
    { value: 'applied', label: '📤 Applied', emoji: '📤' },
    { value: 'screening', label: '🔍 Screening', emoji: '🔍' },
    { value: 'interview', label: '🎯 Interview', emoji: '🎯' },
    { value: 'offer', label: '🎉 Offer', emoji: '🎉' },
    { value: 'accepted', label: '✅ Accepted', emoji: '✅' },
    { value: 'rejected', label: '❌ Rejected', emoji: '❌' },
    { value: 'ghosted', label: '👻 Ghosted', emoji: '👻' },
    { value: 'withdrawn', label: '⏸️ Withdrawn', emoji: '⏸️' },
  ];

  static STATUS_EMOJI = Object.fromEntries(
    ApplicationTracker.STATUSES.map(s => [s.value, s.emoji])
  );

  static STATUS_LABEL = Object.fromEntries(
    ApplicationTracker.STATUSES.map(s => [s.value, s.label])
  );

  /**
   * Update status
   */
  updateStatus(userId, appId, newStatus) {
    const apps = this.applications.get(String(userId));
    if (!apps) throw new Error('No applications found');

    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error(`Application #${appId} not found`);

    if (!ApplicationTracker.STATUSES.find(s => s.value === newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    app.status = newStatus;
    app.updatedAt = Date.now();
    app.history.push({ status: newStatus, timestamp: Date.now() });
    this._save();
    return app;
  }

  /**
   * Update notes
   */
  updateNotes(userId, appId, notes) {
    const apps = this.applications.get(String(userId));
    if (!apps) throw new Error('No applications found');

    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error(`Application #${appId} not found`);

    app.notes = notes;
    app.updatedAt = Date.now();
    this._save();
  }

  /**
   * Delete an application
   */
  delete(userId, appId) {
    const apps = this.applications.get(String(userId));
    if (!apps) return false;

    const idx = apps.findIndex(a => a.id === appId);
    if (idx === -1) return false;

    apps.splice(idx, 1);
    this._save();
    return true;
  }

  /**
   * Get user's applications
   */
  getByUser(userId) {
    return this.applications.get(String(userId)) || [];
  }

  /**
   * Get application by ID
   */
  getById(userId, appId) {
    const apps = this.applications.get(String(userId));
    if (!apps) return null;
    return apps.find(a => a.id === appId) || null;
  }

  /**
   * Format user's applications for display
   */
  formatList(userId) {
    const apps = this.getByUser(userId);
    if (apps.length === 0) return null;

    const emoji = (s) => ApplicationTracker.STATUS_EMOJI[s] || '📝';
    const label = (s) => ApplicationTracker.STATUS_LABEL[s] || s;

    let text = '📋 *Your Applications*\n\n';
    apps.forEach(app => {
      const timeAgo = this._timeAgo(app.updatedAt);
      text += `#${app.id} ${emoji(app.status)} *${app.role}* @ ${app.company}\n`;
      text += `   Status: ${label(app.status)} · Updated ${timeAgo}\n`;
      if (app.notes) text += `   📌 ${app.notes.substring(0, 80)}\n`;
      text += '\n';
    });
    return text;
  }

  /**
   * Format a single application
   */
  formatApp(app) {
    const label = (s) => ApplicationTracker.STATUS_LABEL[s] || s;
    const emoji = (s) => ApplicationTracker.STATUS_EMOJI[s] || '📝';

    let text = `📋 *Application #${app.id}*\n\n`;
    text += `🎯 Role: *${app.role}*\n`;
    text += `🏢 Company: ${app.company}\n`;
    text += `📊 Status: ${emoji(app.status)} ${label(app.status)}\n`;
    if (app.url) text += `🔗 URL: ${app.url}\n`;
    if (app.notes) text += `\n📌 *Notes:* ${app.notes}\n`;
    text += `\n⏱ Created: ${new Date(app.createdAt).toLocaleDateString()}\n`;
    text += `\n*History:*\n`;
    for (const entry of app.history) {
      text += `   • ${emoji(entry.status)} ${label(entry.status)} (${new Date(entry.timestamp).toLocaleDateString()})\n`;
    }
    return text;
  }

  /**
   * Count total applications across all users
   */
  totalCount() {
    let count = 0;
    for (const [, apps] of this.applications) {
      count += apps.length;
    }
    return count;
  }

  /**
   * Get stats for admin
   */
  getStats() {
    const totalUsers = this.applications.size;
    const totalApps = this.totalCount();
    const statusCounts = {};
    
    for (const [, apps] of this.applications) {
      for (const app of apps) {
        statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
      }
    }

    return { totalUsers, totalApps, statusCounts };
  }

  _timeAgo(timestamp) {
    const mins = Math.floor((Date.now() - timestamp) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}

const appTracker = new ApplicationTracker();

module.exports = { ApplicationTracker, appTracker };
