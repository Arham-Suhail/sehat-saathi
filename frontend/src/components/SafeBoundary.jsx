/* Keeps one broken widget from blanking the whole screen: if anything inside throws while rendering,
   only this box is replaced by a short message (or `fallback`). Used around optional features such as
   Extra alternatives. */
import { Component } from 'react';
import { t } from '../i18n/useT';

export default class SafeBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('A part of the screen failed to render:', error?.name || 'Error');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div className="notice notice--danger" role="alert">
        {t('common.error')}
      </div>
    );
  }
}
