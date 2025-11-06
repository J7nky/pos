import React from "react";

type FastAction = {
  id: string | number;
  title: string;
  description: string;
  stats: string | number;
  color: string;       // e.g. "bg-blue-500"
  hoverColor: string;  // e.g. "hover:bg-blue-600"
  icon: React.ElementType; // lucide/heroicon component
  action: () => void;
};

interface FastActionCardProps {
  action: FastAction;
}

const FastActionCard: React.FC<FastActionCardProps> = ({ action }) => {
  return (
    <button
      onClick={action.action}
      className={`${action.color} ${action.hoverColor} text-white p-6 rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105 hover:shadow-xl group relative overflow-hidden`}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-20 h-20 bg-white bg-opacity-10 rounded-full -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-300"></div>
      <div className="absolute bottom-0 left-0 w-16 h-16 bg-white bg-opacity-5 rounded-full translate-y-4 -translate-x-4 group-hover:scale-125 transition-transform duration-300"></div>

      <div className="flex items-start justify-between mb-4">
        <div className="relative">
          <action.icon className="w-8 h-8 text-white group-hover:scale-110 transition-all duration-200 relative z-10" />
          {/* Popup glow effect */}
          <div className="absolute inset-0 w-8 h-8 bg-white rounded-full opacity-0 group-hover:opacity-20 group-hover:scale-150 transition-all duration-300 blur-sm"></div>
        </div>
        <span className="text-sm font-medium bg-white bg-opacity-20 px-2 py-1 rounded-full">
          {action.stats}
        </span>
      </div>

      <div className="relative z-10">
        <h3 className="text-lg font-bold mb-2 group-hover:translate-x-1 transition-transform duration-200">
          {action.title}
        </h3>
        <p className="text-sm opacity-90 group-hover:opacity-100 transition-opacity duration-200">
          {action.description}
        </p>
      </div>
    </button>
  );
};

export default FastActionCard;
