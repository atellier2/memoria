import { useOutletContext } from 'react-router-dom';
import type { CardOutletContext } from './CardPage';
import { parseAssociation, parseRecitation } from '../lib/parseContent';

export default function CardView() {
  const { card } = useOutletContext<CardOutletContext>();
  const isAssociation = card.type === 'association';
  const pairs = isAssociation ? parseAssociation(card.content) : [];
  const lines = isAssociation ? [] : parseRecitation(card.content);

  return (
    <div className="panel">
      <div className="card-meta">
        <span className={`badge badge-${card.type}`}>{isAssociation ? 'Association' : 'Récitation'}</span>
        <span className="badge">{card.lang}</span>
        <span className="badge">{card.difficulty}</span>
        <span className="badge">{card.visibility}</span>
      </div>

      {isAssociation ? (
        pairs.length === 0 ? (
          <p className="hint">Cette carte n'a pas encore de contenu.</p>
        ) : (
          <table className="view-table">
            <tbody>
              {pairs.map((pair, i) => (
                <tr key={i}>
                  <td>{pair.front}</td>
                  <td>{pair.back}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : lines.length === 0 ? (
        <p className="hint">Cette carte n'a pas encore de contenu.</p>
      ) : (
        <div className="view-text">
          {lines.map((line, i) => (
            <p key={i}>{line.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}
