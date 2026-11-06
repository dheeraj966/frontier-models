import { Link } from 'react-router-dom';
import type { Model } from '../data/types';

/** Model name that opens the model's detail page. */
export default function ModelLink({ model, children }: { model: Pick<Model, 'id' | 'name'>; children?: React.ReactNode }) {
  return (
    <Link className="model-link" to={`/model/${encodeURIComponent(model.id)}`} title={`Open ${model.name}`}>
      {children ?? model.name}
    </Link>
  );
}
