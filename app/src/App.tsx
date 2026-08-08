import { Route, Routes } from 'react-router-dom';
import Nav from './components/Nav';
import Login from './pages/Login';
import CardsList from './pages/CardsList';
import CardEditor from './pages/CardEditor';
import ReviewSession from './pages/ReviewSession';

export default function App() {
  return (
    <div className="app">
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<CardsList />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cards/new" element={<CardEditor />} />
          <Route path="/cards/:id" element={<CardEditor />} />
          <Route path="/cards/:id/review" element={<ReviewSession />} />
        </Routes>
      </main>
    </div>
  );
}
