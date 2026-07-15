import Layout from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { LABELS } from '../../lib/constants';

const AboutPage = () => {
  usePageTitle(LABELS.OVER_DEZE_POULE);
  return (
    <Layout title={LABELS.OVER_DEZE_POULE}>
      <div className="text-center py-12 text-tdf-text-secondary">
        Deze pagina is in aanbouw.
      </div>
    </Layout>
  );
};

export default AboutPage;
