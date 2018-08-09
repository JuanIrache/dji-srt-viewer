mkdir .\exports
if [%1]==[] goto :eof
:loop
START /WAIT .\bin\ffmpeg -i "%~1" -map 0:s:0 exports/"%n~1".srt
shift
if not [%1]==[] goto loop
pause >nul