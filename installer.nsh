; 合同管理系统 - NSIS 安装时自动创建开机启动快捷方式
; 通过 electron-builder.yml 的 nsis.include 引入
; 安装器默认按"仅当前用户"安装（perMachine 未开启），因此写入当前用户的启动目录：
;   $APPDATA\Microsoft\Windows\Start Menu\Programs\Startup
; 注意：NSIS 没有 $STARTUP 常量，只有 $SMSTARTUP（所有用户，需管理员权限）。

!macro customInstall
  CreateShortCut "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\合同管理系统.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\合同管理系统.lnk"
  Delete "$SMSTARTUP\合同管理系统.lnk"
!macroend
