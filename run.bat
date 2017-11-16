@ECHO OFF
:loop
echo Press N to shut down the bot, otherwise it will automatically start in 5 seconds.
choice /t 5 /c yn /cs /d y /m "Start bot Y/N?"
if errorlevel 3 goto :yes
if errorlevel 2 goto :no
if errorlevel 1 goto :yes
:yes
node index.js
GOTO :loop
:no
pause
