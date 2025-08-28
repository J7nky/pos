import React, { useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import AccessibleModal from './AccessibleModal';
import AccessibleButton from './AccessibleButton';

interface ShortcutGroup {
  title: string;
  shortcuts: Record<string, string>;
}

interface KeyboardShortcutsHelpProps {
  shortcuts: ShortcutGroup[];
}

export default function KeyboardShortcutsHelp({ shortcuts }: KeyboardShortcutsHelpProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <AccessibleButton
        onClick={() => setIsOpen(true)}
        variant="ghost"
        size="sm"
        icon={Keyboard}
        ariaLabel="Show keyboard shortcuts"
        className="text-gray-500 hover:text-gray-700"
      >
        Shortcuts
      </AccessibleButton>

      <AccessibleModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Keyboard Shortcuts"
        size="lg"
      >
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {shortcuts.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {Object.entries(group.shortcuts).map(([key, description]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{description}</span>
                      <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">
                        {key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Accessibility Tips</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Use Tab to navigate between elements</li>
              <li>• Use Shift+Tab to navigate backwards</li>
              <li>• Use Enter or Space to activate buttons</li>
              <li>• Use Escape to close modals and cancel actions</li>
              <li>• All touch targets are optimized for 44px minimum size</li>
            </ul>
          </div>
        </div>
      </AccessibleModal>
    </>
  );
}