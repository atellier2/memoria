import { Route, Routes } from 'react-router-dom';
import Nav from './components/Nav';
import Login from './pages/Login';
import CardsList from './pages/CardsList';
import CardCreate from './pages/CardCreate';
import CardPage from './pages/CardPage';
import CardView from './pages/CardView';
import CardEditForm from './pages/CardEditForm';
import ReviewSession from './pages/ReviewSession';

export default function App() {
  return (
    <div className="app">
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<CardsList />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cards/new" element={<CardCreate />} />
          <Route path="/cards/:id" element={<CardPage />}>
            <Route index element={<CardView />} />
            <Route path="edit" element={<CardEditForm />} />
            <Route path="review" element={<ReviewSession />} />
          </Route>
        </Routes>
      </main>
    </div>
  );
}
