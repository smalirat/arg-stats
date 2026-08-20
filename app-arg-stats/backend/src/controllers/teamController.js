// src/controllers/teamController.js
const teamService = require('../services/teamService');

const testDbConnection = async (req, res) => {
    try {
        console.log('➜ Petición recibida. Consultando a Supabase a través del servicio...');
        
        // Llamamos al servicio
        const data = await teamService.getTestTeams();

        res.status(200).json({
            status: 'success',
            results: data.length,
            data: data
        });

    } catch (error) {
        console.error('✖ Error en el controlador:', error.message);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
};

module.exports = {
    testDbConnection
};