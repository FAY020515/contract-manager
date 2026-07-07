# 合同管理系统 - 开机自启设置脚本
# 右键 → 使用 PowerShell 运行

$shortcutName = "合同管理系统.lnk"
$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")

# 查找合同管理系统可执行文件
$exePaths = @(
    [System.IO.Path]::Combine($env:LOCALAPPDATA, "contract-manager", "合同管理系统.exe"),
    [System.IO.Path]::Combine($env:LOCALAPPDATA, "Programs", "contract-manager", "合同管理系统.exe"),
    [System.IO.Path]::Combine($env:PROGRAMFILES, "合同管理系统", "合同管理系统.exe"),
    [System.IO.Path]::Combine($env:PROGRAMFILES, "contract-manager", "合同管理系统.exe"),
    "C:\Program Files\合同管理系统\合同管理系统.exe",
    "C:\Program Files (x86)\合同管理系统\合同管理系统.exe"
)

$exePath = $null
foreach ($p in $exePaths) {
    if (Test-Path $p) {
        $exePath = $p
        break
    }
}

if (-not $exePath) {
    Write-Host "未找到合同管理系统，请手动指定路径。" -ForegroundColor Red
    Write-Host "常见安装位置:" -ForegroundColor Yellow
    $exePaths | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
    $manualPath = Read-Host "请粘贴合同管理系统.exe的完整路径"
    if ($manualPath -and (Test-Path $manualPath)) {
        $exePath = $manualPath
    } else {
        Write-Host "路径无效，退出。" -ForegroundColor Red
        pause
        exit 1
    }
}

# 创建快捷方式
$WshShell = New-Object -ComObject WScript.Shell
$shortcutPath = [System.IO.Path]::Combine($startupFolder, $shortcutName)
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = [System.IO.Path]::GetDirectoryName($exePath)
$shortcut.Description = "合同管理系统（开机自动启动）"
$shortcut.Save()

Write-Host "开机自启已设置！" -ForegroundColor Green
Write-Host "快捷方式已创建: $shortcutPath" -ForegroundColor Green
Write-Host "指向: $exePath" -ForegroundColor Green
Write-Host ""
Write-Host "取消自启: 删除上述 .lnk 文件即可" -ForegroundColor Yellow
pause
