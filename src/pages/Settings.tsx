import React, { useEffect, useState } from 'react';
import {
  Card, Form, Input, Button, Space, Tag, message, Divider,
  Popconfirm, Row, Col, Alert, InputNumber,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SaveOutlined,
  DatabaseOutlined, DownloadOutlined, UploadOutlined,
} from '@ant-design/icons';

const Settings: React.FC = () => {
  const [types, setTypes] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [reminderDays, setReminderDays] = useState<number[]>([7, 15, 30]);
  const [newType, setNewType] = useState('');
  const [newDept, setNewDept] = useState('');
  const [loading, setLoading] = useState(true);

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
      if (result) message.success('备份导出成功');
      else message.error('备份导出失败');
    } catch (e) {
      message.error('操作失败');
    }
  };

  const handleImport = async () => {
    try {
      const result = await window.api.importBackup();
      if (result) {
        message.success('备份导入成功，请重启应用');
      } else {
        message.error('备份导入失败');
      }
    } catch (e) {
      message.error('操作失败');
    }
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

        <Col xs={24} lg={12}>
          <Card title="数据管理" loading={loading}>
            <Alert
              message="定期备份数据，防止意外丢失。备份文件为 SQLite 数据库文件。"
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
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Settings;
