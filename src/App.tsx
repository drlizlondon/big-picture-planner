import { AppShell } from './components/AppShell/component';
import { AccountAccess } from './components/AccountAccess/component';
import { AccessGate } from './components/AccessGate/component';

// Main application entry point
function App() {
  const path = window.location.pathname;
  const isAccountPage = path.endsWith('/account') || path.endsWith('/sign-in');

  if (isAccountPage) {
    return <AccountAccess />;
  }

  return (
    <AccessGate>
      <AppShell />
    </AccessGate>
  );
}

export default App
