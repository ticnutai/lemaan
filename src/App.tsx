import { lazy } from "react";
import { HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./theme/ThemeProvider";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import LayoutSwitch from "./components/LayoutSwitch";

// המסכים נטענים רק כשנכנסים אליהם (עמוד הבית — מיד, כי הוא הראשון)
// הפריסה המקורית (אחד לאחד כמו באתר הבסיסי) — נטענת רק למי שבחר בה בהגדרות
const StudyPage = lazy(() => import("./pages/StudyPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const QuestionsPage = lazy(() => import("./pages/QuestionsPage"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));
const QuizPage = lazy(() => import("./pages/QuizPage"));
const ShasPage = lazy(() => import("./pages/ShasPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ShasBoardPage = lazy(() => import("./pages/ShasBoardPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const DafLabPage = lazy(() => import("./pages/DafLabPage"));
const ClassicHome = lazy(() => import("classic-pages/ClassicHome"));
const ClassicStudy = lazy(() => import("classic-pages/ClassicStudy"));
const ClassicSplitView = lazy(() => import("classic-pages/ClassicSplitView"));
const ClassicPlanDetail = lazy(() => import("classic-pages/ClassicPlanDetail"));

// HashRouter works identically on the web, in Electron and in Capacitor,
// so no per-platform router switching is needed.
export default function App() {
  return (
    <ThemeProvider>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LayoutSwitch modern={<Dashboard />} classic={<ClassicHome />} />} />
          <Route path="/study" element={<LayoutSwitch modern={<StudyPage />} classic={<ClassicStudy />} />} />
          <Route path="/split-view" element={<LayoutSwitch modern={<Navigate to="/study" replace />} classic={<ClassicSplitView />} />} />
          <Route path="/plan/:planId" element={<LayoutSwitch modern={<Navigate to="/" replace />} classic={<ClassicPlanDetail />} />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/decks" element={<Navigate to="/quiz" replace />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/shas" element={<ShasPage />} />
          <Route path="/shas-board" element={<ShasBoardPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/daf-lab" element={<DafLabPage />} />
        </Route>
      </Routes>
    </HashRouter>
    </ThemeProvider>
  );
}
