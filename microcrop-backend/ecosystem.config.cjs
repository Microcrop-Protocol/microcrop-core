module.exports = {
  apps: [
    {
      name: 'microcrop-backend',
      script: 'src/index.js',
      instances: 1, // Single instance (blockchain listeners + Bull workers are stateful)
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      // Graceful shutdown
      kill_timeout: 30000, // Match SHUTDOWN_TIMEOUT_MS
      listen_timeout: 10000,
      shutdown_with_message: true,
      // Logging
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Restart strategy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
    },
  ],
};
