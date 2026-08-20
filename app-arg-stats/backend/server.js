require('dotenv').config();
const express = require('express');
const cors = require('cors');
const teamRoutes = require('./src/routes/teamRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Endpoints (Rutas base)
app.get('/', (req, res) => {
    res.json({ api_name: "Argstats API", status: "Online" });
});

// Conectamos todas las rutas de equipos bajo el prefijo /api/equipos
app.use('/api/equipos', teamRoutes);

// Levantar servidor
app.listen(port, () => {
    console.log(`\nServidor backend iniciado en http://localhost:${port}`);
    console.log(`Prueba de BD: http://localhost:${port}/api/equipos/test-db\n`);
});