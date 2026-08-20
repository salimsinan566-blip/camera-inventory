import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL REACT CRASH CAUGHT BY BOUNDARY:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '30px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          direction: 'rtl',
          background: '#0f172a',
          color: '#ffffff',
          minHeight: '100vh'
        }}>
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            background: '#1e293b',
            border: '1px solid #ef4444',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '32px' }}>⚠️</span>
              <div>
                <h1 style={{ margin: 0, fontSize: '20px', color: '#f87171' }}>حدث خطأ أثناء تحميل الصفحة</h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                  تفاصيل الخطأ أدناه للمساعدة في المعالجة الفورية:
                </p>
              </div>
            </div>

            <div style={{
              background: '#090d16',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #334155',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#fbbf24',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: '20px',
              direction: 'ltr',
              textAlign: 'left'
            }}>
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.errorInfo?.componentStack}
            </div>

            <button
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              style={{
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              إعادة تحميل الصفحة 🔄
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
