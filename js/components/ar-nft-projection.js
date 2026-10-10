/**
 * Componente A-Frame: ar-nft-projection
 *
 * Mantido como no-op para preservar a matriz de projeção óptica nativa calculada
 * pelo ARToolKit / AR.js sem corromper o frustum de renderização do Three.js.
 */
AFRAME.registerComponent('ar-nft-projection', {
  init: function () {
    // Projeção nativa gerenciada pelo AR.js
  }
});
