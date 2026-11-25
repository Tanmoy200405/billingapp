module.exports = {
  apps: [
    {
      name: "bistromate-api",
      script: "./app.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 2000,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
    },
  ],
};
