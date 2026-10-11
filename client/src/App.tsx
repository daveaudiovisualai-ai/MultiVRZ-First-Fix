import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppDataProvider } from "./contexts/AppDataContext";
import AppNav from "./components/AppNav";
import Home from "./pages/Home";
import ConnectionRack from "./pages/ConnectionRack";
import SharedReport from "./pages/SharedReport";
import Consumables from "./pages/Consumables";
import CableScheduleBuilder from "./pages/CableScheduleBuilder";
import DestinationDrops from "./pages/DestinationDrops";
import PowerRequirements from "./pages/PowerRequirements";
import Progress from "./pages/Progress";
import Sites from "./pages/Sites";

function isSharedReportHash() {
  return window.location.hash.startsWith("#report=");
}

function Router() {
  // If the URL hash contains a shared report, render the read-only view
  // regardless of the path (handles /site-report#report=... links)
  if (isSharedReportHash()) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <SharedReport />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppNav />
      <div className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/build" component={CableScheduleBuilder} />
          <Route path="/" component={Home} />
          <Route path="/connection-rack" component={ConnectionRack} />
          <Route path="/destination-drops" component={DestinationDrops} />
          <Route path="/site-report" component={ConnectionRack} />
          <Route path="/cctv-wifi">{() => <DestinationDrops variant="security" />}</Route>
          <Route path="/power" component={PowerRequirements} />
          <Route path="/consumables" component={Consumables} />
          <Route path="/progress" component={Progress} />
          <Route path="/sites" component={Sites} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AppDataProvider>
          <TooltipProvider>
            <Toaster />
            <WouterRouter hook={useHashLocation}>
              <Router />
            </WouterRouter>
          </TooltipProvider>
        </AppDataProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
