import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Nav() {
  const { user, signOut } = useAuth();

  return (
    <nav className="nav">
      <Link to="/" className="brand">
        Memoria
      </Link>
      <div className="nav-actions">
        {user ? (
          <>
            <Link to="/cards/new">Nouvelle carte</Link>
            <span className="nav-user">{user.email}</span>
            <button onClick={() => signOut()}>Déconnexion</button>
          </>
        ) : (
          <Link to="/login">Se connecter</Link>
        )}
      </div>
    </nav>
  );
}
