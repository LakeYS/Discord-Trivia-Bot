@ECHO OFF
node index.js
:loop
echo The bot will restart in 5 seconds. Press N to cancel.
choice /t 5 /c yn /cs /d y /m "Start bot Y/N?"
if errorlevel 3 goto :yes
if errorlevel 2 goto :no
if errorlevel 1 goto :yes
:yes
node index.js
GOTO :loop
:no
pause
