import HomePage from "./pages/HomePage";
import ViewPage from "./pages/ViewPage";
import AddQuotePage from "./pages/AddQuotePage";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MultiViewPage from "./pages/MultiViewPage";

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/view" element={<ViewPage />} />
        <Route path="/multiview" element={<MultiViewPage />} />
        <Route path="/add" element={<AddQuotePage />} />
      </Routes>
    </Router>
  );
};

export default App;
