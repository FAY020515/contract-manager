import React, { useEffect, useState, useRef } from 'react';
import {
  Card, Form, Input, Button, Space, Tag, message, Divider,
  Popconfirm, Row, Col, Alert, InputNumber, Switch, Select, Spin,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SaveOutlined,
  DatabaseOutlined, DownloadOutlined, UploadOutlined,
  ClockCircleOutlined, SyncOutlined, FolderOpenOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../contexts/AuthContext';

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
              message="定期备份数据，防止意外丢失。导出的 .db 文件包含合同、收付款、提醒等台账，但不含上传的合同附件文件本体（它们存在数据目录的 uploads 文件夹里），恢复台账后需要另外拷贝该文件夹附件才能打开。"
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
              message="开启后，系统会定期把数据库备份到下面的目录。建议保持默认（本机程序数据目录下的 backups 文件夹），这样不插 U 盘也能稳定备份；要给同事或自己留一份带走副本时，用上方「数据管理 → 导出数据库备份」下载后拷进 U 盘。"
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

              {autoBackupLastTime && (
                <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
                  <span style={{ color: '#666' }}>上次备份时间：</span>
                  <span style={{ fontWeight: 500 }}>
                    {dayjs(autoBackupLastTime).format('YYYY-MM-DD HH:mm:ss')}
                  </span>
                </div>
              )}

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
      </Row>
    </div>
  );
};

export default Settings;
