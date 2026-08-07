// ============================================================
// ⚙️ PM2 Ecosystem Config — @Paiye_Bot v5
// ============================================================
// Start:   pm2 start ecosystem.config.js
// Stop:    pm2 stop paiye-bot
// Restart: pm2 restart paiye-bot
// Logs:    pm2 logs paiye-bot
// Status:  pm2 status
// ============================================================

module.exports = {
  apps: [{
    name: 'paiye-bot',
    script: 'paiye.js',
    cwd: __dirname,
    
    // Environment
    env: {
      NODE_ENV: 'production',
    },
    env_file: '.env',

    // Process management
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/paiye-error.log',
    out_file: 'logs/paiye-output.log',
    merge_logs: true,
    
    // Resource limits
    max_memory_restart: '500M',
    
    // Graceful shutdown
    kill_timeout: 10000,
    listen_timeout: 3000,
    
    // Watch for file changes (off by default)
    watch: false,
  }]
};
