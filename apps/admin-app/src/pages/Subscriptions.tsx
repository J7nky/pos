import { Check, X } from 'lucide-react';

const subscriptionPlans = [
  {
    name: 'Starter',
    subtitle: 'Offline Only',
    description: 'Perfect for very small stores',
    monthlyPrice: 20,
    yearlyPrice: 200,
    yearlySavings: 40,
    features: {
      branches: 1,
      users: '3 (1 admin, 1 cashier, 1 manager)',
      products: 250,
      offlineMode: true,
      cloudSync: false,
      qrPrinting: false,
      notifications: false,
      multiDevice: false,
      backups: 'Local only',
      allFeatures: 'All features except restricted ones',
    },
  },
  {
    name: 'Professional',
    subtitle: 'For growing stores',
    description: 'Everything in Starter +',
    monthlyPrice: 50,
    yearlyPrice: 500,
    yearlySavings: 100,
    popular: true,
    features: {
      branches: 2,
      users: 10,
      products: 'Unlimited',
      offlineMode: true,
      cloudSync: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      backups: 'Cloud + Local',
      allFeatures: 'No restrictions',
    },
  },
  {
    name: 'Premium',
    subtitle: 'For large wholesalers & chains',
    description: 'Everything in Pro +',
    monthlyPrice: 149,
    yearlyPrice: 1490,
    yearlySavings: 298,
    features: {
      branches: 5,
      users: 'Unlimited',
      products: 'Unlimited',
      offlineMode: true,
      cloudSync: true,
      qrPrinting: true,
      notifications: true,
      multiDevice: true,
      backups: 'Cloud + Local',
      allFeatures: 'All features + API access',
    },
  },
];

export default function Subscriptions() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Subscription Plans</h1>
        <p className="mt-2 text-gray-600">Choose the right plan for your business needs</p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {subscriptionPlans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border ${
              plan.popular
                ? 'border-blue-500 shadow-lg ring-1 ring-blue-500'
                : 'border-gray-200 shadow-sm'
            } p-8 bg-white`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
            )}

            <div className="text-center">
              <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
              <p className="text-sm font-medium text-gray-500 mt-1">{plan.subtitle}</p>
              <p className="text-sm text-gray-600 mt-2">{plan.description}</p>
              
              <div className="mt-6">
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold text-gray-900">${plan.monthlyPrice}</span>
                  <span className="text-lg text-gray-500 ml-1">/month</span>
                </div>
                <div className="mt-2">
                  <span className="text-sm text-gray-600">
                    or ${plan.yearlyPrice}/year (save ${plan.yearlySavings})
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm text-gray-700">{plan.features.branches} Branch{plan.features.branches > 1 ? 'es' : ''}</span>
              </div>
              
              <div className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm text-gray-700">Up to {plan.features.users} users</span>
              </div>
              
              <div className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm text-gray-700">{plan.features.products} products</span>
              </div>
              
              <div className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm text-gray-700">Offline mode</span>
              </div>
              
              <div className="flex items-center">
                {plan.features.cloudSync ? (
                  <Check className="h-5 w-5 text-green-500 mr-3" />
                ) : (
                  <X className="h-5 w-5 text-red-500 mr-3" />
                )}
                <span className="text-sm text-gray-700">Real-time cloud sync</span>
              </div>
              
              <div className="flex items-center">
                {plan.features.qrPrinting ? (
                  <Check className="h-5 w-5 text-green-500 mr-3" />
                ) : (
                  <X className="h-5 w-5 text-red-500 mr-3" />
                )}
                <span className="text-sm text-gray-700">QR code printing</span>
              </div>
              
              <div className="flex items-center">
                {plan.features.notifications ? (
                  <Check className="h-5 w-5 text-green-500 mr-3" />
                ) : (
                  <X className="h-5 w-5 text-red-500 mr-3" />
                )}
                <span className="text-sm text-gray-700">Notifications system</span>
              </div>
              
              <div className="flex items-center">
                {plan.features.multiDevice ? (
                  <Check className="h-5 w-5 text-green-500 mr-3" />
                ) : (
                  <X className="h-5 w-5 text-red-500 mr-3" />
                )}
                <span className="text-sm text-gray-700">Multi-device access</span>
              </div>
              
              <div className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm text-gray-700">{plan.features.backups} backups</span>
              </div>
              
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-900">{plan.features.allFeatures}</p>
              </div>
            </div>

            <div className="mt-8">
              <button
                className={`w-full py-3 px-4 rounded-lg font-medium text-sm transition-colors ${
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                Choose {plan.name}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Feature Comparison</h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Feature
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Starter
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Professional
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Premium
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {[
                { feature: 'Branches', starter: '1', professional: '2', premium: '5' },
                { feature: 'Users', starter: '3', professional: '10', premium: 'Unlimited' },
                { feature: 'Products', starter: '250', professional: 'Unlimited', premium: 'Unlimited' },
                { feature: 'Cloud Sync', starter: false, professional: true, premium: true },
                { feature: 'QR Printing', starter: false, professional: true, premium: true },
                { feature: 'Notifications', starter: false, professional: true, premium: true },
                { feature: 'Multi-device', starter: false, professional: true, premium: true },
                { feature: 'API Access', starter: false, professional: false, premium: true },
              ].map((row) => (
                <tr key={row.feature}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {row.feature}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {typeof row.starter === 'boolean' ? (
                      row.starter ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-red-500 mx-auto" />
                      )
                    ) : (
                      <span className="text-sm text-gray-700">{row.starter}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {typeof row.professional === 'boolean' ? (
                      row.professional ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-red-500 mx-auto" />
                      )
                    ) : (
                      <span className="text-sm text-gray-700">{row.professional}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {typeof row.premium === 'boolean' ? (
                      row.premium ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-red-500 mx-auto" />
                      )
                    ) : (
                      <span className="text-sm text-gray-700">{row.premium}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

