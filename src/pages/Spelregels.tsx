import Layout from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { LABELS } from '../../lib/constants';

const Spelregels = () => {
  usePageTitle(LABELS.SPELREGELS);
  return (
    <Layout title={LABELS.SPELREGELS}>
      <div className="text-center py-12 text-tdf-text-secondary">
        Deze pagina is in aanbouw.
      </div>
    </Layout>
  );
};

export default Spelregels;
