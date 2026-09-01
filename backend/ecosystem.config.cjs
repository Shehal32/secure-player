module.exports = {
  apps: [
    {
      name: 'eduone-secure-player-backend',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      env_uat: {
        NODE_ENV: 'uat',
      },
      env_beta: {
        NODE_ENV: 'beta',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      watch: false,
      max_memory_restart: '1G',
      autorestart: true,
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
