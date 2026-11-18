@echo off
rem Analyse one or more YouTube songs, then publish them to GitHub Pages.
rem   analyze.bat <url-or-id> [...]          analyse and publish
rem   analyze.bat --no-push <url-or-id> ...  analyse only
set PUSH=1
if "%~1"=="--no-push" (set PUSH=0& shift)
set ARGS=
:collect
if "%~1"=="" goto run
set ARGS=%ARGS% %1
shift
goto collect
:run
"%~dp0.venv\Scripts\python.exe" "%~dp0analyze.py" %ARGS% || exit /b 1
if "%PUSH%"=="0" exit /b 0
cd /d "%~dp0.."
git add songs
git commit -m "Add analysed songs" -- songs && git push && echo Published: the site updates in about a minute.
