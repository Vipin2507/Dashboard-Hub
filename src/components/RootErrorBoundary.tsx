import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null; errorInfo: ErrorInfo | null };

/**
 * Catches render errors so the app shows a message instead of a blank screen.
 */
export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("RootErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    const { error, errorInfo } = this.state;
    if (error) {
      return (
        <div
          style={{
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
            maxWidth: "42rem",
            margin: "0 auto",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#444", marginBottom: "1rem" }}>
            The app hit a runtime error. Open the browser console (F12) for details, or reload the page.
          </p>
          <pre
            style={{
              fontSize: "0.75rem",
              background: "#f5f5f5",
              padding: "1rem",
              borderRadius: "6px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message}
            {errorInfo?.componentStack ? `\n\n${errorInfo.componentStack}` : ""}
          </pre>
          <button
            type="button"
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
