import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import config from './config/env';
import errorHandler from './middlewares/errorHandler.middleware';
import notFound from './middlewares/notFound.middleware';
import routes from './routes';

const app = express();

// Guvenlik ve temel middleware'ler
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Testte kapali: supertest her istegi log'lasa test ciktisi okunmaz hale gelir
if (!config.isProduction && config.env !== 'test') {
  app.use(morgan(config.logLevel));
}

// Route'lar
app.use('/', routes);

// 404 + merkezi hata yonetimi (her zaman en sonda)
app.use(notFound);
app.use(errorHandler);

export default app;
