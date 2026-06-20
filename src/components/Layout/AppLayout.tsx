import React, { useState, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, Dropdown, Space, Tag, Avatar } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  BellOutlined,
  BarChartOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  TeamOutlined,
  LogoutOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  // 根据角色动态生成菜单
  const menuItems = useMemo(() => {
    const items = [
      { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
      { key: '/contracts', icon: <FileTextOutlined />, label: '合同管理' },
      { key: '/reminders', icon: <BellOutlined />, label: '到期提醒' },
      { key: '/statistics', icon: <BarChartOutlined />, label: '统计分析' },
    ];
    if (user?.role === 'admin') {
      items.push({ key: '/users', icon: <TeamOutlined />, label: '用户管理' });
      items.push({ key: '/settings', icon: <SettingOutlined />, label: '系统设置' });
    }
    return items;
  }, [user]);

  const selectedKey = '/' + location.pathname.split('/')[1];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: `${user?.display_name || user?.username}`,
      disabled: true,
    },
    {
      key: 'role',
      icon: <KeyOutlined />,
      label: user?.role === 'admin' ? '管理员' : '普通用户',
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={220}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Title level={4} style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
            {collapsed ? '合' : '合同管理系统'}
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ marginTop: 8 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <span
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 18, cursor: 'pointer', color: '#666' }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </span>

          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
              <Text style={{ fontSize: 14 }}>
                {user?.display_name || user?.username}
              </Text>
              <Tag color={user?.role === 'admin' ? 'red' : 'blue'} style={{ marginLeft: 4 }}>
                {user?.role === 'admin' ? '管理员' : '用户'}
              </Tag>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
