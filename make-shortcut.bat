@echo off
rem Puts a "Vault of Cringe" shortcut (with the moai icon) on your desktop, pointing at this folder's launch.pyw.
rem Shortcuts store absolute paths, so each person runs this once on their own machine.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$py = $null; foreach ($c in 'py','python') { if (Get-Command $c -ErrorAction SilentlyContinue) { $o = & $c -c 'import sys, os; print(os.path.join(os.path.dirname(sys.executable), ''pythonw.exe''))' 2>$null; if ($o -and (Test-Path $o)) { $py = $o; break } } }" ^
  "if (-not $py) { Write-Host 'Python was not found. Install it from python.org (tick Add to PATH), then run this again.'; exit 1 }" ^
  "$dir = (Get-Location).Path;" ^
  "$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Vault of Cringe.lnk';" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk);" ^
  "$s.TargetPath = $py; $s.Arguments = '\"' + (Join-Path $dir 'launch.pyw') + '\"'; $s.WorkingDirectory = $dir;" ^
  "$s.IconLocation = (Join-Path $dir 'icon.ico') + ',0'; $s.Description = 'Vault of Cringe - a raid of memes'; $s.Save();" ^
  "Write-Host ('Shortcut created: ' + $lnk)"
pause
