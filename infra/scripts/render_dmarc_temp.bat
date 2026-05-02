@echo off
setlocal

set "REPO_ROOT=%~dp0..\.."
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"

set "INPUT_DIR=C:\Users\whob0\OneDrive\Desktop\TEMP"
set "OUTPUT_DIR=%INPUT_DIR%\dmarc-output"
set "REPORT_HTML=%OUTPUT_DIR%\dmarc-report.html"

if not exist "%INPUT_DIR%" (
  echo DMARC input folder not found: "%INPUT_DIR%"
  exit /b 1
)

python "%REPO_ROOT%\infra\scripts\render_dmarc_report.py" "%INPUT_DIR%" --output-dir "%OUTPUT_DIR%"
if errorlevel 1 exit /b %errorlevel%

if exist "%REPORT_HTML%" start "" "%REPORT_HTML%"

endlocal