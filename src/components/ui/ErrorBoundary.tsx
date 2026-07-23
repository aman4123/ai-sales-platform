import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  failed: boolean;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, details: ErrorInfo) {
    if (import.meta.env.DEV) console.error("Unhandled UI error", error, details);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
          <div className="max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
            <h1 className="text-2xl font-bold">This page could not be displayed</h1>
            <p className="mt-3 text-slate-400">
              Reload the application to recover. Your saved CRM data is safe in the database.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700"
            >
              Reload application
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
