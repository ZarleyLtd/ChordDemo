@echo off
rem Serve ChordDemo to this PC and to phones on the same Wi-Fi (use the "Network" address shown).
cd /d "%~dp0"
npx --yes serve . -l tcp://0.0.0.0:3000
