import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, List, Tag, Spin } from 'antd';
import {
  FileTextOutlined,
  PlusCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardStats, StatItem, Reminder } from '../types';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [typeStats, setTypeStats] = useState<StatItem[]>([]);
  const [trendStats, setTrendStats] = useState<StatItem[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, t, tr, r] = await Promise.all([
        window.api.getDashboardStats(),
        window.api.getStatsByType(),
        window.api.getMonthlyTrend(),
        window.api.getUpcomingReminders(30),
      ]);
      setStats(s);
      setTypeStats(t);
      setTrendStats(tr);
      setReminders(r);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const statusPieOption = {
    tooltip: { trigger: 'item' as const },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}: {c}' },
      data: typeStats.map((s, i) => ({
        name: s.type || '未知',
        value: s.count,
        itemStyle: {
          color: ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'][i % 6],
        },
      })),
    }],
  };

  const trendBarOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: {
      type: 'category' as const,
      data: trendStats.map(s => s.month || ''),
      axisLabel: { rotate: 30 },
    },
    yAxis: [
      { type: 'value' as const, name: '合同数', position: 'left' as const },
      { type: 'value' as const, name: '金额(万)', position: 'right' as const },
    ],
    series: [
      {
        name: '合同数',
        type: 'bar',
        data: trendStats.map(s => s.count),
        itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '金额(万)',
        type: 'line',
        yAxisIndex: 1,
        data: trendStats.map(s => Math.round((s.total_amount || 0) / 10000)),
        itemStyle: { color: '#52c41a' },
        smooth: true,
      },
    ],
    grid: { left: 50, right: 60, bottom: 60, top: 30 },
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/contracts')}>
            <Statistic
              title="合同总数"
              value={stats?.total || 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/contracts/new')}>
            <Statistic
              title="本月新增"
              value={stats?.thisMonth || 0}
              prefix={<PlusCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/reminders')}>
            <Statistic
              title="即将到期 (30天)"
              value={stats?.expiringSoon || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="执行中合同金额"
              value={stats?.totalAmount || 0}
              precision={2}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#722ed1' }}
              formatter={(val) => `¥ ${Number(val).toLocaleString()}`}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title="合同类型分布" style={{ height: 380 }}>
            <ReactECharts option={statusPieOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="月度趋势" style={{ height: 380 }}>
            <ReactECharts option={trendBarOption} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      <Card title="近期待处理提醒" style={{ marginTop: 16 }}>
        <List
          dataSource={reminders.slice(0, 5)}
          locale={{ emptyText: '暂无待处理提醒' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <a key="view" onClick={() => navigate(`/contracts/${item.contract_id}`)}>查看合同</a>,
              ]}
            >
              <List.Item.Meta
                avatar={<ClockCircleOutlined style={{ fontSize: 20, color: '#faad14' }} />}
                title={
                  <span>
                    {item.contract_title}
                    <Tag color="warning" style={{ marginLeft: 8 }}>{item.remind_date}</Tag>
                  </span>
                }
                description={item.message}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
