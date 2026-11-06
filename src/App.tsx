import { lazy } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { vizPlugins } from './viz/registry';
import { PageHeader } from './components/ui';

const ModelPage = lazy(() => import('./pages/ModelPage'));

function NotFound() {
  return (
    <section>
      <PageHeader
        eyebrow="404"
        title="Nothing here"
        description={
          <>
            That page doesn’t exist. Go to the <Link to="/">overview</Link> or press <kbd>/</kbd> to search.
          </>
        }
      />
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {vizPlugins.map(({ id, path, component: Page }) => (
          <Route key={id} path={path} element={<Page />} />
        ))}
        <Route path="/model/:id" element={<ModelPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
