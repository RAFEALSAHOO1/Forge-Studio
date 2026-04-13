@echo off
cd /d "%~dp0\designforge-studio\designforge-studio"
npm install
npm run db:setup
