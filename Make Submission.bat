@echo off
title Build the submission zip
cd /d "%~dp0"
python make_submission.py
echo.
pause
