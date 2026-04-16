import React from 'react'

interface State { hasError: boolean }

export class ChartErrorBoundary extends React.Component<
  React.PropsWithChildren<{ fallback?: React.ReactNode }>,
  State
> {
  constructor(props: React.PropsWithChildren<{ fallback?: React.ReactNode }>) {
    super(props)
    this.state = { hasError: false }
  }
  
  static getDerivedStateFromError(): State {
    return { hasError: true }
  }
  
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Chart Error]', error, info.componentStack)
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Erreur d'affichage du graphique
        </div>
      )
    }
    return this.props.children
  }
}
