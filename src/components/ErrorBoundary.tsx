import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('Viz render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-box" role="alert">
          <h2>Something went wrong rendering this view</h2>
          <p>{this.state.error}</p>
          <button type="button" className="chip" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
