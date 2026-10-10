/**
 * Componente A-Frame: auto-ratio
 * 
 * Intercepta o atributo 'src' em primitivas <a-image> (ou entidades com material/imagem),
 * extrai as dimensões intrínsecas da imagem (naturalWidth e naturalHeight) e calcula
 * a altura da entidade de forma proporcional à largura base configurada.
 * 
 * Evita distorções de escala (aspect ratio) em ilustrações 2D no WebAR.
 */
AFRAME.registerComponent('auto-ratio', {
  schema: {
    width: { type: 'number', default: 1.5 }
  },

  init: function () {
    this.onTextureLoaded = this.onTextureLoaded.bind(this);
    this.onComponentChanged = this.onComponentChanged.bind(this);
    this.resolveAndApplyRatio = this.resolveAndApplyRatio.bind(this);

    // Evento disparado pelo A-Frame quando a textura do material é carregada na GPU
    this.el.addEventListener('materialtextureloaded', this.onTextureLoaded);

    // Evento para capturar alterações nos componentes nativos do A-Frame
    this.el.addEventListener('componentchanged', this.onComponentChanged);

    // Observador de mutações no DOM para interceptar alterações diretas no atributo 'src'
    this.srcObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
          this.resolveAndApplyRatio();
        }
      }
    });

    this.srcObserver.observe(this.el, {
      attributes: true,
      attributeFilter: ['src']
    });

    // Primeira tentativa de resolução
    this.resolveAndApplyRatio();
  },

  update: function (oldData) {
    if (oldData && oldData.width !== this.data.width) {
      this.resolveAndApplyRatio();
    }
  },

  /**
   * Monitora alterações nos componentes internos do A-Frame.
   */
  onComponentChanged: function (evt) {
    if (evt.detail.name === 'material') {
      this.resolveAndApplyRatio();
    }
  },

  /**
   * Trata o evento de carregamento de textura Three.js.
   */
  onTextureLoaded: function (evt) {
    const texture = evt.detail && evt.detail.texture;
    if (texture && texture.image) {
      const naturalWidth = texture.image.naturalWidth || texture.image.videoWidth || texture.image.width;
      const naturalHeight = texture.image.naturalHeight || texture.image.videoHeight || texture.image.height;
      if (naturalWidth > 0 && naturalHeight > 0) {
        this.applyDimensions(naturalWidth, naturalHeight);
        return;
      }
    }
    this.resolveAndApplyRatio();
  },

  /**
   * Identifica a origem da imagem (seletor DOM ou URL direta) e obtém suas dimensões.
   */
  resolveAndApplyRatio: function () {
    const rawSrc = this.el.getAttribute('src');
    if (!rawSrc) {
      return;
    }

    // Caso 1: Seletor de elemento em <a-assets> (ex: "#minha-imagem")
    if (typeof rawSrc === 'string' && rawSrc.startsWith('#')) {
      const assetElement = document.querySelector(rawSrc);
      if (assetElement && assetElement instanceof HTMLImageElement) {
        if (assetElement.complete && assetElement.naturalWidth > 0) {
          this.applyDimensions(assetElement.naturalWidth, assetElement.naturalHeight);
          return;
        }

        assetElement.addEventListener('load', () => {
          this.applyDimensions(assetElement.naturalWidth, assetElement.naturalHeight);
        }, { once: true });
        return;
      }
    }

    // Caso 2: URL direta ou caminho relativo
    const imageUrl = (typeof rawSrc === 'string') ? rawSrc : rawSrc.src;
    if (!imageUrl) {
      return;
    }

    const tempImage = new Image();
    tempImage.crossOrigin = 'anonymous';
    tempImage.onload = () => {
      this.applyDimensions(tempImage.naturalWidth, tempImage.naturalHeight);
    };
    tempImage.src = imageUrl;
  },

  /**
   * Aplica a largura base e calcula a altura proporcional no elemento.
   */
  applyDimensions: function (naturalWidth, naturalHeight) {
    if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) {
      return;
    }

    const baseWidth = this.data.width;
    const aspectRatio = naturalHeight / naturalWidth;
    const calculatedHeight = baseWidth * aspectRatio;

    // Atualiza largura e altura na primitiva <a-image>
    this.el.setAttribute('width', baseWidth);
    this.el.setAttribute('height', calculatedHeight);

    // Emite evento informativo para scripts externos ou telemetria
    this.el.emit('autoratiocalculated', {
      baseWidth: baseWidth,
      calculatedHeight: calculatedHeight,
      naturalWidth: naturalWidth,
      naturalHeight: naturalHeight,
      aspectRatio: aspectRatio
    });
  },

  remove: function () {
    this.el.removeEventListener('materialtextureloaded', this.onTextureLoaded);
    this.el.removeEventListener('componentchanged', this.onComponentChanged);

    if (this.srcObserver) {
      this.srcObserver.disconnect();
    }
  }
});
