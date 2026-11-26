/* If Chotu ever fails to render, show nothing: the text / speech / voice check-in must keep working. */
import { Component } from 'react';

export default class ChotuBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Chotu failed to render:', error?.name || 'Error');
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
