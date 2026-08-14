import { Link } from 'react-router-dom';

const NotFoundPage = () => (
  <section>
    <h1>Sayfa bulunamadi</h1>
    <p>
      <Link to="/groups">Gruplara don</Link>
    </p>
  </section>
);

export default NotFoundPage;
