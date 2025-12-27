import React from 'react';
import { Trash2, User } from 'lucide-react';

interface SavedUserCardProps {
  user: {
    id: string;
    email: string;
    name: string;
  };
  onSelect: () => void;
  onRemove: (e: React.MouseEvent) => void;
  isSelected?: boolean;
}

/**
 * Generate a consistent color for a user based on their ID
 */
const getUserColor = (userId: string): string => {
  // Simple hash function to generate consistent color
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate a color from the hash (using HSL for better contrast)
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
};

/**
 * Get user initials from name
 */
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

export default function SavedUserCard({ user, onSelect, onRemove, isSelected = false }: SavedUserCardProps) {
  const userColor = getUserColor(user.id);
  const initials = getInitials(user.name);

  return (
    <div
      className={`
        relative flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all
        ${isSelected 
          ? 'border-blue-500 bg-blue-50 shadow-md' 
          : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
        }
      `}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Select user ${user.name}`}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg"
        style={{ backgroundColor: userColor }}
      >
        {initials}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{user.name}</div>
        <div className="text-sm text-gray-500 truncate">{user.email}</div>
      </div>

      {/* Remove Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(e);
        }}
        className={`
          flex-shrink-0 p-2 rounded-md transition-colors
          ${isSelected
            ? 'text-red-600 hover:bg-red-100'
            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
          }
        `}
        aria-label={`Remove saved credentials for ${user.name}`}
        title="Remove saved credentials"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

