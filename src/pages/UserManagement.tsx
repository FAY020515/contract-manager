import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm, message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  department: string;
  active: number;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
    loadDepartments();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await window.api.getCurrentUser();
      setCurrentUser(user);
    } catch (e) {
      console.error(e);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await window.api.getUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadDepartments = async () => {
    try {
      const settings = await window.api.getAllSettings();
      setDepartments(settings.departments || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdd = async (values: any) => {
    try {
      await window.api.createUser({
        username: values.username,
        password: values.password,
        display_name: values.display_name || values.username,
        role: values.role || 'user',
        department: values.department || '',
      });
      message.success('用户创建成功');
      setAddModalVisible(false);
      addForm.resetFields();
      loadUsers();
    } catch (e: any) {
      message.error(e?.message || '创建用户失败');
    }
  };

  const handleEdit = async (values: any) => {
    if (!editingUser) return;
    try {
      const updateData: any = {
        display_name: values.display_name,
        role: values.role,
        department: values.department || '',
      };
      if (values.password && values.password.trim()) {
        updateData.password = values.password;
      }
      await window.api.updateUser(editingUser.id, updateData);
      message.success('用户更新成功');
      setEditModalVisible(false);
      setEditingUser(null);
      editForm.resetFields();
      loadUsers();
    } catch (e: any) {
      message.error(e?.message || '更新用户失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.api.deleteUser(id);
      message.success('用户已停用');
      loadUsers();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      username: user.username,
      password: '',
      display_name: user.display_name,
      role: user.role,
      department: user.department,
    });
    setEditModalVisible(true);
  };

  // Fallback: if the current user is not an admin, show a denied message
  if (currentUser && currentUser.role !== 'admin') {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <h2>无权访问</h2>
        <p style={{ color: '#999' }}>此页面仅限管理员访问。</p>
      </div>
    );
  }

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      width: 140,
    },
    {
      title: '显示名称',
      dataIndex: 'display_name',
      width: 140,
      render: (text: string, record: User) => text || record.username,
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 100,
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'red' : 'blue'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '部门',
      dataIndex: 'department',
      width: 140,
      render: (text: string) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'active',
      width: 100,
      render: (active: number) => (
        <Tag color={active ? 'green' : 'default'}>
          {active ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 150,
      render: (_: any, record: User) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认停用此用户？"
            description="停用后用户将无法登录，但数据会保留。"
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.active === 0}
            >
              停用
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const departmentOptions = departments.map(d => ({ label: d, value: d }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            addForm.resetFields();
            setAddModalVisible(true);
          }}
        >
          添加用户
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={loading}
        scroll={{ x: 770 }}
        pagination={{
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
        }}
      />

      {/* Add User Modal */}
      <Modal
        title="添加用户"
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          addForm.resetFields();
        }}
        onOk={() => addForm.submit()}
        okText="确认"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={addForm}
          layout="vertical"
          onFinish={handleAdd}
          initialValues={{ role: 'user' }}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item
            name="display_name"
            label="显示名称"
          >
            <Input placeholder="请输入显示名称（可选）" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
          >
            <Select
              options={[
                { label: '管理员', value: 'admin' },
                { label: '普通用户', value: 'user' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="department"
            label="部门"
          >
            <Select
              placeholder="请选择部门"
              allowClear
              options={departmentOptions}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        title="编辑用户"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingUser(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        okText="确认"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEdit}
        >
          <Form.Item
            name="username"
            label="用户名"
          >
            <Input disabled />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            extra="留空表示不修改密码"
          >
            <Input.Password placeholder="留空则不修改密码" />
          </Form.Item>
          <Form.Item
            name="display_name"
            label="显示名称"
          >
            <Input placeholder="请输入显示名称" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
          >
            <Select
              options={[
                { label: '管理员', value: 'admin' },
                { label: '普通用户', value: 'user' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="department"
            label="部门"
          >
            <Select
              placeholder="请选择部门"
              allowClear
              options={departmentOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;
