; 合同管理系统 - NSIS 安装时自动创建开机启动快捷方式
; 通过 electron-builder 的 nsis.include 引入

!macro customInstall
  ; 为当前用户创建开机启动快捷方式
  CreateShortCut "$SMSTARTUP\合同管理系统.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  ; 卸载时删除开机启动快捷方式
  Delete "$SMSTARTUP\合同管理系统.lnk"
!macroend
