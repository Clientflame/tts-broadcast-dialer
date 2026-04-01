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
import VerifyEmail from "./pages/VerifyEmail";
import PredictiveDialer from "./pages/PredictiveDialer";
import LiveAgents from "./pages/LiveAgents";
import Wallboard from "./pages/Wallboard";
import Recordings from "./pages/Recordings";
import VoiceAi from "./pages/VoiceAi";
import AgentAssist from "./pages/AgentAssist";
import AgentDashboard from "./pages/AgentDashboard";
import SystemArchitecture from "./pages/SystemArchitecture";
import CommandPalette from "./components/CommandPalette";
import DeploymentStatus from "./pages/DeploymentStatus";
import SystemStatus from "./pages/SystemStatus";
import DatabaseBackups from "./pages/DatabaseBackups";
import LicenseKeys from "./pages/LicenseKeys";
import CampaignCalendar from "./pages/CampaignCalendar";
import Help from "./pages/Help";
import OperatorPanel from "./pages/OperatorPanel";
import SetupWizard from "./pages/SetupWizard";
import Security from "./pages/Security";

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
      <Route path={"/predictive-dialer"} component={PredictiveDialer} />
      <Route path={"/live-agents"} component={LiveAgents} />
      <Route path={"/wallboard"} component={Wallboard} />
      <Route path={"/recordings"} component={Recordings} />
      <Route path={"/voice-ai"} component={VoiceAi} />
      <Route path={"/agent-assist"} component={AgentAssist} />
      <Route path={"/agent"} component={AgentDashboard} />
      <Route path={"/system-architecture"} component={SystemArchitecture} />
      <Route path={"/deployments"} component={DeploymentStatus} />
      <Route path={"/system-status"} component={SystemStatus} />
      <Route path={"/backups"} component={DatabaseBackups} />
      <Route path={"/licenses"} component={LicenseKeys} />
      <Route path={"/campaign-calendar"} component={CampaignCalendar} />
      <Route path={"/operator-panel"} component={OperatorPanel} />
      <Route path={"/setup-wizard"} component={SetupWizard} />
      <Route path={"/security"} component={Security} />
      <Route path={"/help"} component={Help} />
      <Route path={"/reset-password"} component={ResetPassword} />
      <Route path={"/verify-email"} component={VerifyEmail} />
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
        defaultTheme="dark"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <CommandPalette />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
