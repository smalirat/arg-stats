require('dotenv').config();
const express = require('express');
const cors = require('cors');

const homeRoutes = require('./src/routes/homeRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const matchRoutes = require('./src/routes/matchRoutes');
const edicionRoutes = require('./src/routes/edicionRoutes');
const playerRoutes = require('./src/routes/playerRoutes');
const { buscar } = require('./src/controllers/indiceController');

const errorHandler = require('./src/middlewares/errorHandler');
const { NotFoundError } = require('./src/middlewares/errors/AppError');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/home', homeRoutes);
app.use('/api/equipos', teamRoutes);
app.use('/api/partidos', matchRoutes);
app.use('/api/ediciones', edicionRoutes);
app.use('/api/jugadores', playerRoutes);
app.get('/api/buscar', buscar);

app.use((req, res, next) => {
    next(new NotFoundError(`No se encontró la ruta ${req.originalUrl} en este servidor.`));
});

app.use(errorHandler);

app.listen(port, () => {
    console.log(`🚀 Servidor backend en http://localhost:${port}`);
});