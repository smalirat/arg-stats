require('dotenv').config();
const express = require('express');
const cors = require('cors');

const homeRoutes = require('./src/routes/homeRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const matchRoutes = require('./src/routes/matchRoutes');
const edicionRoutes = require('./src/routes/edicionRoutes');
const playerRoutes = require('./src/routes/playerRoutes');
const historialRoutes = require('./src/routes/historialRoutes');
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
app.use('/api/historial', historialRoutes);
app.get('/api/buscar', buscar);

app.use((req, res, next) => {
    next(new NotFoundError(`No se encontró la ruta ${req.originalUrl} en este servidor.`));
});

app.use(errorHandler);

// En el servidor se usa HOST=127.0.0.1: la API solo la consulta el frontend, no queda expuesta
app.listen(port, process.env.HOST, () => {
    console.log(`🚀 Servidor backend en http://localhost:${port}`);
});