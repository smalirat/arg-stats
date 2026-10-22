// Competiciones de ArgStats. Cada una agrupa sus ediciones por prefijo de
// nombre (ej. "Liga Profesional" junta Apertura, Clausura y playoffs).
// El orden es el de las flechas de la home.
const COMPETICIONES = [
    { nombre: 'Primera División', prefijo: 'Liga Profesional' },
    { nombre: 'Primera Nacional', prefijo: 'Primera Nacional' },
    { nombre: 'Primera B Metropolitana', prefijo: 'Primera B Metropolitana' },
    { nombre: 'Federal A', prefijo: 'Federal A' },
    { nombre: 'Copa Argentina', prefijo: 'Copa Argentina' },
];

// Competición a la que pertenece una edición (por su nombre)
const competicionDe = (nombreEdicion) =>
    COMPETICIONES.find(c => nombreEdicion.startsWith(c.prefijo)) || null;

module.exports = { COMPETICIONES, competicionDe };
