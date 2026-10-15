import { useAuth } from '../../context/AuthContext';
import EmployeeDashboard from './EmployeeDashboard';
import AgentDashboard from './AgentDashboard';
import AdminDashboard from './AdminDashboard';

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') return <AdminDashboard />;
  if (user?.role === 'SUPPORT_AGENT') return <AgentDashboard />;
  return <EmployeeDashboard />;
}
