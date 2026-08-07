'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Guvenlik ve temel middleware'ler
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!config.isProduction) {
  app.use(morgan(config.logLevel));
}

// Route'lar
app.use('/', routes);

// 404 + merkezi hata yonetimi (her zaman en sonda)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
