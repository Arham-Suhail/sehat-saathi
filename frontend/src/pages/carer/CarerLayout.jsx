import AppTabBar from '../../components/AppTabBar';
import PageTransition from '../../components/PageTransition';
import { CareAlertsProvider, useCareAlerts } from '../../hooks/useCareAlerts';

function TabBar() {
  const { open } = useCareAlerts();
  return <AppTabBar badge={open} />;
}

/* Wraps family / doctor screens: care alerts (polled, native repeats), page fade-in and, in app
   mode, the bottom tab bar with the open-alerts badge. */
export default function CarerLayout() {
  return (
    <CareAlertsProvider>
      <PageTransition />
      <TabBar />
    </CareAlertsProvider>
  );
}
