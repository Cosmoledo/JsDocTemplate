@echo off
rmdir /S /Q example_out
cmd /c jsdoc -c .\conf.json
copy screenshot-1.png example_out
cd example_out
cls
for /r "." %%f in (*.html) do (
	htmlminify -o %%f %%f
)
