import React, { useEffect, useState } from 'react';
import {
  Card, Descriptions, Tag, Button, Space, Timeline, Spin,
  Row, Col, Statistic, Popconfirm, message, Divider,
  Upload, Table, Modal, Form, InputNumber, DatePicker, Input,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined,
  ClockCircleOutlined, CheckCircleOutlined,
  PaperClipOutlined, DownloadOutlined, EyeOutlined,
  UploadOutlined, InboxOutlined, DollarOutlined, PlusOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import type { Contract, ContractLog, ContractStatus, Payment, PaymentSummary } from '../types';
import { STATUS_COLORS } from '../types';

interface Attachment {
  id: number;
  contract_id: number;
  original_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

const ContractDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<Contract | null>(null);
  const [logs, setLogs] = useState<ContractLog[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentForm] = Form.useForm();
  const [paymentAttachmentFile, setPaymentAttachmentFile] = useState<File | null>(null);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const contractId = Number(id);
      const [c, l, a, p, ps] = await Promise.all([
        window.api.getContractById(contractId),
        window.api.getLogsByContract(contractId),
        window.api.getAttachments(contractId),
        window.api.getPaymentsByContract(contractId),
        window.api.getPaymentSummary(contractId),
      ]);
      setContract(c);
      setLogs(l);
      setAttachments(a);
      setPayments(p);
      setPaymentSummary(ps);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!contract) return;
    await window.api.deleteContract(contract.id);
    message.success('删除成功');
    navigate('/contracts');
  };

  const handleStatusChange = async (newStatus: ContractStatus) => {
    if (!contract) return;
    await window.api.updateContract(contract.id, { ...contract, status: newStatus });
    message.success('状态已更新');
    loadData();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') {
      return <PaperClipOutlined style={{ color: '#f5222d', fontSize: 18 }} />;
    }
    if (mimeType.startsWith('image/')) {
      return <EyeOutlined style={{ color: '#1890ff', fontSize: 18 }} />;
    }
    return <PaperClipOutlined style={{ color: '#8c8c8c', fontSize: 18 }} />;
  };

  const loadAttachments = async () => {
    try {
      const a = await window.api.getAttachments(Number(id));
      setAttachments(a);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    try {
      await window.api.uploadAttachments(Number(id), fileList);
      message.success('上传成功');
      await loadAttachments();
    } catch (e) {
      console.error(e);
      message.error('上传失败');
    }
    setUploading(false);
  };

  const handlePreview = (attachmentId: number) => {
    const url = window.api.getAttachmentPreviewUrl(attachmentId);
    window.open(url, '_blank');
  };

  const handleDownload = async (attachmentId: number) => {
    const url = await window.api.getAttachmentDownloadUrl(attachmentId);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    try {
      await window.api.deleteAttachment(attachmentId);
      message.success('附件已删除');
      await loadAttachments();
    } catch (e) {
      console.error(e);
      message.error('删除失败');
    }
  };

  const loadPayments = async () => {
    try {
      const contractId = Number(id);
      const [p, ps] = await Promise.all([
        window.api.getPaymentsByContract(contractId),
        window.api.getPaymentSummary(contractId),
      ]);
      setPayments(p);
      setPaymentSummary(ps);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenPaymentModal = (payment?: Payment) => {
    if (payment) {
      setEditingPayment(payment);
      paymentForm.setFieldsValue({
        amount: payment.amount,
        payment_date: payment.payment_date,
        description: payment.description,
      });
    } else {
      setEditingPayment(null);
      paymentForm.resetFields();
    }
    setPaymentAttachmentFile(null);
    setPaymentModalVisible(true);
  };

  const handleSavePayment = async () => {
    try {
      const values = await paymentForm.validateFields();
      const contractId = Number(id);
      let paymentId: number;

      if (editingPayment) {
        await window.api.updatePayment(editingPayment.id, values);
        paymentId = editingPayment.id;
        message.success('记录已更新');
      } else {
        const result = await window.api.createPayment(contractId, values);
        paymentId = result.id;
        message.success('记录已添加');
      }

      // 上传附件（如果有）
      if (paymentAttachmentFile) {
        await window.api.uploadPaymentAttachment(paymentId, paymentAttachmentFile);
      }

      setPaymentModalVisible(false);
      paymentForm.resetFields();
      setPaymentAttachmentFile(null);
      await loadPayments();
    } catch (e: any) {
      if (e.errorFields) return; // form validation error
      console.error(e);
      message.error('操作失败');
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    try {
      await window.api.deletePayment(paymentId);
      message.success('记录已删除');
      await loadPayments();
    } catch (e) {
      console.error(e);
      message.error('删除失败');
    }
  };

  const paymentColumns = [
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 140,
      render: (amount: number, record: Payment) => (
        <span style={{ color: record.status === '已付' ? '#52c41a' : '#faad14' }}>
          ¥{amount?.toFixed(2)}
        </span>
      ),
    },
    {
      title: '发生日期',
      dataIndex: 'payment_date',
      key: 'payment_date',
      width: 120,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          '已付': 'green',
          '待付': 'orange',
        };
        return <Tag color={colorMap[status] || 'default'}>{status}</Tag>;
      },
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '附件',
      dataIndex: 'attachment_name',
      key: 'attachment',
      width: 150,
      render: (name: string, record: Payment) => {
        if (!name) return <span style={{ color: '#999' }}>-</span>;
        return (
          <Space>
            <PaperClipOutlined />
            <a
              href={`/api/attachments/${record.attachment}/download`}
              target="_blank"
              rel="noopener noreferrer"
              title={name}
            >
              {name.length > 15 ? name.substring(0, 15) + '...' : name}
            </a>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: Payment) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenPaymentModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除此记录？"
            onConfirm={() => handleDeletePayment(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const attachmentColumns = [
    {
      title: '文件名',
      dataIndex: 'original_name',
      key: 'original_name',
      render: (name: string, record: Attachment) => (
        <Space>
          {getFileIcon(record.mime_type)}
          <span>{name}</span>
        </Space>
      ),
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 120,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_: unknown, record: Attachment) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handlePreview(record.id)}
          >
            预览
          </Button>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record.id)}
          >
            下载
          </Button>
          <Popconfirm
            title="确认删除此附件？"
            onConfirm={() => handleDeleteAttachment(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (!contract) {
    return <Card>合同不存在</Card>;
  }

  const daysLeft = contract.end_date
    ? Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div>
      <Card
        title={
          <Space>
            <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/contracts')} />
            <span>{contract.title}</span>
            <Tag color={STATUS_COLORS[contract.status as ContractStatus]}>{contract.status}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<EditOutlined />}
              type="primary"
              onClick={() => navigate(`/contracts/${contract.id}/edit`)}
            >
              编辑
            </Button>
            <Popconfirm title="确认删除此合同？" onConfirm={handleDelete} okText="确认" cancelText="取消">
              <Button danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </Space>
        }
      >
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Statistic title="合同金额" value={contract.amount || 0} precision={2} prefix="¥" />
          </Col>
          <Col span={6}>
            <Statistic
              title="距到期天数"
              value={daysLeft ?? '-'}
              valueStyle={{
                color: daysLeft !== null
                  ? daysLeft <= 0 ? '#f5222d' : daysLeft <= 30 ? '#faad14' : '#52c41a'
                  : undefined,
              }}
              suffix={daysLeft !== null ? '天' : ''}
            />
          </Col>
          <Col span={6}>
            <Statistic title="签订日期" value={contract.sign_date || '-'} />
          </Col>
          <Col span={6}>
            <Statistic title="所属部门" value={contract.department || '-'} />
          </Col>
        </Row>

        <Divider />

        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="合同编号">{contract.contract_no}</Descriptions.Item>
          <Descriptions.Item label="合同类型">{contract.type}</Descriptions.Item>
          <Descriptions.Item label="甲方">{contract.party_a}</Descriptions.Item>
          <Descriptions.Item label="乙方">{contract.party_b}</Descriptions.Item>
          <Descriptions.Item label="币种">{contract.currency}</Descriptions.Item>
          <Descriptions.Item label="负责人">{contract.person_in_charge || '-'}</Descriptions.Item>
          <Descriptions.Item label="生效日期">{contract.start_date || '-'}</Descriptions.Item>
          <Descriptions.Item label="到期日期">{contract.end_date || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{contract.created_at}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{contract.updated_at}</Descriptions.Item>
          <Descriptions.Item label="合同摘要" span={2}>
            {contract.description || '暂无描述'}
          </Descriptions.Item>
        </Descriptions>

        {contract.status === '执行中' && (
          <div style={{ marginTop: 16 }}>
            <Space>
              <span>快速操作：</span>
              <Button size="small" onClick={() => handleStatusChange('已终止')}>终止合同</Button>
              <Button size="small" onClick={() => handleStatusChange('已续签')}>标记续签</Button>
              {daysLeft !== null && daysLeft <= 0 && (
                <Button size="small" type="primary" onClick={() => handleStatusChange('已到期')}>
                  标记到期
                </Button>
              )}
            </Space>
          </div>
        )}
      </Card>

      <Card
        title="费用发生记录"
        style={{ marginTop: 16 }}
        extra={
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => handleOpenPaymentModal()}>
            添加记录
          </Button>
        }
      >
        {paymentSummary && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Statistic
                title="合同金额"
                value={paymentSummary.contractAmount || 0}
                precision={2}
                prefix="¥"
                valueStyle={{ color: paymentSummary.contractAmount ? '#1677ff' : '#999' }}
                suffix={!paymentSummary.contractAmount ? '(无固定金额)' : ''}
              />
            </Col>
            <Col span={8}>
              <Statistic title="已发生金额" value={paymentSummary.occurredAmount || 0} precision={2} prefix="¥" valueStyle={{ color: '#52c41a' }} />
            </Col>
            <Col span={8}>
              <Statistic
                title="待发生金额"
                value={paymentSummary.pendingAmount ?? '-'}
                precision={paymentSummary.pendingAmount !== null ? 2 : 0}
                prefix={paymentSummary.pendingAmount !== null ? '¥' : ''}
                valueStyle={{ color: paymentSummary.pendingAmount !== null ? '#faad14' : '#999' }}
              />
            </Col>
          </Row>
        )}
        <Table
          dataSource={payments}
          columns={paymentColumns}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无费用记录' }}
        />
      </Card>

      <Modal
        title={editingPayment ? '编辑费用记录' : '添加费用记录'}
        open={paymentModalVisible}
        onOk={handleSavePayment}
        onCancel={() => { setPaymentModalVisible(false); paymentForm.resetFields(); }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={paymentForm} layout="vertical">
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="请输入金额" />
          </Form.Item>
          <Form.Item name="payment_date" label="发生日期" rules={[{ required: true, message: '请输入日期' }]}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} placeholder="备注说明（可选）" />
          </Form.Item>
          <Form.Item label="附件（如付款凭证）">
            <Upload
              beforeUpload={(file) => {
                setPaymentAttachmentFile(file);
                return false;
              }}
              maxCount={1}
              onRemove={() => {
                setPaymentAttachmentFile(null);
              }}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Card
        title="合同附件"
        style={{ marginTop: 16 }}
        extra={
          <Upload
            multiple
            showUploadList={false}
            beforeUpload={(file, fileList) => {
              // Only trigger upload once for the first file in the batch
              if (file === fileList[0]) {
                const dt = new DataTransfer();
                fileList.forEach(f => dt.items.add(f));
                handleUpload(dt.files);
              }
              return false; // prevent default upload
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploading}>
              上传附件
            </Button>
          </Upload>
        }
      >
        <Upload.Dragger
          multiple
          showUploadList={false}
          beforeUpload={(file, fileList) => {
            if (file === fileList[0]) {
              const dt = new DataTransfer();
              fileList.forEach(f => dt.items.add(f));
              handleUpload(dt.files);
            }
            return false;
          }}
          disabled={uploading}
          style={{ marginBottom: 16 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">支持单个或批量上传，上传后自动关联到当前合同</p>
        </Upload.Dragger>

        <Table
          dataSource={attachments}
          columns={attachmentColumns}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无附件' }}
        />
      </Card>

      <Card title="操作记录" style={{ marginTop: 16 }}>
        <Timeline
          items={logs.map(log => ({
            color: log.action === '创建' ? 'green' : log.action === '更新' ? 'blue' : 'gray',
            dot: log.action === '创建' ? <CheckCircleOutlined /> : <ClockCircleOutlined />,
            children: (
              <div>
                <div>
                  <Tag>{log.action}</Tag>
                  {log.detail}
                </div>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {log.operator} · {log.created_at}
                </div>
              </div>
            ),
          }))}
        />
        {logs.length === 0 && <div style={{ color: '#999', textAlign: 'center' }}>暂无操作记录</div>}
      </Card>
    </div>
  );
};

export default ContractDetail;
