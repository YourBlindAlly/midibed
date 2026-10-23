@echo off
setlocal
title Listen to MIDI coming in

echo.
echo This listens to a MIDI input on this computer, normally the rtpMIDI port MidiBed sends to,
echo and tells you which channels and notes are arriving. Press Control and C to stop it.
echo.

set "PY=C:\Users\rusty\AppData\Local\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"

"%PY%" "%~dp0midi_monitor.py"

echo.
pause
