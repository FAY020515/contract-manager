import React, { useEffect, useState, useRef } from 'react';
import {
  Card, Form, Input, Button, Space, Tag, message, Divider,
  Popconfirm, Row, Col, Alert, InputNumber, Switch, Select, Spin, Modal,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SaveOutlined,
  DatabaseOutlined, DownloadOutlined, UploadOutlined,
  ClockCircleOutlined, SyncOutlined, FolderOpenOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../contexts/AuthContext';
import type { BackupUnit } from '../types';

const Settings: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [types, setTypes] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [reminderDays, setReminderDays] = useState<number[]>([7, 15, 30]);
  const [newType, setNewType] = useState('');
  const [newDept, setNewDept] = useState('');
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 自动备份状态
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupDir, setAutoBackupDir] = useState('');
  const [autoBackupFrequency, setAutoBackupFrequency] = useState<'daily' | 'weekly'>('daily');
  const [autoBackupKeepCount, setAutoBackupKeepCount] = useState(7);
  const [autoBackupLastTime, setAutoBackupLastTime] = useState<string | null>(null);
  const [autoBackupLastError, setAutoBackupLastError] = useState<string | null>(null);
  const [autoBackupDefaultDir, setAutoBackupDefaultDir] = useState('');
  const [autoBackupSaving, setAutoBackupSaving] = useState(false);
  const [autoBackupTriggering, setAutoBackupTriggering] = useState(false);

  // 一键恢复与完整备份
  const [restoreDir, setRestoreDir] = useState('');
  const [backupUnits, setBackupUnits] = useState<BackupUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [fullExportDir, setFullExportDir] = useState('');
  const [fullExporting, setFullExporting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const settings = await window.api.getAllSettings();
      setTypes(settings.contract_types || []);
      setDepartments(settings.departments || []);
      setReminderDays(settings.reminder_days || [7, 15, 30]);
      // 备份配置仅管理员可见
      if (isAdmin) {
        const autoConfig = await window.api.getAutoBackupConfig();
        setAutoBackupEnabled(autoConfig.enabled);
        setAutoBackupDir(autoConfig.backupDir);
        setAutoBackupFrequency(autoConfig.frequency);
        setAutoBackupKeepCount(autoConfig.keepCount);
        setAutoBackupLastTime(autoConfig.lastBackupTime);
        setAutoBackupLastError(autoConfig.lastError ?? null);
        setAutoBackupDefaultDir(autoConfig.defaultDir);
        setRestoreDir(autoConfig.defaultDir);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const saveTypes = async (newTypes: string[]) => {
    setTypes(newTypes);
    await window.api.setSetting('contract_types', newTypes);
  };

  const saveDepartments = async (newDepts: string[]) => {
    setDepartments(newDepts);
    await window.api.setSetting('departments', newDepts);
  };

  const saveReminderDays = async (days: number[]) => {
    setReminderDays(days);
    await window.api.setSetting('reminder_days', days);
    message.success('提醒规则已保存');
  };

  const addType = () => {
    if (!newType.trim()) return;
    if (types.includes(newType.trim())) {
      message.warning('该类型已存在');
      return;
    }
    const updated = [...types, newType.trim()];
    saveTypes(updated);
    setNewType('');
    message.success('添加成功');
  };

  const removeType = (type: string) => {
    saveTypes(types.filter(t => t !== type));
    message.success('已删除');
  };

  const addDept = () => {
    if (!newDept.trim()) return;
    if (departments.includes(newDept.trim())) {
      message.warning('该部门已存在');
      return;
    }
    const updated = [...departments, newDept.trim()];
    saveDepartments(updated);
    setNewDept('');
    message.success('添加成功');
  };

  const removeDept = (dept: string) => {
    saveDepartments(departments.filter(d => d !== dept));
    message.success('已删除');
  };

  const handleExport = async () => {
    try {
      const result = await window.api.exportBackup();
      if (result) message.success('备份文件已下载到浏览器下载文件夹，请拷到 U 盘保存');
      else message.error('备份导出失败');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  // window.api 恒为 HTTP 客户端（main.tsx 覆盖），桌面与浏览器统一走文件选择器
  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 重置 input 的值，以便重复选择同一文件
    e.target.value = '';
    if (!file) return;
    try {
      const result = await window.api.importBackup(file);
      if (result) {
        message.success('备份导入成功，数据已恢复');
      } else {
        message.error('备份导入失败');
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  // ========== 自动备份 ==========
  const saveAutoBackupConfig = async () => {
    setAutoBackupSaving(true);
    try {
      await window.api.setAutoBackupConfig({
        enabled: autoBackupEnabled,
        backupDir: autoBackupDir,
        frequency: autoBackupFrequency,
        keepCount: autoBackupKeepCount,
      });
      message.success('自动备份设置已保存');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    }
    setAutoBackupSaving(false);
  };

  const triggerBackupNow = async () => {
    setAutoBackupTriggering(true);
    try {
      const result = await window.api.triggerAutoBackup();
      if (result.success) {
        message.success('备份成功');
        setAutoBackupLastTime(result.time);
        setAutoBackupLastError(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '备份失败';
      setAutoBackupLastError(msg);
      message.error(msg);
    }
    setAutoBackupTriggering(false);
  };

  const useDefaultDir = () => {
    setAutoBackupDir(autoBackupDefaultDir);
    message.info('已填入默认备份目录，请保存');
  };

  const formatBytes = (n: number) => {
    if (!n) return '0 B';
    const mb = n / 1048576;
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
  };

  const loadBackupUnits = async () => {
    setUnitsLoading(true);
    try {
      const res = await window.api.listBackupUnits(restoreDir || undefined);
      setBackupUnits(res.units || []);
      setSelectedUnit(null);
      if (!res.units || !res.units.length) message.info('该目录下没有找到备份');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '读取备份列表失败');
    }
    setUnitsLoading(false);
  };

  const doRestore = async () => {
    if (!selectedUnit) return;
    setRestoring(true);
    try {
      const res = await window.api.restoreFromUnit(selectedUnit);
      const unit = backupUnits.find(u => u.path === selectedUnit);
      const when = unit ? dayjs(unit.time).format('YYYY-MM-DD HH:mm:ss') : '所选时间点';
      Modal.success({
        title: '已恢复到所选备份',
        content: res.uploadsRestored
          ? `台账与合同附件都已回到 ${when} 的状态。恢复前的数据已自动留存，需要时可在备份目录的 pre_restore_ 文件夹里找回。`
          : `台账已恢复到 ${when}。这份备份不含附件，现有附件未被改动。`,
        okText: '刷新页面',
        onOk: () => window.location.reload(),
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : '恢复失败');
      setRestoring(false);
    }
  };

  const doFullExport = async () => {
    const dest = fullExportDir.trim();
    if (!dest) {
      message.warning('请先填写目标目录，例如 E:\\合同备份');
      return;
    }
    setFullExporting(true);
    try {
      const res = await window.api.exportFullBackup(dest);
      message.success(`完整备份已生成：${res.path}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '生成完整备份失败');
    }
    setFullExporting(false);
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="合同类型管理" loading={loading}>
            <Space wrap style={{ marginBottom: 16 }}>
              {types.map(t => (
                <Tag
                  key={t}
                  closable
                  onClose={(e) => { e.preventDefault(); removeType(t); }}
                  color="blue"
                >
                  {t}
                </Tag>
              ))}
            </Space>
            <Space>
              <Input
                value={newType}
                onChange={e => setNewType(e.target.value)}
                placeholder="新类型名称"
                onPressEnter={addType}
                style={{ width: 160 }}
              />
              <Button icon={<PlusOutlined />} onClick={addType} type="primary">
                添加
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="部门管理" loading={loading}>
            <Space wrap style={{ marginBottom: 16 }}>
              {departments.map(d => (
                <Tag
                  key={d}
                  closable
                  onClose={(e) => { e.preventDefault(); removeDept(d); }}
                  color="green"
                >
                  {d}
                </Tag>
              ))}
            </Space>
            <Space>
              <Input
                value={newDept}
                onChange={e => setNewDept(e.target.value)}
                placeholder="新部门名称"
                onPressEnter={addDept}
                style={{ width: 160 }}
              />
              <Button icon={<PlusOutlined />} onClick={addDept} type="primary">
                添加
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="提醒规则" loading={loading}>
            <p style={{ color: '#666', marginBottom: 16 }}>
              合同到期前多少天发送提醒（天数）
            </p>
            <Space wrap>
              {reminderDays.map((day, index) => (
                <InputNumber
                  key={index}
                  value={day}
                  min={1}
                  max={365}
                  addonAfter="天"
                  onChange={(val) => {
                    const updated = [...reminderDays];
                    updated[index] = val || 7;
                    setReminderDays(updated);
                  }}
                />
              ))}
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  saveReminderDays([...reminderDays, 7]);
                }}
              >
                添加
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={reminderDays.length <= 1}
                onClick={() => {
                  const updated = reminderDays.slice(0, -1);
                  saveReminderDays(updated);
                }}
              >
                减少
              </Button>
            </Space>
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => saveReminderDays(reminderDays)}
              >
                保存提醒规则
              </Button>
            </div>
          </Card>
        </Col>

        {isAdmin && (
        <Col xs={24} lg={12}>
          <Card title="数据管理" loading={loading}>
            <Alert
              message="定期备份数据，防止意外丢失。导出的 .db 文件只包含合同、收付款、提醒等台账，不含上传的合同附件文件本体；要连附件一起备份请开启下方「自动备份」（它会把台账和 uploads 文件夹一起存成一份备份），或者另外手动拷贝数据目录下的 uploads 文件夹。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExport}
                block
              >
                导出数据库备份
              </Button>
              <Popconfirm
                title="导入备份将覆盖当前数据，确定继续？"
                onConfirm={handleImport}
                okText="确认"
                cancelText="取消"
              >
                <Button
                  icon={<UploadOutlined />}
                  danger
                  block
                >
                  导入数据库备份
                </Button>
              </Popconfirm>
            </Space>
            {/* 隐藏文件选择器，桌面与浏览器模式共用 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".db"
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />
          </Card>
        </Col>
        )}

        {/* 自动备份配置 */}
        {isAdmin && (
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                <span>自动备份</span>
              </Space>
            }
            loading={loading}
          >
            <Alert
              message="开启后，系统会定期把台账和已上传的附件一起备份到下面的目录：每份备份是一个文件夹，里面有 contracts.db 和 uploads 附件副本。建议保持默认（本机程序数据目录下的 backups 文件夹），这样不插 U 盘也能稳定备份；要留一份带走副本时，插上 U 盘，把 backups 里最新的那个 auto_backup_ 文件夹整个拷过去即可。"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Form layout="vertical">
              <Form.Item label="启用自动备份">
                <Switch
                  checked={autoBackupEnabled}
                  onChange={setAutoBackupEnabled}
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                />
              </Form.Item>

              <Form.Item
                label="备份目录"
                extra={
                  <span style={{ fontSize: 12, color: '#999' }}>
                    默认目录：{autoBackupDefaultDir}（留空则使用默认）
                  </span>
                }
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={autoBackupDir}
                    onChange={e => setAutoBackupDir(e.target.value)}
                    placeholder={autoBackupDefaultDir}
                  />
                  <Button
                    icon={<FolderOpenOutlined />}
                    onClick={useDefaultDir}
                  >
                    默认
                  </Button>
                </Space.Compact>
              </Form.Item>

              <Form.Item label="备份频率">
                <Select
                  value={autoBackupFrequency}
                  onChange={v => setAutoBackupFrequency(v)}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'daily', label: '每天一次' },
                    { value: 'weekly', label: '每周一次' },
                  ]}
                />
              </Form.Item>

              <Form.Item label="保留份数" extra="超过此数量时，自动删除最旧的备份">
                <InputNumber
                  value={autoBackupKeepCount}
                  onChange={v => setAutoBackupKeepCount(v || 7)}
                  min={1}
                  max={90}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              {(() => {
                const days = autoBackupLastTime ? dayjs().diff(dayjs(autoBackupLastTime), 'day') : null;
                const color = autoBackupLastTime === null ? '#999' : (days !== null && days >= 7 ? '#fa8c16' : '#52c41a');
                return (
                  <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
                    <span style={{ color: '#666' }}>最近一次备份：</span>
                    <span style={{ fontWeight: 500, color }}>
                      {autoBackupLastTime
                        ? `${days} 天前（${dayjs(autoBackupLastTime).format('YYYY-MM-DD HH:mm:ss')}）`
                        : '尚未备份'}
                    </span>
                    {autoBackupLastTime !== null && days !== null && days >= 7 && (
                      <span style={{ marginLeft: 8, color: '#fa8c16' }}>建议尽快做一次备份</span>
                    )}
                  </div>
                );
              })()}

              {autoBackupLastError && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="最近一次自动备份没有成功"
                  description={autoBackupLastError}
                />
              )}

              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={autoBackupSaving}
                  onClick={saveAutoBackupConfig}
                  block
                >
                  保存自动备份设置
                </Button>
                <Button
                  icon={<SyncOutlined spin={autoBackupTriggering} />}
                  loading={autoBackupTriggering}
                  onClick={triggerBackupNow}
                  block
                >
                  立即备份一次
                </Button>
              </Space>
            </Form>
          </Card>
        </Col>
        )}

        {/* 一键回到某次备份 */}
        {isAdmin && (
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <DatabaseOutlined />
                <span>备份与恢复</span>
              </Space>
            }
            loading={loading}
          >
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="这里可以把系统直接回到某一次备份的样子：台账和合同附件一起恢复，不需要自己去找文件夹。恢复前会自动留存当前数据，误操作还能退回来。"
            />

            <Form layout="vertical">
              <Form.Item
                label="备份所在文件夹"
                extra="默认是本机的 backups 目录；插着 U 盘时也可以填 U 盘上的备份文件夹路径"
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={restoreDir}
                    onChange={e => setRestoreDir(e.target.value)}
                    placeholder={autoBackupDefaultDir}
                  />
                  <Button onClick={() => { setRestoreDir(autoBackupDefaultDir); }}>默认</Button>
                  <Button icon={<SyncOutlined />} loading={unitsLoading} onClick={loadBackupUnits}>
                    刷新列表
                  </Button>
                </Space.Compact>
              </Form.Item>

              <Form.Item label="可选的备份（按时间从新到旧）">
                <Select
                  value={selectedUnit}
                  onChange={v => setSelectedUnit(v)}
                  placeholder={backupUnits.length ? '请选择要恢复的备份' : '先点上方「刷新列表」'}
                  style={{ width: '100%' }}
                  options={backupUnits.map(u => ({
                    value: u.path,
                    label: `${dayjs(u.time).format('YYYY-MM-DD HH:mm:ss')} ｜ ${
                      u.hasUploads ? `含 ${u.attachmentCount} 个附件（${formatBytes(u.uploadsBytes)}）` : '不含附件'
                    } ｜ 台账 ${formatBytes(u.dbBytes)}`,
                  }))}
                />
              </Form.Item>

              <Popconfirm
                title="确认回到这份备份？"
                description="台账和合同附件都会变成该备份那一刻的样子，之后新加的数据将不在这套系统里（自动留存的当前数据仍可找回）。"
                okText="确认恢复"
                cancelText="取消"
                onConfirm={doRestore}
              >
                <Button danger type="primary" block disabled={!selectedUnit} loading={restoring}>
                  回到所选备份
                </Button>
              </Popconfirm>

              <Divider />

              <Form.Item
                label="完整备份到指定目录（例如 U 盘）"
                extra="填目标文件夹的绝对路径，程序会把台账和附件一起写成一个以时间命名的文件夹"
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={fullExportDir}
                    onChange={e => setFullExportDir(e.target.value)}
                    placeholder="E:\合同备份"
                  />
                  <Button icon={<DownloadOutlined />} loading={fullExporting} onClick={doFullExport}>
                    生成完整备份
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Form>
          </Card>
        </Col>
        )}
      </Row>
    </div>
  );
};

export default Settings;
