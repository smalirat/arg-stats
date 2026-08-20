const supabase = require('../config/supabase');

const getTestTeams = async () => {
    const { data, error } = await supabase
        .from('equipos')
        .select('equipo_id, nombre_fuente')
        .limit(5);

    if (error) throw error;
    return data;
};

module.exports = {
    getTestTeams
};