; 合同管理系统 - NSIS 安装时自动创建开机启动快捷方式
; 通过 electron-builder.yml 的 nsis.include 引入
; 安装器默认按"仅当前用户"安装（perMachine 未开启），因此用 $STARTUP（当前用户启动目录）；
; 用 $SMSTARTUP（所有用户）需要管理员权限，普通用户安装时会静默失败。

!macro customInstall
  CreateShortCut "$STARTUP\合同管理系统.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$STARTUP\合同管理系统.lnk"
  ; 兼容旧版本可能写入的公共启动目录
  Delete "$SMSTARTUP\合同管理系统.lnk"
!macroend
