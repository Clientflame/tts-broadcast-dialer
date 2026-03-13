import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Campaigns from "./pages/Campaigns";
import Contacts from "./pages/Contacts";
import Audio from "./pages/Audio";
import CallLogs from "./pages/CallLogs";
import AuditLog from "./pages/AuditLog";
import FreePBX from "./pages/FreePBX";
import DncList from "./pages/DncList";
import CallerIds from "./pages/CallerIds";
import Templates from "./pages/Templates";
import Analytics from "./pages/Analytics";
import CostEstimator from "./pages/CostEstimator";
import AiGenerator from "./pages/AiGenerator";
import Reports from "./pages/Reports";
import UserManagement from "./pages/UserManagement";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Scripts from "./pages/Scripts";
import DidAnalytics from "./pages/DidAnalytics";
import Onboarding from "./pages/Onboarding";
import Settings from "./pages/Settings";
import ResetPassword from "./pages/ResetPassword";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/campaigns"} component={Campaigns} />
      <Route path={"/contacts"} component={Contacts} />
      <Route path={"/audio"} component={Audio} />
      <Route path={"/caller-ids"} component={CallerIds} />
      <Route path={"/did-analytics"} component={DidAnalytics} />
      <Route path={"/scripts"} component={Scripts} />
      <Route path={"/templates"} component={Templates} />
      <Route path={"/analytics"} component={Analytics} />
      <Route path={"/call-logs"} component={CallLogs} />
      <Route path={"/audit"} component={AuditLog} />
      <Route path={"/dnc"} component={DncList} />
      <Route path={"/ai-generator"} component={AiGenerator} />
      <Route path={"/cost-estimator"} component={CostEstimator} />
      <Route path={"/reports"} component={Reports} />
      <Route path={"/freepbx"} component={FreePBX} />
      <Route path={"/users"} component={UserManagement} />
      <Route path={"/login"} component={Login} />
      <Route path={"/setup"} component={Setup} />
      <Route path={"/onboarding"} component={Onboarding} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/reset-password"} component={ResetPassword} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
