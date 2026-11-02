@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 本地预览：浏览器将打开 http://localhost:8080/
echo 经销商页 http://localhost:8080/index.html
echo 管理页   http://localhost:8080/admin.html
echo 关闭此窗口即停止预览。
start "" http://localhost:8080/index.html
python -m http.server 8080 2>nul || py -m http.server 8080 2>nul || (echo. & echo 未找到 Python，请安装 Python 后重试：https://www.python.org/downloads/ & pause)
