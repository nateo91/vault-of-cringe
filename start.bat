@echo off
rem Serves the game locally (ES modules need http://, not file://) and opens it.
cd /d "%~dp0"
start "" http://localhost:8642
python serve.py 8642
