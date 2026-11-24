@echo off
rem Analyse one or more YouTube songs and save them to the ChordDemo library (Supabase).
rem   analyze.bat <url-or-id> [...]
rem   analyze.bat <url-or-id> --title "Title" --artist "Artist"
rem No commit or push: the app reads the library from Supabase, so reload to see the song.
"%~dp0.venv\Scripts\python.exe" "%~dp0analyze.py" %*
