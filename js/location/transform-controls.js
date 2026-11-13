/**
 * Painel interativo de testes para ajuste em tempo real de posição, escala e rotação 3D.
 */

const DEFAULT_TRANSFORM_STATE = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  scaleMultiplier: 1,
  rotationXDeg: 0,
  rotationYDeg: 0,
  rotationZDeg: 0,
  autoAnimate: true
});

const SLIDER_DEFINITIONS = Object.freeze({
  position: [
    {
      key: 'offsetX',
      label: 'Lateral (X)',
      min: -20,
      max: 20,
      step: 0.25,
      formatValue: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)} m`
    },
    {
      key: 'offsetY',
      label: 'Altura (Y)',
      min: -5,
      max: 15,
      step: 0.25,
      formatValue: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)} m`
    },
    {
      key: 'offsetZ',
      label: 'Profundidade (Z)',
      min: -20,
      max: 20,
      step: 0.25,
      formatValue: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)} m`
    }
  ],
  scale: [
    {
      key: 'scaleMultiplier',
      label: 'Multiplicador de Escala',
      min: 0.1,
      max: 4.0,
      step: 0.05,
      formatValue: (value, context) => {
        const baseMeters = context?.baseDimensionMeters || 4.0;
        const resultingMeters = (value * baseMeters).toFixed(1);
        return `${value.toFixed(2)}x (${resultingMeters} m)`;
      }
    }
  ],
  rotation: [
    {
      key: 'rotationXDeg',
      label: 'Inclinação (X)',
      min: -180,
      max: 180,
      step: 1,
      formatValue: (value) => `${Math.round(value)}°`
    },
    {
      key: 'rotationYDeg',
      label: 'Giro Horizontal (Y)',
      min: -180,
      max: 180,
      step: 1,
      formatValue: (value) => `${Math.round(value)}°`
    },
    {
      key: 'rotationZDeg',
      label: 'Inclinação Lateral (Z)',
      min: -180,
      max: 180,
      step: 1,
      formatValue: (value) => `${Math.round(value)}°`
    }
  ]
});

/**
 * Sincroniza propriedades CSS usadas para preencher a trilha do slider em navegadores WebKit.
 * @param {HTMLInputElement} sliderInput
 */
function syncSliderTrackVariables(sliderInput) {
  sliderInput.style.setProperty('--attr-min', sliderInput.min || '0');
  sliderInput.style.setProperty('--attr-max', sliderInput.max || '100');
  sliderInput.style.setProperty('--control-value', sliderInput.value);
}

/**
 * Cria o painel de calibração 3D e conecta eventos ao controlador da cena.
 *
 * @param {object} options
 * @param {HTMLButtonElement | null} options.toggleButton
 * @param {HTMLElement | null} options.panelElement
 * @param {(state: object) => void} options.onChange
 * @param {() => { id: string, title: string, elevationMeters: number, targetDimensionMeters: number }} options.getInstallationContext
 * @returns {{ getState: () => object, refreshContextLabels: () => void, reset: () => void }}
 */
export function createTransformControls({
  toggleButton,
  panelElement,
  onChange,
  getInstallationContext
}) {
  const state = { ...DEFAULT_TRANSFORM_STATE };
  const controlBindings = new Map();
  let activeTab = 'position';
  let animateToggleButton = null;
  let copyFeedbackElement = null;

  function emitChange() {
    onChange({ ...state });
  }

  function updateControlReadout(definition, inputElement, outputElement) {
    const numericValue = Number(state[definition.key]);
    const formatted = definition.formatValue(numericValue, {
      baseDimensionMeters: getInstallationContext().targetDimensionMeters
    });
    outputElement.textContent = formatted;
    inputElement.setAttribute('aria-valuetext', formatted);
  }

  function syncAllControlsFromState() {
    for (const [key, binding] of controlBindings.entries()) {
      binding.inputElement.value = String(state[key]);
      syncSliderTrackVariables(binding.inputElement);
      updateControlReadout(binding.definition, binding.inputElement, binding.outputElement);
    }

    if (animateToggleButton) {
      animateToggleButton.setAttribute('aria-pressed', String(state.autoAnimate));
      animateToggleButton.classList.toggle('is-active', state.autoAnimate);
      animateToggleButton.textContent = state.autoAnimate
        ? 'Animação: Ligada'
        : 'Animação: Pausada';
    }
  }

  function resetState() {
    Object.assign(state, DEFAULT_TRANSFORM_STATE);
    syncAllControlsFromState();
    emitChange();
  }

  function setPanelOpen(isOpen) {
    if (!panelElement || !toggleButton) {
      return;
    }
    panelElement.hidden = !isOpen;
    toggleButton.setAttribute('aria-expanded', String(isOpen));
    toggleButton.classList.toggle('is-active', isOpen);
  }

  function buildSliderRow(definition) {
    const rowElement = document.createElement('div');
    rowElement.className = 'ar-transform-row';

    const headerRow = document.createElement('div');
    headerRow.className = 'ar-transform-row-header';

    const inputId = `transform-slider-${definition.key}`;
    const labelElement = document.createElement('label');
    labelElement.className = 'ar-transform-label';
    labelElement.htmlFor = inputId;
    labelElement.textContent = definition.label;

    const outputElement = document.createElement('output');
    outputElement.className = 'ar-transform-value';
    outputElement.htmlFor = inputId;

    headerRow.append(labelElement, outputElement);

    const sliderInput = document.createElement('input');
    sliderInput.type = 'range';
    sliderInput.id = inputId;
    sliderInput.className = 'ar-range-slider';
    sliderInput.min = String(definition.min);
    sliderInput.max = String(definition.max);
    sliderInput.step = String(definition.step);
    sliderInput.value = String(state[definition.key]);

    sliderInput.addEventListener('input', () => {
      state[definition.key] = Number(sliderInput.value);
      syncSliderTrackVariables(sliderInput);
      updateControlReadout(definition, sliderInput, outputElement);
      emitChange();
    });

    controlBindings.set(definition.key, {
      definition,
      inputElement: sliderInput,
      outputElement
    });

    rowElement.append(headerRow, sliderInput);
    return rowElement;
  }

  function buildPanelDom() {
    if (!panelElement) {
      return;
    }

    panelElement.replaceChildren();

    const header = document.createElement('div');
    header.className = 'ar-calib-header';

    const title = document.createElement('h2');
    title.className = 'ar-calib-title';
    title.textContent = 'Ajuste 3D (Posição • Escala • Rotação)';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ar-calib-close';
    closeButton.setAttribute('aria-label', 'Fechar painel de ajuste 3D');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => {
      setPanelOpen(false);
      toggleButton?.focus();
    });

    header.append(title, closeButton);

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'ar-calib-tabs';
    tabsContainer.setAttribute('role', 'tablist');

    const sectionsByTab = new Map();
    const tabButtonsByTab = new Map();

    const tabDescriptors = [
      { id: 'position', label: 'Posição' },
      { id: 'scale', label: 'Escala' },
      { id: 'rotation', label: 'Rotação' }
    ];

    function activateTab(tabId) {
      activeTab = tabId;
      for (const [id, button] of tabButtonsByTab.entries()) {
        const selected = id === tabId;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', String(selected));
      }
      for (const [id, section] of sectionsByTab.entries()) {
        section.hidden = id !== tabId;
      }
    }

    for (const tab of tabDescriptors) {
      const tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.className = 'ar-calib-tab';
      tabButton.setAttribute('role', 'tab');
      tabButton.textContent = tab.label;
      tabButton.addEventListener('click', () => activateTab(tab.id));
      tabButtonsByTab.set(tab.id, tabButton);
      tabsContainer.appendChild(tabButton);

      const sectionElement = document.createElement('div');
      sectionElement.className = 'ar-calib-section';
      sectionElement.setAttribute('role', 'tabpanel');

      for (const sliderDef of SLIDER_DEFINITIONS[tab.id]) {
        sectionElement.appendChild(buildSliderRow(sliderDef));
      }

      if (tab.id === 'rotation') {
        animateToggleButton = document.createElement('button');
        animateToggleButton.type = 'button';
        animateToggleButton.className = 'ar-action-btn';
        animateToggleButton.addEventListener('click', () => {
          state.autoAnimate = !state.autoAnimate;
          syncAllControlsFromState();
          emitChange();
        });
        sectionElement.appendChild(animateToggleButton);
      }

      sectionsByTab.set(tab.id, sectionElement);
    }

    const footer = document.createElement('div');
    footer.className = 'ar-calib-footer';

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'ar-calib-btn-reset';
    resetButton.textContent = 'Resetar tudo';
    resetButton.addEventListener('click', resetState);

    copyFeedbackElement = document.createElement('span');
    copyFeedbackElement.className = 'ar-calib-status';
    copyFeedbackElement.setAttribute('role', 'status');
    copyFeedbackElement.setAttribute('aria-live', 'polite');

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'ar-calib-btn';
    copyButton.textContent = 'Copiar valores';
    copyButton.addEventListener('click', async () => {
      const context = getInstallationContext();
      const payload = {
        obraId: context.id,
        title: context.title,
        elevationMeters: Number((context.elevationMeters + state.offsetY).toFixed(2)),
        targetDimensionMeters: Number(
          (context.targetDimensionMeters * state.scaleMultiplier).toFixed(2)
        ),
        offsetMeters: {
          x: Number(state.offsetX.toFixed(2)),
          y: Number(state.offsetY.toFixed(2)),
          z: Number(state.offsetZ.toFixed(2))
        },
        rotationDegrees: {
          x: Math.round(state.rotationXDeg),
          y: Math.round(state.rotationYDeg),
          z: Math.round(state.rotationZDeg)
        }
      };

      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        copyFeedbackElement.textContent = 'Copiado!';
      } catch (error) {
        console.warn('[TransformControls] Clipboard indisponível:', error);
        copyFeedbackElement.textContent =
          `X:${payload.offsetMeters.x} Y:${payload.offsetMeters.y} Z:${payload.offsetMeters.z} Esc:${state.scaleMultiplier.toFixed(2)}x`;
      }
    });

    footer.append(resetButton, copyFeedbackElement, copyButton);

    panelElement.append(header, tabsContainer, ...sectionsByTab.values(), footer);
    activateTab(activeTab);
    syncAllControlsFromState();
  }

  if (toggleButton && panelElement) {
    buildPanelDom();
    toggleButton.addEventListener('click', () => {
      const willOpen = panelElement.hidden;
      setPanelOpen(willOpen);
    });
  }

  return {
    getState: () => ({ ...state }),
    refreshContextLabels: syncAllControlsFromState,
    reset: resetState
  };
}

