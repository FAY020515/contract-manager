import React, { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Calendar, Badge, Modal,
  List, message, Select, Empty,
} from 'antd';
import {
  BellOutlined, CheckOutlined, CloseOutlined, CalendarOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { Reminder } from '../types';

const Reminders: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [dateReminders, setDateReminders] = useState<Reminder[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const allReminders = await window.api.getReminders(statusFilter ? { status: statusFilter } : undefined);
      setReminders(allReminders);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleStatusUpdate = async (id: number, status: string) => {
    await window.api.updateReminderStatus(id, status);
    message.success('状态已更新');
    loadData();
  };

  const handleDateSelect = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const matched = reminders.filter(r => r.remind_date === dateStr);
    setDateReminders(matched);
    setSelectedDate(dateStr);
    setModalVisible(true);
  };

  const dateCellRender = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const count = reminders.filter(r => r.remind_date === dateStr).length;
    if (count === 0) return null;
    return (
      <Badge count={count} style={{ backgroundColor: '#1677ff' }} />
    );
  };

  const columns = [
    {
      title: '提醒日期',
      dataIndex: 'remind_date',
      width: 120,
      sorter: (a: Reminder, b: Reminder) => a.remind_date.localeCompare(b.remind_date),
      render: (text: string) => {
        const isToday = text === dayjs().format('YYYY-MM-DD');
        const isPast = dayjs(text).isBefore(dayjs(), 'day');
        return (
          <span style={{
            fontWeight: isToday ? 700 : 400,
            color: isPast ? '#f5222d' : isToday ? '#1677ff' : 'inherit',
          }}>
            {isToday ? '今天' : text}
          </span>
        );
      },
    },
    {
      title: '类型',
      dataIndex: 'remind_type',
      width: 100,
      render: (text: string) => (
        <Tag color={text === '到期提醒' ? 'warning' : text === '续签提醒' ? 'processing' : 'default'}>
          {text}
        </Tag>
      ),
    },
    {
      title: '合同名称',
      dataIndex: 'contract_title',
      width: 200,
      ellipsis: true,
      render: (text: string, record: Reminder) => (
        <a onClick={() => navigate(`/contracts/${record.contract_id}`)}>{text}</a>
      ),
    },
    {
      title: '合同到期日',
      dataIndex: 'contract_end_date',
      width: 120,
    },
    {
      title: '提醒内容',
      dataIndex: 'message',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: string) => {
        const map: Record<string, { color: string; text: string }> = {
          pending: { color: 'processing', text: '待处理' },
          processed: { color: 'success', text: '已处理' },
          ignored: { color: 'default', text: '已忽略' },
        };
        const item = map[status] || map.pending;
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
    {
      title: '操作',
      width: 120,
      render: (_: any, record: Reminder) => (
        record.status === 'pending' ? (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleStatusUpdate(record.id, 'processed')}
            >
              完成
            </Button>
            <Button
              type="link"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => handleStatusUpdate(record.id, 'ignored')}
            >
              忽略
            </Button>
          </Space>
        ) : null
      ),
    },
  ];

  const pendingCount = reminders.filter(r => r.status === 'pending').length;

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button.Group>
            <Button
              type={viewMode === 'list' ? 'primary' : 'default'}
              icon={<UnorderedListOutlined />}
              onClick={() => setViewMode('list')}
            >
              列表
            </Button>
            <Button
              type={viewMode === 'calendar' ? 'primary' : 'default'}
              icon={<CalendarOutlined />}
              onClick={() => setViewMode('calendar')}
            >
              日历
            </Button>
          </Button.Group>

          <Select
            placeholder="状态筛选"
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
            style={{ width: 120 }}
            options={[
              { label: '待处理', value: 'pending' },
              { label: '已处理', value: 'processed' },
              { label: '已忽略', value: 'ignored' },
            ]}
          />

          {pendingCount > 0 && (
            <Badge count={pendingCount} offset={[8, 0]}>
              <Tag color="processing" icon={<BellOutlined />} style={{ padding: '4px 12px' }}>
                待处理提醒
              </Tag>
            </Badge>
          )}
        </Space>

        {viewMode === 'list' ? (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={reminders}
            loading={loading}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 条` }}
          />
        ) : (
          <Calendar
            cellRender={(date, info) => {
              if (info.type === 'date') return dateCellRender(date);
              return info.originNode;
            }}
            onSelect={handleDateSelect}
          />
        )}
      </Card>

      <Modal
        title={`提醒 - ${selectedDate}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        {dateReminders.length > 0 ? (
          <List
            dataSource={dateReminders}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <a key="view" onClick={() => {
                    setModalVisible(false);
                    navigate(`/contracts/${item.contract_id}`);
                  }}>
                    查看
                  </a>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Tag color={item.remind_type === '到期提醒' ? 'warning' : 'processing'}>
                        {item.remind_type}
                      </Tag>
                      {item.contract_title}
                    </Space>
                  }
                  description={item.message}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="当天无提醒" />
        )}
      </Modal>
    </div>
  );
};

export default Reminders;
