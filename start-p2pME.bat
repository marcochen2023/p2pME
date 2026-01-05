@echo off
chcp 65001 >nul
echo ===================================
echo p2pME 點對點連線工具啟動程序
echo ===================================
echo.

REM 設置顏色
color 0A

REM 檢查 Node.js 是否已安裝
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [警告] 未檢測到 Node.js，正在嘗試安裝...
    echo 請手動安裝 Node.js: https://nodejs.org/
    echo 安裝後重新運行此批次檔
    pause
    start https://nodejs.org/
    exit /b 1
)

REM 檢查當前目錄
cd /d "%~dp0"
echo [信息] 當前工作目錄: %CD%

REM 檢查依賴是否已安裝
if not exist "node_modules" (
    echo [信息] 首次運行，正在安裝依賴...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [錯誤] 依賴安裝失敗，請檢查網絡連接或手動運行 npm install
        pause
        exit /b 1
    )
    echo [成功] 依賴安裝完成
) else (
    echo [信息] 依賴已安裝
)

REM 檢查端口 8081 是否被占用
netstat -ano | findstr :8081 >nul
if %ERRORLEVEL% equ 0 (
    echo [警告] 端口 8081 已被占用，可能是另一個 p2pME 實例正在運行
    echo 您可以繼續使用現有的信令伺服器，或關閉占用端口的程序後重試
    
    choice /C YN /M "是否繼續使用現有的信令伺服器？"
    if %ERRORLEVEL% equ 2 (
        echo 請手動關閉占用端口的程序後重新運行此批次檔
        pause
        exit /b 1
    )
) else (
    echo [信息] 正在啟動信令伺服器...
    start "p2pME 信令伺服器" cmd /c "node signaling-server.js"
    echo [成功] 信令伺服器已啟動在端口 8081
)

REM 等待信令伺服器啟動
timeout /t 2 >nul

REM 檢查 Web 伺服器 (假設使用 XAMPP)
if not exist "%SystemDrive%\xampp\apache\bin\httpd.exe" (
    echo [警告] 未檢測到 XAMPP，您需要一個 Web 伺服器來運行 p2pME
    echo 請確保您的 Web 伺服器已啟動，並且可以訪問 http://localhost
)

REM 打開瀏覽器
echo [信息] 正在打開 p2pME 應用...
start http://localhost

echo.
echo ===================================
echo p2pME 已成功啟動！
echo.
echo 如果瀏覽器沒有自動打開，請手動訪問:
echo http://localhost
echo.
echo 信令伺服器運行在: ws://localhost:8081
echo ===================================
echo.
echo 按任意鍵退出此窗口 (信令伺服器將繼續在後台運行)
pause >nul