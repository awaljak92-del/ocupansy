import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { MapPin, AlertCircle, Loader2 } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const { login, loadUsers, users } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const initFetch = async () => {
      setIsLoadingUsers(true);
      setFetchError('');
      try {
        await loadUsers();
      } catch (err) {
        setFetchError('Gagal terhubung ke server backend.');
      } finally {
        setIsLoadingUsers(false);
      }
    };
    initFetch();
  }, [loadUsers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (fetchError) {
      setError('Tidak bisa login karena backend bermasalah.');
      return;
    }

    const foundUser = users.find(u => u.username === username && u.password === password);

    if (foundUser) {
      login(foundUser);
      navigate('/');
    } else {
      setError('Username atau password salah.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md relative">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600 p-3 rounded-full text-white mb-4">
            <MapPin size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ODP Mapper</h1>
          <p className="text-gray-500 text-sm mt-1">Sistem Pemetaan Optical Distribution Point</p>
        </div>

        {fetchError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <p className="text-sm">{fetchError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Masukkan username"
              required
              disabled={isLoadingUsers || !!fetchError}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Masukkan password"
              required
              disabled={isLoadingUsers || !!fetchError}
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={isLoadingUsers || !!fetchError}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-md disabled:bg-blue-400 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {isLoadingUsers ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Memuat...</span>
              </>
            ) : (
              'Masuk'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
