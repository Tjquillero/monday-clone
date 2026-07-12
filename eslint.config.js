const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');
const nextTypescript = require('eslint-config-next/typescript');

module.exports = [
  {
    // Sin esto, el flat config por defecto lintea TODO el repo, incluyendo
    // scripts de diagnóstico de una sola vez, código legacy ya retirado de
    // la app, y artefactos de build — nada de eso es código de aplicación.
    ignores: [
      '.next/**',
      'node_modules/**',
      'scripts/**',
      'scratch/**',
      'tmp/**',
      '.claude/**',
      // Archivos de configuración sueltos en la raíz (jest.config.js,
      // next.config.mjs, postcss.config.mjs, este mismo archivo) — sin
      // `**/`, el patrón solo alcanza el nivel raíz, no recursivamente.
      '*.js',
      '*.mjs',
      '*.cjs',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];
