import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

/**
 * Legacy QR Code Redirect Component
 * 
 * Handles old QR codes that use the format:
 * /public/customer-statement/{customerId}/{billId}
 * 
 * Creates a new secure token and redirects to:
 * /public/statement/{token}
 */
export default function LegacyQRRedirect() {
  const { customerId, billId } = useParams<{ customerId: string; billId: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (customerId) {
      generateTokenAndRedirect();
    }
  }, [customerId, billId]);

  const generateTokenAndRedirect = async () => {
    try {
      console.log('🔄 Legacy QR code detected, generating new token...');
      console.log('   - Customer ID:', customerId);
      console.log('   - Bill ID:', billId);

      // Verify customer exists
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('id', customerId)
        .single();

      if (customerError || !customerData) {
        setError('Customer not found. This QR code may be invalid.');
        setIsLoading(false);
        return;
      }

      // Generate new token (bill_id is optional)
      const insertData: any = {
        customer_id: customerId,
      };

      // Only include bill_id if it's provided
      if (billId) {
        insertData.bill_id = billId;
      }

      const { data: tokenData, error: tokenError } = await (supabase as any)
        .from('public_access_tokens')
        .insert(insertData)
        .select('token')
        .single();

      if (tokenError) {
        console.error('❌ Error generating token:', tokenError);
        // If it's a foreign key error for bill_id, try without it
        if (tokenError.code === '23503' && billId) {
          console.log('   - Bill not found in Supabase, creating customer-level token...');
          const { data: retryData, error: retryError } = await (supabase as any)
            .from('public_access_tokens')
            .insert({ customer_id: customerId })
            .select('token')
            .single();

          if (retryError) {
            setError('Failed to generate access token. Please try again.');
            setIsLoading(false);
            return;
          }

          setToken(retryData.token);
          console.log('✅ Token generated successfully (customer-level)');
          return;
        }

        setError('Failed to generate access token. Please try again.');
        setIsLoading(false);
        return;
      }

      setToken(tokenData.token);
      console.log('✅ Token generated successfully');
      console.log('   - Redirecting to new URL format...');
    } catch (err) {
      console.error('❌ Error in legacy redirect:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Updating QR Code...</h2>
          <p className="text-gray-600">Redirecting to secure access</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Access Statement</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            This QR code may be from an old receipt. Please request a new statement.
          </p>
        </div>
      </div>
    );
  }

  if (token) {
    // Redirect to new token-based URL
    return <Navigate to={`/public/statement/${token}`} replace />;
  }

  return null;
}

