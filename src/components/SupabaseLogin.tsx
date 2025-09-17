import React, { useState, useEffect } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { ShoppingCart, Eye, EyeOff } from 'lucide-react';
import SearchableSelect from './common/SearchableSelect';
// Removed SupabaseService import - using auth context methods only
import { useI18n } from '../i18n';

export default function SupabaseLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp, getStores } = useSupabaseAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'cashier'>('manager');
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (showSignUp) {
      setStoresLoading(true);
      getStores().then((data) => {
        setStores(data || []);
        setStoresLoading(false);
        console.log('STORES:', data);
      }).catch((error) => {
        console.error('Error loading stores:', error);
        setStores([]);
        setStoresLoading(false);
      });
    }
  }, [showSignUp, getStores]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (showSignUp) {
        if (!name || !email || !password || !role || !storeId) {
          setError('Please fill in all fields');
          setIsLoading(false);
          return;
        }
        const success = await signUp(email, password, { name, role, store_id: storeId });
        if (!success) {
          setError('Sign up failed. Please try again.');
        } else {
          setShowSignUp(false);
        }
      } else {
        const success = await signIn(email, password);
        if (!success) {
          setError('Invalid email or password');
        }
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
      console.log(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <ShoppingCart className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('login.title')}</h1>
          <p className="text-gray-600 mt-2">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {showSignUp && (
            <>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">{t('login.fullName')}</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('login.fullName')}
                  required
                  disabled={isLoading}
                />
              </div>
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">{t('login.role')}</label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={isLoading}
                >
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label htmlFor="store" className="block text-sm font-medium text-gray-700">{t('login.store')}</label>
                <SearchableSelect
                  options={stores.map((s) => ({ id: s.id, label: s.name, value: s.id }))}
                  value={storeId}
                  onChange={(val) => {
                    if (typeof val === 'string') setStoreId(val);
                  }}
                  placeholder={t('login.selectStore')}
                  loading={storesLoading}
                  disabled={isLoading || storesLoading}
                />
              </div>
            </>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">{t('login.email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder={t('login.emailPlaceholder')}
              required
              disabled={isLoading}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">{t('login.password')}</label>
            <div className="mt-1 relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder={t('login.passwordPlaceholder')}
                required
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-md">{error}</div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {showSignUp ? t('login.signingUp') : t('login.signingIn')}
              </div>
            ) : (
              showSignUp ? t('login.signUp') : t('login.signIn')
            )}
          </button>
        </form>

        <div className="mt-4 flex justify-center">
          {showSignUp ? (
            <button
              type="button"
              className="text-blue-600 hover:underline text-sm"
              onClick={() => { setShowSignUp(false); setError(''); }}
              disabled={isLoading}
            >
              {t('login.signIn')}
            </button>
          ) : (
            <button
              type="button"
              className="text-blue-600 hover:underline text-sm"
              onClick={() => { setShowSignUp(true); setError(''); }}
              disabled={isLoading}
            >
              {t('login.signUp')}
            </button>
          )}
        </div>

        {!showSignUp && (
          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">{t('login.demoAccount')}:</p>
            <div className="text-xs space-y-1">
              <div>Email: demo@market.com</div>
              <div>Password: demo123</div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Note: You&apos;ll need to create this user in your Supabase dashboard
            </p>
          </div>
        )}
      </div>
    </div>
  );
}