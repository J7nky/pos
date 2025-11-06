import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class I18nErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is a context-related error
    if (error.message.includes('must be used within') || 
        error.message.includes('Provider') ||
        error.message.includes('useOfflineData')) {
      return { hasError: true, error };
    }
    // Let other errors bubble up to the main ErrorBoundary
    throw error;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('I18nErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="mb-4">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
                <svg
                  className="h-6 w-6 text-yellow-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
            </div>
            
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Application Setup Error
            </h1>
            
            <p className="text-gray-600 mb-4">
              There's an issue with the application context setup. This usually happens when components are not properly wrapped with their required providers.
            </p>

            <div className="mb-6 p-3 bg-yellow-50 rounded-lg text-sm text-yellow-800">
              <strong>Error:</strong> {this.state.error?.message}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Refresh Page
              </button>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              If this problem continues, please check the browser console for more details.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default I18nErrorBoundary;

