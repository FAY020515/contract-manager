import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ContractList from './pages/ContractList';
import ContractForm from './pages/ContractForm';
import ContractDetail from './pages/ContractDetail';
import Reminders from './pages/Reminders';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import { Spin } from 'antd';

// 路由守卫：未登录跳转到登录页
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Spin size="large" tip="加载中..." />
    </div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="contracts" element={<ContractList />} />
            <Route path="contracts/new" element={<ContractForm />} />
            <Route path="contracts/:id/edit" element={<ContractForm />} />
            <Route path="contracts/:id" element={<ContractDetail />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="statistics" element={<Statistics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="users" element={<UserManagement />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;
