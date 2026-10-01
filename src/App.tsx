import { HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./theme/ThemeProvider";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import StudyPage from "./pages/StudyPage";
import CalendarPage from "./pages/CalendarPage";
import GoalsPage from "./pages/GoalsPage";
import QuestionsPage from "./pages/QuestionsPage";
import CategoriesPage from "./pages/CategoriesPage";
import QuizPage from "./pages/QuizPage";
import ShasPage from "./pages/ShasPage";
import StatsPage from "./pages/StatsPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import ShasBoardPage from "./pages/ShasBoardPage";
import AdminPage from "./pages/AdminPage";

// HashRouter works identically on the web, in Electron and in Capacitor,
// so no per-platform router switching is needed.
export default function App() {
  return (
    <ThemeProvider>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/study" element={<StudyPage />} />
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
        </Route>
      </Routes>
    </HashRouter>
    </ThemeProvider>
  );
}
