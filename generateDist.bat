@echo off

rmdir /s /q dist
xcopy /s /q /i /e src dist

cd dist

for /r "." %%f in (*.js) do (
	cmd /c uglifyjs -m -c -o %%f %%f
	echo %%f
)
