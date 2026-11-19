@echo off
setlocal enabledelayedexpansion
title DesDeck - iniciar
cd /d "%~dp0"

echo ==========================================
echo   DesDeck - verificando o ambiente
echo ==========================================
echo.

set "APP=dd-src"
set "ELECTRON=%APP%\node_modules\electron\dist\electron.exe"
set "FALHOU="

rem ---------------------------------------------- 1) arquivos do programa
rem Sem estes o app nao sobe de jeito nenhum, e o erro do Electron seria
rem confuso ("Cannot find module"). Melhor avisar aqui, com nome do arquivo.
for %%F in (
  "%APP%\package.json"
  "%APP%\src\main.js"
  "%APP%\src\preload.js"
  "%APP%\src\vault.js"
  "%APP%\src\renderer\index.html"
  "%APP%\src\renderer\app.js"
  "%APP%\src\renderer\tools.js"
) do (
  if exist %%F (
    echo   [ ok ] %%~F
  ) else (
    echo   [FALTA] %%~F
    set "FALHOU=1"
  )
)

if defined FALHOU (
  echo.
  echo Faltam arquivos do programa. A pasta parece incompleta ou movida.
  echo Baixe o DesDeck de novo ou restaure os arquivos acima.
  goto :fim
)

rem ---------------------------------------------- 2) o Electron
rem E o que de fato executa o app. Vem no node_modules; se nao estiver la,
rem tentamos instalar as dependencias (precisa de npm e internet).
echo.
if exist "%ELECTRON%" (
  echo   [ ok ] Electron instalado
) else (
  echo   [FALTA] Electron ^(node_modules^)
  echo.
  echo Vou tentar instalar as dependencias. Isso baixa da internet e
  echo pode levar alguns minutos.
  echo.
  where npm >nul 2>&1
  if errorlevel 1 (
    echo   [ERRO] npm nao encontrado.
    echo   Instale o Node.js ^(que traz o npm^): https://nodejs.org
    echo   Depois rode este iniciar.bat outra vez.
    goto :fim
  )
  pushd "%APP%"
  call npm install
  set "CODIGO=!errorlevel!"
  popd
  if not "!CODIGO!"=="0" (
    echo.
    echo   [ERRO] A instalacao falhou ^(codigo !CODIGO!^).
    echo   Confira sua internet e tente de novo.
    goto :fim
  )
  rem O npm pode terminar "com sucesso" e mesmo assim nao gravar o electron.exe:
  rem o pacote baixa um .zip e descompacta depois, e e comum o antivirus barrar
  rem essa gravacao em silencio. Por isso conferimos o arquivo, nao o codigo de saida.
  if not exist "%ELECTRON%" (
    echo.
    echo   [ERRO] A instalacao terminou, mas o Electron nao apareceu.
    echo.
    echo   Isso quase sempre e o antivirus barrando a gravacao do
    echo   electron.exe. O que costuma resolver:
    echo     1. Libere a pasta abaixo no seu antivirus e rode de novo:
    echo        %~dp0%APP%
    echo     2. Ou rode este iniciar.bat como administrador.
    goto :fim
  )
  echo   [ ok ] Electron instalado agora
)

rem ---------------------------------------------- 3) ja esta aberto?
rem O DesDeck e de instancia unica: abrir de novo so traz a janela existente
rem para a frente. Aviso para ninguem pensar que travou.
rem Conta so os electron.exe DESTA pasta: outros programas feitos em Electron
rem tambem usam esse nome, e olhar so pelo nome dava alarme falso.
rem Usa PowerShell porque o wmic foi removido das versoes novas do Windows.
rem O PowerShell responde so SIM ou NAO. Assim, se ele estiver bloqueado ou
rem devolver qualquer outra coisa, a resposta nao e "SIM" e simplesmente nao
rem avisamos nada: um aviso errado confunde mais do que a ausencia dele.
set "ABERTO="
for /f "delims=" %%P in ('powershell -NoProfile -Command "if (Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '%~dp0%APP%*' }) { 'SIM' } else { 'NAO' }" 2^>nul') do set "ABERTO=%%P"
if "%ABERTO%"=="SIM" (
  echo.
  echo   [aviso] O DesDeck ja esta aberto.
  echo   Ele e de instancia unica: a janela que ja existe vem para a frente.
)

rem ---------------------------------------------- 4) sobe
echo.
echo ==========================================
echo   Tudo certo. Abrindo o DesDeck...
echo ==========================================
echo.
echo As contas carregam uma a uma; com muitas contas isso leva
echo cerca de um minuto. Pode fechar esta janela preta.
echo.

cd /d "%~dp0%APP%"
start "" "node_modules\electron\dist\electron.exe" "."
goto :eof

:fim
echo.
pause
