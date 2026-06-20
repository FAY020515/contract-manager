import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Input, Select, Space, Tag, Card, Row, Col,
  Modal, message, Popconfirm, Tooltip, DatePicker, Upload,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, ExportOutlined, ReloadOutlined, PaperClipOutlined,
  ImportOutlined, DownloadOutlined, InboxOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Contract, ContractStatus } from '../types';
import { CONTRACT_STATUSES, STATUS_COLORS } from '../types';

const { RangePicker } = DatePicker;

const ContractList: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState<{
    type?: string;
    status?: string;
    department?: string;
    dateRange?: [string, string];
  }>({});
  const [types, setTypes] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{success: number; failed: number; errors: {row: number; error: string}[]} | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.getContracts({
        keyword,
        ...filters,
        startDate: filters.dateRange?.[0],
        endDate: filters.dateRange?.[1],
        page,
        pageSize,
      });
      setData(result.data);
      setTotal(result.total);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [keyword, filters, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    window.api.getAllSettings().then(s => {
      setTypes(s.contract_types || []);
      setDepartments(s.departments || []);
    });
  }, []);

  const handleDelete = async (id: number) => {
    await window.api.deleteContract(id);
    message.success('删除成功');
    loadData();
  };

  const handleExport = async () => {
    try {
      const XLSX = await import('xlsx');
      const allData = await window.api.getContracts({ pageSize: 99999 });
      const ws = XLSX.utils.json_to_sheet(allData.data.map(c => ({
        '合同编号': c.contract_no,
        '合同名称': c.title,
        '类型': c.type,
        '甲方': c.party_a,
        '乙方': c.party_b,
        '金额': c.amount,
        '签订日期': c.sign_date,
        '生效日期': c.start_date,
        '到期日期': c.end_date,
        '状态': c.status,
        '部门': c.department,
        '负责人': c.person_in_charge,
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '合同列表');
      XLSX.writeFile(wb, `合同列表_${dayjs().format('YYYYMMDD')}.xlsx`);
      message.success('导出成功');
    } catch (e) {
      message.error('导出失败');
    }
  };

  // Excel 列映射
  const COLUMN_MAP: Record<string, string> = {
    '合同编号': 'contract_no', '合同名称': 'title', '合同类型': 'type',
    '甲方': 'party_a', '乙方': 'party_b', '合同金额': 'amount',
    '币种': 'currency', '签订日期': 'sign_date', '生效日期': 'start_date',
    '到期日期': 'end_date', '状态': 'status', '所属部门': 'department',
    '负责人': 'person_in_charge', '合同摘要': 'description',
  };

  const handleImportFile = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.sheets[workbook.sheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
      if (rows.length === 0) {
        message.warning('Excel 文件中没有数据');
        return false;
      }
      setImportPreview(rows);
      setImportResult(null);
    } catch (e) {
      message.error('文件解析失败，请确保是有效的 Excel 文件');
    }
    return false; // prevent auto-upload
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const result = await window.api.importContracts(importPreview);
      setImportResult(result);
      if (result.success > 0) {
        message.success(`成功导入 ${result.success} 条合同`);
        loadData();
      }
      if (result.failed === 0) {
        setImportModalVisible(false);
        setImportPreview(null);
      }
    } catch (e: any) {
      message.error(e?.message || '导入失败');
    }
    setImporting(false);
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const headers = ['合同编号', '合同名称', '合同类型', '甲方', '乙方', '合同金额', '币种', '签订日期', '生效日期', '到期日期', '状态', '所属部门', '负责人', '合同摘要'];
    const example = ['HT-2024-001', '示例采购合同', '采购', 'XX公司', 'YY公司', 100000, 'CNY', '2024-01-01', '2024-01-15', '2025-01-14', '执行中', '采购部', '张三', '办公设备采购'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = headers.map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '合同导入模板');
    XLSX.writeFile(wb, '合同导入模板.xlsx');
  };

  const resetImport = () => {
    setImportPreview(null);
    setImportResult(null);
    setImportModalVisible(false);
  };

  const columns = [
    {
      title: '合同编号',
      dataIndex: 'contract_no',
      width: 130,
      ellipsis: true,
    },
    {
      title: '合同名称',
      dataIndex: 'title',
      width: 200,
      ellipsis: true,
      render: (text: string, record: Contract) => (
        <a onClick={() => navigate(`/contracts/${record.id}`)}>{text}</a>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: '甲方',
      dataIndex: 'party_a',
      width: 140,
      ellipsis: true,
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 120,
      align: 'right' as const,
      render: (val: number, record: Contract) =>
        val ? `¥${val.toLocaleString()}` : '-',
    },
    {
      title: '到期日期',
      dataIndex: 'end_date',
      width: 110,
      render: (text: string) => {
        if (!text) return '-';
        const isSoon = dayjs(text).diff(dayjs(), 'day') <= 30 && dayjs(text).isAfter(dayjs());
        const isExpired = dayjs(text).isBefore(dayjs());
        return (
          <span style={{
            color: isExpired ? '#f5222d' : isSoon ? '#faad14' : 'inherit',
            fontWeight: isSoon || isExpired ? 600 : 400,
          }}>
            {text}
          </span>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: ContractStatus) => (
        <Tag color={STATUS_COLORS[status]}>{status}</Tag>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'person_in_charge',
      width: 90,
      ellipsis: true,
    },
    {
      title: '附件',
      dataIndex: 'attachment_count',
      width: 80,
      align: 'center' as const,
      render: (count: number) =>
        count > 0 ? (
          <span><PaperClipOutlined style={{ marginRight: 4 }} />{count}</span>
        ) : (
          '-'
        ),
    },
    {
      title: '操作',
      width: 150,
      render: (_: any, record: Contract) => (
        <Space size="small">
          <Tooltip title="查看">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/contracts/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/contracts/${record.id}/edit`)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除此合同？"
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col flex="auto">
            <Space wrap>
              <Input
                placeholder="搜索合同编号/名称/甲乙方"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onPressEnter={() => { setPage(1); loadData(); }}
                style={{ width: 260 }}
                allowClear
              />
              <Select
                placeholder="合同类型"
                value={filters.type}
                onChange={v => setFilters({ ...filters, type: v })}
                allowClear
                style={{ width: 120 }}
                options={types.map(t => ({ label: t, value: t }))}
              />
              <Select
                placeholder="状态"
                value={filters.status}
                onChange={v => setFilters({ ...filters, status: v })}
                allowClear
                style={{ width: 100 }}
                options={CONTRACT_STATUSES.map(s => ({ label: s, value: s }))}
              />
              <Select
                placeholder="部门"
                value={filters.department}
                onChange={v => setFilters({ ...filters, department: v })}
                allowClear
                style={{ width: 120 }}
                options={departments.map(d => ({ label: d, value: d }))}
              />
              <RangePicker
                onChange={(dates) => {
                  setFilters({
                    ...filters,
                    dateRange: dates
                      ? [dates[0]!.format('YYYY-MM-DD'), dates[1]!.format('YYYY-MM-DD')]
                      : undefined,
                  });
                }}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => { setPage(1); loadData(); }}>
                刷新
              </Button>
              <Button icon={<ExportOutlined />} onClick={handleExport}>
                导出
              </Button>
              <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>
                导入
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/contracts/new')}
              >
                新增合同
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
        />
      </Card>

      <Modal
        title="Excel 批量导入合同"
        open={importModalVisible}
        onCancel={resetImport}
        width={800}
        footer={
          importPreview && !importResult ? [
            <Button key="cancel" onClick={resetImport}>取消</Button>,
            <Button key="confirm" type="primary" loading={importing} onClick={handleConfirmImport}>
              确认导入 ({importPreview.length} 条)
            </Button>,
          ] : importResult ? [
            <Button key="close" type="primary" onClick={resetImport}>完成</Button>,
          ] : null
        }
      >
        {!importPreview ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 16 }}>
              <Button type="link" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
                下载导入模板
              </Button>
              <span style={{ color: '#999', marginLeft: 8 }}>请先按模板格式填写 Excel</span>
            </p>
            <Upload.Dragger
              accept=".xlsx,.xls,.csv"
              beforeUpload={handleImportFile}
              showUploadList={false}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽 Excel 文件到此处</p>
              <p className="ant-upload-hint">支持 .xlsx、.xls、.csv 格式</p>
            </Upload.Dragger>
          </div>
        ) : (
          <div>
            {importResult && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 6, background: importResult.failed === 0 ? '#f6ffed' : '#fff7e6' }}>
                <p>导入完成：成功 <strong style={{ color: '#52c41a' }}>{importResult.success}</strong> 条
                  {importResult.failed > 0 && <>，失败 <strong style={{ color: '#f5222d' }}>{importResult.failed}</strong> 条</>}
                </p>
                {importResult.errors.length > 0 && (
                  <div style={{ maxHeight: 120, overflow: 'auto', fontSize: 12, color: '#f5222d' }}>
                    {importResult.errors.map((e, i) => (
                      <div key={i}>第 {e.row} 行：{e.error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p style={{ marginBottom: 8, color: '#666' }}>
              预览（共 {importPreview.length} 条数据）：
            </p>
            <Table
              size="small"
              dataSource={importPreview.slice(0, 20)}
              scroll={{ x: 800, y: 300 }}
              pagination={false}
              columns={[
                { title: '合同名称', dataIndex: '合同名称', width: 150, ellipsis: true,
                  render: (_, r) => r['合同名称'] || r.title || <span style={{color:'red'}}>缺少</span> },
                { title: '合同编号', dataIndex: '合同编号', width: 120,
                  render: (_, r) => r['合同编号'] || r.contract_no || '-' },
                { title: '类型', width: 80,
                  render: (_, r) => r['合同类型'] || r.type || '-' },
                { title: '甲方', width: 120, ellipsis: true,
                  render: (_, r) => r['甲方'] || r.party_a || '-' },
                { title: '金额', width: 100,
                  render: (_, r) => r['合同金额'] || r.amount || '-' },
              ]}
            />
            {importPreview.length > 20 && (
              <p style={{ color: '#999', fontSize: 12, marginTop: 4 }}>仅预览前 20 条</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ContractList;
