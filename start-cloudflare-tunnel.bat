@echo off
title Cloudflare Tunnel - Ezo Billing Backend
echo ========================================================
echo   Starting Cloudflare Tunnel for http://localhost:5000
echo   This connects your local backend to the mobile app
echo ========================================================
cloudflared tunnel --url http://localhost:5000
pause
