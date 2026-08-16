import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defence for render-time crashes.
 *
 * Without this, any thrown error unmounts the whole React tree and leaves the
 * user staring at a blank page with no way back. Here they at least get the
 * failure reason and a reload path.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled error in Event Chaos UI', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="w-full h-full min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-200"
      >
        <div className="aaa-panel aaa-panel-strong max-w-lg w-full p-8 text-center">
          <h1 className="aaa-heading text-2xl mb-3 text-red-400">Fallo crítico en el show</h1>
          <p className="text-sm text-slate-300 mb-4">
            El simulador se detuvo por un error inesperado. Tu progreso de carrera guardado no se
            vio afectado.
          </p>
          <p className="font-mono text-xs text-slate-400 bg-black/50 border border-slate-700 rounded p-3 mb-6 break-words text-left">
            {error.message || 'Error desconocido'}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="aaa-btn aaa-btn-primary aaa-btn-interactive px-6 py-2 font-mono uppercase tracking-widest text-sm"
          >
            Reiniciar simulador
          </button>
        </div>
      </div>
    );
  }
}
