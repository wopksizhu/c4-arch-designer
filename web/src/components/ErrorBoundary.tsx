import { Component, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="panel" style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2>页面出现错误</h2>
            <p className="muted">{String(this.state.error?.message || this.state.error)}</p>
            <div className="row">
              <button
                className="primary"
                onClick={() => {
                  this.setState({ error: null });
                  location.reload();
                }}
              >
                重新加载
              </button>
              <button onClick={() => this.setState({ error: null })}>尝试继续</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
