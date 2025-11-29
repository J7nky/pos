import {
  CreditCard,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  Building2,
  Users,
  Package,
} from 'lucide-react';
import {
  Subscription,
  SubscriptionUsage,
  getSubscriptionPlanConfig,
} from '../../types';
import { Button, Badge, Card, CardHeader, getStatusVariant, getTierVariant } from '../ui';

interface SubscriptionCardProps {
  subscription: Subscription | null;
  usage: SubscriptionUsage | null;
  onUpgrade: () => void;
  onManage: () => void;
}

export default function SubscriptionCard({
  subscription,
  usage,
  onUpgrade,
  onManage,
}: SubscriptionCardProps) {
  const planConfig = subscription ? getSubscriptionPlanConfig(subscription.plan) : null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const UsageBar = ({
    label,
    current,
    limit,
    icon,
  }: {
    label: string;
    current: number;
    limit: number | null;
    icon: React.ReactNode;
  }) => {
    const percentage = limit ? Math.min((current / limit) * 100, 100) : 0;
    const isNearLimit = limit && percentage >= 80;
    const isAtLimit = limit && current >= limit;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            {icon}
            {label}
          </div>
          <span className={`font-medium ${isAtLimit ? 'text-red-600' : 'text-gray-900'}`}>
            {current} / {limit || '∞'}
          </span>
        </div>
        {limit && (
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isAtLimit
                  ? 'bg-red-500'
                  : isNearLimit
                  ? 'bg-yellow-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  if (!subscription) {
    return (
      <Card>
        <div className="text-center py-8">
          <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Subscription</h3>
          <p className="text-gray-500 mb-4">
            This store doesn't have an active subscription.
          </p>
          <Button onClick={onUpgrade}>
            Add Subscription
          </Button>
        </div>
      </Card>
    );
  }

  const daysRemaining = getDaysRemaining(subscription.end_date);
  const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;
  const isExpired = daysRemaining <= 0;

  return (
    <Card>
      <CardHeader
        title="Subscription"
        description="Current plan and usage"
        action={
          <Button variant="outline" size="sm" onClick={onManage}>
            Manage
          </Button>
        }
      />

      {/* Current Plan */}
      <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-900">{planConfig?.name} Plan</h4>
            <Badge variant={getTierVariant(subscription.plan)}>
              {subscription.plan}
            </Badge>
            <Badge variant={getStatusVariant(subscription.status)}>
              {subscription.status}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">{planConfig?.description}</p>
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {subscription.billing_cycle === 'yearly' ? 'Annual' : 'Monthly'} billing
            </span>
            <span>
              ${subscription.amount}
              /{subscription.billing_cycle === 'yearly' ? 'year' : 'month'}
            </span>
          </div>
        </div>
        {subscription.plan !== 'enterprise' && (
          <Button
            variant="primary"
            size="sm"
            onClick={onUpgrade}
            rightIcon={<ArrowUpRight className="w-4 h-4" />}
          >
            Upgrade
          </Button>
        )}
      </div>

      {/* Billing Period */}
      <div className="mb-6">
        <div
          className={`flex items-center gap-3 p-3 rounded-lg ${
            isExpired
              ? 'bg-red-50 border border-red-200'
              : isExpiringSoon
              ? 'bg-yellow-50 border border-yellow-200'
              : 'bg-green-50 border border-green-200'
          }`}
        >
          {isExpired ? (
            <AlertTriangle className="w-5 h-5 text-red-500" />
          ) : isExpiringSoon ? (
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
          ) : (
            <CheckCircle className="w-5 h-5 text-green-500" />
          )}
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                isExpired
                  ? 'text-red-800'
                  : isExpiringSoon
                  ? 'text-yellow-800'
                  : 'text-green-800'
              }`}
            >
              {isExpired
                ? 'Subscription expired'
                : isExpiringSoon
                ? `Expires in ${daysRemaining} days`
                : `${daysRemaining} days remaining`}
            </p>
            <p className="text-xs text-gray-500">
              Current period: {formatDate(subscription.start_date)} -{' '}
              {formatDate(subscription.end_date)}
            </p>
          </div>
        </div>
      </div>

      {/* Usage */}
      {usage && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-900">Usage</h4>
          <UsageBar
            label="Branches"
            current={usage.branches_count}
            limit={usage.branches_limit}
            icon={<Building2 className="w-4 h-4" />}
          />
          <UsageBar
            label="Users"
            current={usage.users_count}
            limit={usage.users_limit}
            icon={<Users className="w-4 h-4" />}
          />
          <UsageBar
            label="Products"
            current={usage.products_count}
            limit={usage.products_limit}
            icon={<Package className="w-4 h-4" />}
          />
        </div>
      )}

      {/* Trial Notice */}
      {subscription.status === 'trial' && (
        <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Trial Period:</strong> Your trial ends on{' '}
            {formatDate(subscription.end_date)}. Upgrade to continue using all
            features.
          </p>
        </div>
      )}
    </Card>
  );
}
