import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Map, LayoutDashboard, Settings, LogOut } from 'lucide-react';
import { useStore } from '../store';

export default function Layout() {
  const { logout, user } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const showDashboard = user?.role === 'admin' || user?.role === 'owner';
  const showSettings = user?.role === 'owner';

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center z-10">
        <div>
          <h1 className="text-xl font-bold">ODP Mapper</h1>
          {user && <p className="text-xs text-blue-200">{user.name} ({user.role})</p>}
        </div>
        <button onClick={handleLogout} className="p-2 rounded-full hover:bg-blue-700 transition-colors">
          <LogOut size={20} />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-gray-200 flex justify-around items-center h-16 pb-2 pt-1 z-10">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
            }`
          }
        >
          <Map size={24} />
          <span className="text-xs font-medium">Peta</span>
        </NavLink>
        
        {showDashboard && (
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
              }`
            }
          >
            <LayoutDashboard size={24} />
            <span className="text-xs font-medium">Dashboard</span>
          </NavLink>
        )}

        {showSettings && (
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
              }`
            }
          >
            <Settings size={24} />
            <span className="text-xs font-medium">Pengaturan</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}
