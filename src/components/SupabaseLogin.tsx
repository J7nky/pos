import React, { useState } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { isSupabaseConfigured, getConfigurationErrors } from '../lib/supabase';
import { ShoppingCart, Eye, EyeOff } from 'lucide-react';

export default function SupabaseLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useSupabaseAuth();
  const supabaseConfigured = isSupabaseConfigured();
  const configErrors = getConfigurationErrors();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Check if Supabase is properly configured
    if (!supabaseConfigured) {
      setError('Database connection not configured. Please check the console for setup instructions.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      await signIn(email, password);
      // If we get here, sign in was successful
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Unable to connect to the authentication service. Please try again.');
      }
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
          <h1 className="text-2xl font-bold text-gray-900">ProducePOS</h1>
          <p className="text-gray-600 mt-2">Wholesale Produce Market ERP</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your email"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="mt-1 relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your password"
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
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          {!supabaseConfigured && (
            <div className="text-amber-600 text-sm text-center bg-amber-50 p-3 rounded-md border border-amber-200">
              <strong>⚠️ Setup Required:</strong> Database connection not configured. 
             <br />
             <div className="mt-2 text-xs">
               {configErrors.map((error, index) => (
                 <div key={index}>{error}</div>
               ))}
             </div>
             <div className="mt-2 text-xs">
               Check the browser console for detailed setup instructions.
             </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !supabaseConfigured}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Signing In...
              </div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          {supabaseConfigured ? (
            <>
              <p className="text-sm text-gray-600 mb-2">Demo Account:</p>
              <div className="text-xs space-y-1">
                <div>Email: demo@market.com</div>
                <div>Password: demo123</div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Note: Follow the DEMO_USER_SETUP.md guide to create this user
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-red-600 mb-2">🔧 Setup Required:</p>
              <div className="text-xs space-y-1 text-gray-600">
                <div>1. Create a Supabase project</div>
                <div>2. Get your project URL and anon key</div>
                <div>3. Update your .env.local file</div>
                <div>4. Restart the development server</div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Check the browser console for detailed instructions
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}