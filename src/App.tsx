import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import StudyPage from "./pages/StudyPage";
import QuestionsPage from "./pages/QuestionsPage";
import CategoriesPage from "./pages/CategoriesPage";
import QuizPage from "./pages/QuizPage";
import StatsPage from "./pages/StatsPage";
import SettingsPage from "./pages/SettingsPage";

// HashRouter works identically on the web, in Electron and in Capacitor,
// so no per-platform router switching is needed.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/study" element={<StudyPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
