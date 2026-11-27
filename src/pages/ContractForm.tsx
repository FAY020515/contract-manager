import React, { useEffect, useState } from 'react';
import {
  Form, Input, InputNumber, Select, DatePicker, Button, Card, Row, Col,
  message, Space, Divider, Upload,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, InboxOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Contract } from '../types';
import { CONTRACT_STATUSES } from '../types';
import type { UploadFile } from 'antd/es/upload/interface';

const { TextArea } = Input;
const { RangePicker } = DatePicker;
const { Dragger } = Upload;

const ContractForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [companies, setCompanies] = useState<{ name: string; abbr: string }[]>([]);
  const [numberTouched, setNumberTouched] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    window.api.getAllSettings().then(s => {
      setTypes(s.contract_types || []);
      setDepartments(s.departments || []);
      const comps = Array.isArray(s.companies) ? s.companies : [];
      setCompanies(comps);
      // 新建且只维护了一家公司时，直接带出该公司与推荐编号
      if (!isEdit && comps.length === 1) {
        form.setFieldsValue({ company: comps[0].name });
        window.api.getNextContractNo(comps[0].name)
          .then(r => form.setFieldsValue({ contract_no: r.contract_no }))
          .catch(() => {});
      }
    });
  }, [form, isEdit]);

  // 选了主体公司且编号没被手工改过 → 自动带出该前缀的下一个编号
  const handleCompanyChange = async (company?: string) => {
    if (isEdit || numberTouched || !company) return;
    try {
      const r = await window.api.getNextContractNo(company);
      form.setFieldsValue({ contract_no: r.contract_no });
    } catch (_) { /* 拿不到就让用户自己填 */ }
  };

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      window.api.getContractById(Number(id)).then((contract) => {
        if (contract) {
          form.setFieldsValue({
            ...contract,
            amount: contract.amount || undefined,
            validityPeriod: contract.start_date && contract.end_date
              ? [dayjs(contract.start_date), dayjs(contract.end_date)]
              : undefined,
            sign_date: contract.sign_date ? dayjs(contract.sign_date) : undefined,
          });
        }
        setLoading(false);
      });
    }
  }, [id, isEdit, form]);

  const handleSubmit = async (values: any) => {
    setSaving(true);
    try {
      const contractData = {
        ...values,
        start_date: values.validityPeriod?.[0]?.format('YYYY-MM-DD') || null,
        end_date: values.validityPeriod?.[1]?.format('YYYY-MM-DD') || null,
        sign_date: values.sign_date?.format('YYYY-MM-DD') || null,
        validityPeriod: undefined,
      };

      if (isEdit) {
        await window.api.updateContract(Number(id), contractData);
        message.success('合同更新成功');
        navigate(`/contracts/${id}`);
      } else {
        const contract = await window.api.createContract(contractData);
        const newId = contract.id;

        // 上传附件（如果有选择文件）
        const files = fileList
          .map(f => f.originFileObj)
          .filter((f): f is NonNullable<typeof f> => !!f);

        if (files.length > 0) {
          try {
            await window.api.uploadAttachments(newId, files);
            message.success('合同及附件创建成功');
          } catch (uploadErr: any) {
            message.warning(`合同已创建，但附件上传失败: ${uploadErr?.message || '未知错误'}。可在详情页重新上传。`);
          }
        } else {
          message.success('合同创建成功');
        }

        navigate(`/contracts/${newId}`);
        return;
      }
    } catch (e: any) {
      const errMsg = e?.message || '保存失败';
      if (errMsg.includes('UNIQUE constraint') && errMsg.includes('contract_no')) {
        message.error('合同编号已存在，请更换编号后重试');
      } else {
        message.error(errMsg);
      }
    }
    setSaving(false);
  };

  return (
    <Card
      title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(-1)} />
          {isEdit ? '编辑合同' : '新增合同'}
        </Space>
      }
      loading={loading}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          type: '采购',
          status: '草稿',
          currency: 'CNY',
        }}
        style={{ maxWidth: 900, margin: '0 auto' }}
      >
        <Divider orientation="left" plain>基本信息</Divider>
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item
              label="主体公司"
              name="company"
              rules={[{ required: !isEdit, message: '请选择合同所属主体公司' }]}
            >
              <Select
                placeholder="请选择所属主体公司"
                allowClear
                onChange={handleCompanyChange}
                options={companies.map(c => ({ value: c.name, label: `${c.name}（${c.abbr}）` }))}
                notFoundContent="请先在「系统设置 → 公司管理」中添加主体公司"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="合同编号"
              name="contract_no"
              rules={[{ required: true, message: '请输入合同编号' }]}
              extra="选择主体公司后自动带出，可手动修改"
            >
              <Input placeholder="如：CY-2026-0001" onChange={() => setNumberTouched(true)} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="合同名称"
              name="title"
              rules={[{ required: true, message: '请输入合同名称' }]}
            >
              <Input placeholder="请输入合同名称" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={8}>
            <Form.Item label="合同类型" name="type" rules={[{ required: true }]}>
              <Select options={types.map(t => ({ label: t, value: t }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="状态" name="status" rules={[{ required: true }]}>
              <Select options={CONTRACT_STATUSES.map(s => ({ label: s, value: s }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="所属部门" name="department">
              <Select
                allowClear
                showSearch
                options={departments.map(d => ({ label: d, value: d }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>甲乙方信息</Divider>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              label="甲方"
              name="party_a"
              rules={[{ required: true, message: '请输入甲方名称' }]}
            >
              <Input placeholder="甲方公司/单位名称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="乙方"
              name="party_b"
              rules={[{ required: true, message: '请输入乙方名称' }]}
            >
              <Input placeholder="乙方公司/单位名称" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>金额与日期</Divider>
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item label="合同金额" name="amount">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                placeholder="0.00"
                prefix="¥"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value?.replace(/,/g, '') as any}
              />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item label="币种" name="currency">
              <Select
                options={[
                  { label: 'CNY', value: 'CNY' },
                  { label: 'USD', value: 'USD' },
                  { label: 'EUR', value: 'EUR' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="签订日期" name="sign_date">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={12}>
            <Form.Item label="有效期" name="validityPeriod">
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="负责人" name="person_in_charge">
              <Input placeholder="合同负责人" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>补充信息</Divider>
        <Form.Item label="合同摘要" name="description">
          <TextArea rows={4} placeholder="合同主要内容描述" />
        </Form.Item>

        {!isEdit && (
          <>
            <Divider orientation="left" plain>合同附件</Divider>
            <Dragger
              multiple
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
              style={{ marginBottom: 24 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">支持 PDF、Word、图片等格式，单个文件不超过 50MB</p>
            </Dragger>
          </>
        )}

        <Form.Item style={{ textAlign: 'center', marginTop: 32 }}>
          <Space size="large">
            <Button onClick={() => navigate(-1)}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
            >
              {isEdit ? '保存修改' : '创建合同'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ContractForm;
