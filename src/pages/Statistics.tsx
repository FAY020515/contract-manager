import React, { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Button, message, Spin, Modal, Table, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { StatItem, Contract } from '../types';
import * as XLSX from 'xlsx';
import { STATUS_COLORS } from '../types';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

const Statistics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [typeStats, setTypeStats] = useState<StatItem[]>([]);
  const [deptStats, setDeptStats] = useState<StatItem[]>([]);
  const [trendStats, setTrendStats] = useState<StatItem[]>([]);
  const [amountStats, setAmountStats] = useState<StatItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContracts, setModalContracts] = useState<Contract[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const handleChartClick = useCallback(async (filterField: string, filterValue: string, title: string) => {
    setModalTitle(title);
    setModalVisible(true);
    setModalLoading(true);
    try {
      const filters: Record<string, string> = {};
      filters[filterField] = filterValue;
      const result = await window.api.getContracts({ ...filters, pageSize: 1000 });
      setModalContracts(result.data || []);
    } catch (e) {
      console.error(e);
      message.error('加载合同列表失败');
    }
    setModalLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [t, d, tr, a] = await Promise.all([
        window.api.getStatsByType(),
        window.api.getStatsByDepartment(),
        window.api.getMonthlyTrend(),
        window.api.getAmountDistribution(),
      ]);
      setTypeStats(t);
      setDeptStats(d);
      setTrendStats(tr);
      setAmountStats(a);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleExport = async () => {
    try {
      const wb = XLSX.utils.book_new();

      // Type stats
      const ws1 = XLSX.utils.json_to_sheet(typeStats.map(s => ({
        '合同类型': s.type,
        '合同数量': s.count,
        '总金额': s.total_amount,
      })));
      XLSX.utils.book_append_sheet(wb, ws1, '类型统计');

      // Department stats
      const ws2 = XLSX.utils.json_to_sheet(deptStats.map(s => ({
        '部门': s.department,
        '合同数量': s.count,
        '总金额': s.total_amount,
      })));
      XLSX.utils.book_append_sheet(wb, ws2, '部门统计');

      // Trend
      const ws3 = XLSX.utils.json_to_sheet(trendStats.map(s => ({
        '月份': s.month,
        '合同数量': s.count,
        '总金额': s.total_amount,
      })));
      XLSX.utils.book_append_sheet(wb, ws3, '月度趋势');

      // Amount distribution
      const ws4 = XLSX.utils.json_to_sheet(amountStats.map(s => ({
        '金额区间': s.range_name,
        '合同数量': s.count,
        '总金额': s.total_amount,
      })));
      XLSX.utils.book_append_sheet(wb, ws4, '金额分布');

      XLSX.writeFile(wb, `合同统计报表_${new Date().toISOString().slice(0, 10)}.xlsx`);
      message.success('导出成功');
    } catch (e) {
      message.error('导出失败');
    }
  };

  // Chart options
  const typePieOption = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c}个 ({d}%)' },
    legend: { bottom: 0, type: 'scroll' as const },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      center: ['50%', '45%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}\n{c}个' },
      data: typeStats.map((s, i) => ({
        name: s.type || '未知',
        value: s.count,
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    }],
  };

  const typeBarOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: {
      type: 'category' as const,
      data: typeStats.map(s => s.type || '未知'),
    },
    yAxis: [
      { type: 'value' as const, name: '数量' },
      { type: 'value' as const, name: '金额(万)', position: 'right' as const },
    ],
    series: [
      {
        name: '数量',
        type: 'bar',
        data: typeStats.map(s => s.count),
        itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '金额(万)',
        type: 'bar',
        yAxisIndex: 1,
        data: typeStats.map(s => Math.round((s.total_amount || 0) / 10000)),
        itemStyle: { color: '#52c41a', borderRadius: [4, 4, 0, 0] },
      },
    ],
    grid: { left: 50, right: 60, bottom: 30, top: 30 },
  };

  const deptBarOption = {
    tooltip: { trigger: 'axis' as const },
    yAxis: {
      type: 'category' as const,
      data: deptStats.map(s => s.department || '未知'),
    },
    xAxis: { type: 'value' as const },
    series: [{
      type: 'bar',
      data: deptStats.map((s, i) => ({
        value: s.count,
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
      label: { show: true, position: 'right' as const },
      barWidth: 20,
    }],
    grid: { left: 100, right: 60, top: 10, bottom: 10 },
  };

  const trendOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: {
      type: 'category' as const,
      data: trendStats.map(s => s.month),
      axisLabel: { rotate: 30 },
    },
    yAxis: [
      { type: 'value' as const, name: '合同数' },
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
        itemStyle: { color: '#f5222d' },
        smooth: true,
        areaStyle: { color: 'rgba(245,34,45,0.08)' },
      },
    ],
    grid: { left: 50, right: 60, bottom: 60, top: 30 },
  };

  const amountPieOption = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c}个 ({d}%)' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: '60%',
      center: ['50%', '45%'],
      roseType: 'area',
      itemStyle: { borderRadius: 6 },
      data: amountStats.map((s, i) => ({
        name: s.range_name,
        value: s.count,
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    }],
  };

  const resolveType = (name: string) => {
    const stat = typeStats.find(s => (s.type || '未知') === name);
    if (!stat) return '';
    return stat.type || '未知';
  };
  const resolveDept = (name: string) => {
    const stat = deptStats.find(s => (s.department || '未知') === name);
    if (!stat) return '';
    return stat.department || '未知';
  };

  const parseAmountRange = (rangeName: string): Record<string, number> => {
    switch (rangeName) {
      case '1万以下': return { amountMax: 10000 };
      case '1-10万': return { amountMin: 10000, amountMax: 100000 };
      case '10-50万': return { amountMin: 100000, amountMax: 500000 };
      case '50-100万': return { amountMin: 500000, amountMax: 1000000 };
      case '100万以上': return { amountMin: 1000000 };
      default: return {};
    }
  };

  const onTypePieClick = useCallback((params: any) => {
    const type = resolveType(params.name);
    handleChartClick('type', type, `合同类型：${params.name}`);
  }, [typeStats, handleChartClick]);

  const onTypeBarClick = useCallback((params: any) => {
    const type = resolveType(params.name);
    handleChartClick('type', type, `合同类型：${params.name}`);
  }, [typeStats, handleChartClick]);

  const onDeptBarClick = useCallback((params: any) => {
    const dept = resolveDept(params.name);
    handleChartClick('department', dept, `部门：${params.name}`);
  }, [deptStats, handleChartClick]);

  const onAmountPieClick = useCallback(async (params: any) => {
    const range = parseAmountRange(params.name);
    setModalTitle(`金额区间：${params.name}`);
    setModalVisible(true);
    setModalLoading(true);
    try {
      const filters: Record<string, any> = { pageSize: 1000, ...range };
      const result = await window.api.getContracts(filters);
      setModalContracts(result.data || []);
    } catch (e) {
      console.error(e);
      message.error('加载合同列表失败');
    }
    setModalLoading(false);
  }, []);

  const onTrendClick = useCallback(async (params: any) => {
    if (!params.name) return;
    const month = params.name; // e.g. "2024-03"
    const startDate = `${month}-01`;
    const [year, mon] = month.split('-').map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
    setModalTitle(`月份：${month}`);
    setModalVisible(true);
    setModalLoading(true);
    try {
      const filters: Record<string, any> = { startDate, endDate, pageSize: 1000 };
      const result = await window.api.getContracts(filters);
      setModalContracts(result.data || []);
    } catch (e) {
      console.error(e);
      message.error('加载合同列表失败');
    }
    setModalLoading(false);
  }, []);

  const modalColumns = [
    { title: '合同编号', dataIndex: 'contract_no', key: 'contract_no', width: 120 },
    { title: '合同名称', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '类型', dataIndex: 'type', key: 'type', width: 100 },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120,
      render: (v: number) => v != null ? `¥${Number(v).toLocaleString()}` : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => <Tag color={STATUS_COLORS[s] || 'default'}>{s}</Tag> },
    { title: '部门', dataIndex: 'department', key: 'department', width: 100 },
    { title: '负责人', dataIndex: 'person_in_charge', key: 'person_in_charge', width: 90 },
    { title: '到期日', dataIndex: 'end_date', key: 'end_date', width: 110 },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <Card
        title="统计分析"
        extra={
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出报表
          </Button>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="合同类型分布（数量）" size="small">
              <ReactECharts option={typePieOption} style={{ height: 300 }}
                onEvents={{ click: onTypePieClick }} />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="合同类型对比（数量 vs 金额）" size="small">
              <ReactECharts option={typeBarOption} style={{ height: 300 }}
                onEvents={{ click: onTypeBarClick }} />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="部门合同分布" size="small">
              <ReactECharts option={deptBarOption} style={{ height: 300 }}
                onEvents={{ click: onDeptBarClick }} />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="金额区间分布" size="small">
              <ReactECharts option={amountPieOption} style={{ height: 300 }}
                onEvents={{ click: onAmountPieClick }} />
            </Card>
          </Col>
          <Col span={24}>
            <Card title="月度趋势（近12个月）" size="small">
              <ReactECharts option={trendOption} style={{ height: 350 }}
                onEvents={{ click: onTrendClick }} />
            </Card>
          </Col>
        </Row>
      </Card>

      <Modal
        title={modalTitle}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={960}
      >
        <Table
          dataSource={modalContracts}
          columns={modalColumns}
          rowKey="id"
          loading={modalLoading}
          size="small"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 800 }}
        />
      </Modal>
    </div>
  );
};

export default Statistics;
