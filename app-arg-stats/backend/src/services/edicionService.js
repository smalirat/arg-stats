const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');

const getAllEdiciones = async () => {
    const { data, error } = await supabase
        .from('v_ediciones_resumen')
        .select('*')
        .order('temporada', { ascending: false });

    if (error) throw error;
    return data || [];
};

const getEdicionDetails = async (id) => {
    const edicionPromise = supabase
        .from('v_ediciones_resumen')
        .select('*')
        .eq('edicion_id', id)
        .single();

    const posicionesPromise = supabase
        .from('v_equipo_resumen_posiciones')
        .select('*')
        .eq('edicion_id', id)
        .order('puntos', { ascending: false });

    const partidosPromise = supabase
        .from('v_partidos_detalles')
        .select('*')
        .eq('edicion_id', id)
        .order('fecha_utc', { ascending: true });

    const [edicionRes, posicionesRes, partidosRes] = await Promise.all([
        edicionPromise,
        posicionesPromise,
        partidosPromise
    ]);

    if (edicionRes.error || !edicionRes.data) {
        throw new NotFoundError(`No se encontró la edición de torneo con ID ${id}`);
    }

    return {
        edicion: edicionRes.data,
        posiciones: posicionesRes.data || [],
        partidos: partidosRes.data || []
    };
};

module.exports = {
    getAllEdiciones,
    getEdicionDetails
};