import { Component, ReactNode } from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
          <div className="max-w-md text-center">
            <h1 className="text-lg font-semibold text-ink mb-2">Something went wrong</h1>
            <p className="text-sm text-muted break-words">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
