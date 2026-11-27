import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Input, Select, Space, Tag, Card, Row, Col,
  Modal, message, Tooltip, DatePicker, Upload, Popover, Checkbox,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, ExportOutlined, ReloadOutlined, PaperClipOutlined,
  ImportOutlined, DownloadOutlined, InboxOutlined, SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Contract, ContractStatus } from '../types';
import { CONTRACT_STATUSES, STATUS_COLORS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';

const { RangePicker } = DatePicker;

const ContractList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [data, setData] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState<{
    type?: string;
    status?: string;
    department?: string;
    company?: string;
    dateRange?: [string, string];
  }>({});
  const [types, setTypes] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [companies, setCompanies] = useState<{ name: string; abbr: string }[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{success: number; failed: number; errors: {row: number; error: string}[]} | null>(null);

  // 列配置
  const ALL_COLUMNS = [
    { key: 'contract_no', title: '合同编号', defaultVisible: true },
    { key: 'title', title: '合同名称', defaultVisible: true },
    { key: 'type', title: '类型', defaultVisible: true },
    { key: 'company', title: '主体公司', defaultVisible: true },
    { key: 'party_a', title: '甲方', defaultVisible: true },
    { key: 'amount', title: '金额', defaultVisible: true },
    { key: 'occurred_amount', title: '已发生', defaultVisible: true },
    { key: 'end_date', title: '到期日期', defaultVisible: true },
    { key: 'status', title: '状态', defaultVisible: true },
    { key: 'person_in_charge', title: '负责人', defaultVisible: true },
    { key: 'attachment_count', title: '附件', defaultVisible: true },
    { key: 'last_operator', title: '最后修改人', defaultVisible: false },
    { key: 'last_updated_at', title: '最后修改时间', defaultVisible: false },
    { key: 'approval_status', title: '审批状态', defaultVisible: false },
  ];
  
  const [columnConfig, setColumnConfig] = useState<{ visible: string[]; order: string[] }>(() => {
    const saved = localStorage.getItem('contract_list_columns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return {
      visible: ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key),
      order: ALL_COLUMNS.map(c => c.key),
    };
  });

  useEffect(() => {
    localStorage.setItem('contract_list_columns', JSON.stringify(columnConfig));
  }, [columnConfig]);

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
      setCompanies(Array.isArray(s.companies) ? s.companies : []);
    });
  }, []);

  const openDelete = (record: Contract) => {
    setDeleteTarget(record);
    setDeleteInput('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const typed = deleteInput.trim();
    if (typed !== deleteTarget.contract_no) {
      message.error('输入的合同编号不一致，已取消删除');
      return;
    }
    try {
      await window.api.deleteContract(deleteTarget.id, typed);
      message.success('删除成功');
      setDeleteTarget(null);
      setDeleteInput('');
      loadData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleExport = async () => {
    try {
      const allData = await window.api.getContracts({ pageSize: 99999 });
      const ws = XLSX.utils.json_to_sheet(allData.data.map(c => ({
        '合同编号': c.contract_no,
        '合同名称': c.title,
        '类型': c.type,
        '所属公司': c.company || '',
        '甲方': c.party_a,
        '乙方': c.party_b,
        '金额': c.amount,
        '签订日期': c.sign_date,
        '生效日期': c.start_date,
        '到期日期': c.end_date,
        '状态': c.status,
        '审批状态': c.approval_status || '未审批',
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
    '到期日期': 'end_date', '状态': 'status', '所属部门': 'department', '所属公司': 'company',
    '负责人': 'person_in_charge', '合同摘要': 'description',
  };

  const handleImportFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const readSheet = (codepage: number) => {
        const wb = XLSX.read(data, { codepage });
        return XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]]);
      };
      const hasKeyHeaders = (rows: Record<string, any>[]) =>
        rows.length > 0 && ['合同名称', 'title', '合同编号', 'contract_no'].some(k => k in (rows[0] || {}));

      // CSV 的中文表头编码不固定：Excel 另存可能是 GBK，其他来源多是 UTF-8。
      // 先按 UTF-8 读，表头认不出来再按 GBK 读一次（对 .xlsx 无影响）。
      let rows = readSheet(65001);
      if (!hasKeyHeaders(rows)) {
        const gbkRows = readSheet(936);
        if (hasKeyHeaders(gbkRows)) rows = gbkRows;
      }

      if (rows.length === 0) {
        message.warning('Excel 文件中没有数据');
        return false;
      }
      // 表头对不上时直接说清楚，避免每一行都报"合同名称不能为空"
      const first = rows[0] || {};
      if (!('合同名称' in first) && !('title' in first)) {
        message.error('未找到「合同名称」列：请检查表头，或点下方「下载导入模板」参照填写');
        return false;
      }
      setImportPreview(rows);
      setImportResult(null);
    } catch (e) {
      console.error('Excel 解析错误:', e);
      message.error('文件解析失败，请确保是有效的 Excel 文件');
    }
    return false;
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
    const sampleCompany = companies.length ? companies[0].name : '示例公司';
    const headers = ['合同编号', '合同名称', '合同类型', '所属公司', '甲方', '乙方', '合同金额', '币种', '签订日期', '生效日期', '到期日期', '状态', '所属部门', '负责人', '合同摘要'];
    const example1 = ['HT-2026-001', '示例：办公设备采购合同', '采购', sampleCompany, '甲公司', '乙公司', 8000, 'CNY', '2026-01-05', '2026-01-10', '2027-01-04', '执行中', '采购部', '张三', '示例行，导入前请删除或改写'];
    const example2 = ['HT-2026-002', '示例：年度审计服务合同', '服务', sampleCompany, '丙公司', '', 12000, 'CNY', '2026-02-01', '', '2027-01-31', '草稿', '财务审计部', '李四', ''];
    const ws = XLSX.utils.aoa_to_sheet([headers, example1, example2]);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '合同');

    const notes = [
      ['填写说明'],
      ['1. 表头不要改名；「合同名称」列必须保留，其余列可以留空或整列删除。'],
      ['2. 合同名称必填；合同编号不能重复，留空表示不填编号。'],
      ['3. 日期写成 2026-01-05 或 2026/1/5 都行，Excel 日期格式也能识别。'],
      ['4. 金额只填数字，可带千分位和"元"（如 8,000 元），不要写"约8000"或负数。'],
      ['5. 合同类型与状态若填写，请与「系统设置」里的名称一致（例如 采购 / 执行中）。'],
      ['6. 「所属公司」请填「系统设置 → 公司管理」里的公司名称，留空则该合同显示"未指定"。'],
      ['7. 示例两行导入前请删除或改写，否则会作为真实合同导入。'],
      ['8. 导入完成后界面会逐行列出失败原因，按提示改好再导一次即可。'],
    ];
    const wsNotes = XLSX.utils.aoa_to_sheet(notes);
    wsNotes['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsNotes, '填写说明');

    XLSX.writeFile(wb, '合同导入模板.xlsx');
  };

  const resetImport = () => {
    setImportPreview(null);
    setImportResult(null);
    setImportModalVisible(false);
  };

  const columnDefs: Record<string, any> = {
    contract_no: {
      title: '合同编号',
      dataIndex: 'contract_no',
      width: 130,
      ellipsis: true,
    },
    title: {
      title: '合同名称',
      dataIndex: 'title',
      width: 200,
      ellipsis: true,
      render: (text: string, record: Contract) => (
        <a onClick={() => navigate(`/contracts/${record.id}`)}>{text}</a>
      ),
    },
    type: {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (text: string) => <Tag>{text}</Tag>,
    },
    company: {
      title: '主体公司',
      dataIndex: 'company',
      width: 140,
      ellipsis: true,
      render: (v: string) => v || <span style={{ color: '#bbb' }}>未指定</span>,
    },
    party_a: {
      title: '甲方',
      dataIndex: 'party_a',
      width: 140,
      ellipsis: true,
    },
    amount: {
      title: '金额',
      dataIndex: 'amount',
      width: 120,
      align: 'right' as const,
      render: (val: number) =>
        val ? `¥${val.toLocaleString()}` : '-',
    },
    occurred_amount: {
      title: '已发生',
      dataIndex: 'occurred_amount',
      width: 120,
      align: 'right' as const,
      render: (val: number) =>
        val ? `¥${val.toLocaleString()}` : '-',
    },
    end_date: {
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
    status: {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: ContractStatus) => (
        <Tag color={STATUS_COLORS[status]}>{status}</Tag>
      ),
    },
    person_in_charge: {
      title: '负责人',
      dataIndex: 'person_in_charge',
      width: 90,
      ellipsis: true,
    },
    attachment_count: {
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
    last_operator: {
      title: '最后修改人',
      dataIndex: 'last_operator',
      width: 100,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    last_updated_at: {
      title: '最后修改时间',
      dataIndex: 'last_updated_at',
      width: 150,
      render: (v: string) => v || '-',
    },
    approval_status: {
      title: '审批状态',
      dataIndex: 'approval_status',
      width: 100,
      render: (v: string) => (
        <Tag color={v === '已用印' ? 'green' : v === '已批准' ? 'blue' : v === '审核中' ? 'orange' : 'default'}>
          {v || '未审批'}
        </Tag>
      ),
    },
  };

  // 根据配置生成可见列
  const columns = [
    ...columnConfig.order
      .filter(key => columnConfig.visible.includes(key) && columnDefs[key])
      .map(key => columnDefs[key]),
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
          {isAdmin && (
            <Tooltip title="删除合同（需输入合同编号确认）">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => openDelete(record)} />
            </Tooltip>
          )}
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
                placeholder="主体公司"
                value={filters.company}
                onChange={v => setFilters({ ...filters, company: v })}
                allowClear
                style={{ width: 150 }}
                options={companies.map(c => ({ label: c.name, value: c.name }))}
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
              <Popover
                content={
                  <div style={{ width: 220 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 12, color: '#666' }}>
                      勾选显示列，拖拽调整顺序
                    </div>
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                      {columnConfig.order.map((key, index) => {
                        const col = ALL_COLUMNS.find(c => c.key === key);
                        if (!col) return null;
                        return (
                          <div
                            key={key}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', index.toString());
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                              const toIndex = index;
                              if (fromIndex === toIndex) return;
                              
                              const newOrder = [...columnConfig.order];
                              const [removed] = newOrder.splice(fromIndex, 1);
                              newOrder.splice(toIndex, 0, removed);
                              setColumnConfig({ ...columnConfig, order: newOrder });
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 8px',
                              cursor: 'move',
                              borderRadius: 4,
                              transition: 'background-color 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f5f5f5';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <span style={{ marginRight: 8, color: '#999', fontSize: 12 }}>⋮⋮</span>
                            <Checkbox
                              checked={columnConfig.visible.includes(key)}
                              onChange={(e) => {
                                const newVisible = e.target.checked
                                  ? [...columnConfig.visible, key]
                                  : columnConfig.visible.filter(k => k !== key);
                                setColumnConfig({ ...columnConfig, visible: newVisible });
                              }}
                              style={{ flex: 1 }}
                            >
                              {col.title}
                            </Checkbox>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                      <Button
                        size="small"
                        block
                        onClick={() => {
                          setColumnConfig({
                            visible: ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key),
                            order: ALL_COLUMNS.map(c => c.key),
                          });
                        }}
                      >
                        重置默认
                      </Button>
                    </div>
                  </div>
                }
                trigger="click"
                placement="bottomRight"
              >
                <Button icon={<SettingOutlined />} />
              </Popover>
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

      <Modal
        title="删除合同"
        open={!!deleteTarget}
        onCancel={() => { setDeleteTarget(null); setDeleteInput(''); }}
        onOk={confirmDelete}
        okText="确认删除"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        destroyOnClose
      >
        <p style={{ marginBottom: 8 }}>
          将删除合同 <b>{deleteTarget?.contract_no} · {deleteTarget?.title}</b>，
          并连带删除它的附件与全部操作日志，<b>不可恢复</b>（备份里的历史副本不受影响）。
        </p>
        <p style={{ marginBottom: 8, color: '#666' }}>请输入该合同的编号以确认：</p>
        <Input
          value={deleteInput}
          onChange={e => setDeleteInput(e.target.value)}
          placeholder={deleteTarget?.contract_no}
          onPressEnter={confirmDelete}
        />
      </Modal>
    </div>
  );
};

export default ContractList;
