import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  // URLs viejas -> nuevas (esquema de FotMob). Las páginas nuevas completan
  // la pestaña y el slug con otra redirección.
  redirects: {
    '/equipo/[id]': '/equipos/[id]',
    '/torneo/[id]': '/torneos/[id]',
    '/partido/[id]': '/partidos/[id]',
    '/jugador/[id]': '/jugadores/[id]',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
