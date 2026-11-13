/**
 * Painel interativo de testes para ajuste em tempo real de posição, escala e rotação 3D.
 */

const DEFAULT_CAMERA_FOV_DEGREES = 68;

const DEFAULT_TRANSFORM_STATE = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  scaleMultiplier: 1,
  rotationXDeg: 0,
  rotationYDeg: 0,
  rotationZDeg: 0,
  northOffsetDeg: 0,
  cameraFovDeg: DEFAULT_CAMERA_FOV_DEGREES,
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
  ],
  sensors: [
    {
      key: 'northOffsetDeg',
      label: 'Ajuste de Norte (Bússola)',
      min: -180,
      max: 180,
      step: 1,
      formatValue: (value) => `${value > 0 ? '+' : ''}${Math.round(value)}°`
    },
    {
      key: 'cameraFovDeg',
      label: 'FOV da Lente (Câmera)',
      min: 50,
      max: 95,
      step: 1,
      formatValue: (value, context) => {
        const verticalFov = context?.appliedVerticalFovDeg;
        if (Number.isFinite(verticalFov) && verticalFov > 0) {
          return `${Math.round(value)}° (V:${Math.round(verticalFov)}°)`;
        }
        return `${Math.round(value)}°`;
      }
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
 * Cria o painel de calibração 3D e conecta eventos ao controlador da cena e sensores.
 *
 * @param {object} options
 * @param {HTMLButtonElement | null} options.toggleButton
 * @param {HTMLElement | null} options.panelElement
 * @param {(state: object) => void} options.onChange
 * @param {() => { id: string, title: string, elevationMeters: number, targetDimensionMeters: number }} options.getInstallationContext
 * @param {number} [options.initialCameraFovDeg]
 * @param {() => number} [options.getAppliedVerticalFovDeg]
 * @param {() => number | null} [options.onAlignNorthToTarget]
 * @param {() => boolean} [options.onToggleCompassLock]
 * @param {() => boolean} [options.onToggleGpsLock]
 * @param {() => void} [options.onReanchorGps]
 * @param {() => void} [options.onResetSensors]
 */
export function createTransformControls({
  toggleButton,
  panelElement,
  onChange,
  getInstallationContext,
  initialCameraFovDeg = DEFAULT_CAMERA_FOV_DEGREES,
  getAppliedVerticalFovDeg,
  onAlignNorthToTarget,
  onToggleCompassLock,
  onToggleGpsLock,
  onReanchorGps,
  onResetSensors
}) {
  const state = {
    ...DEFAULT_TRANSFORM_STATE,
    cameraFovDeg: initialCameraFovDeg
  };
  const controlBindings = new Map();
  let activeTab = 'position';
  let animateToggleButton = null;
  let compassLockButton = null;
  let gpsLockButton = null;
  let sensorNoteElement = null;
  let copyFeedbackElement = null;

  let isCompassLocked = false;
  let isGpsLocked = false;

  function emitChange() {
    onChange({ ...state });
  }

  function updateControlReadout(definition, inputElement, outputElement) {
    const numericValue = Number(state[definition.key]);
    const formatted = definition.formatValue(numericValue, {
      baseDimensionMeters: getInstallationContext().targetDimensionMeters,
      appliedVerticalFovDeg: getAppliedVerticalFovDeg?.()
    });
    outputElement.textContent = formatted;
    inputElement.setAttribute('aria-valuetext', formatted);
  }

  function syncToggleButtonStates() {
    if (animateToggleButton) {
      animateToggleButton.setAttribute('aria-pressed', String(state.autoAnimate));
      animateToggleButton.classList.toggle('is-active', state.autoAnimate);
      animateToggleButton.textContent = state.autoAnimate
        ? 'Animação: Ligada'
        : 'Animação: Pausada';
    }

    if (compassLockButton) {
      compassLockButton.setAttribute('aria-pressed', String(isCompassLocked));
      compassLockButton.classList.toggle('is-active', isCompassLocked);
      compassLockButton.textContent = isCompassLocked
        ? 'Norte: Travado (Gyro)'
        : 'Norte: Fusão Auto';
    }

    if (gpsLockButton) {
      gpsLockButton.setAttribute('aria-pressed', String(isGpsLocked));
      gpsLockButton.classList.toggle('is-active', isGpsLocked);
      gpsLockButton.textContent = isGpsLocked ? 'GPS: Travado' : 'GPS: Ativo';
    }
  }

  function syncAllControlsFromState() {
    for (const [key, binding] of controlBindings.entries()) {
      binding.inputElement.value = String(state[key]);
      syncSliderTrackVariables(binding.inputElement);
      updateControlReadout(binding.definition, binding.inputElement, binding.outputElement);
    }

    syncToggleButtonStates();
  }

  function resetState() {
    Object.assign(state, DEFAULT_TRANSFORM_STATE);
    isCompassLocked = false;
    isGpsLocked = false;
    onResetSensors?.();
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
      emitChange();
      syncSliderTrackVariables(sliderInput);
      updateControlReadout(definition, sliderInput, outputElement);
    });

    controlBindings.set(definition.key, {
      definition,
      inputElement: sliderInput,
      outputElement
    });

    rowElement.append(headerRow, sliderInput);
    return rowElement;
  }

  function createActionButton(labelText, clickHandler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ar-action-btn';
    button.textContent = labelText;
    button.addEventListener('click', clickHandler);
    return button;
  }

  function buildSensorsExtras(sectionElement) {
    const actionsGrid = document.createElement('div');
    actionsGrid.className = 'ar-sensor-actions-grid';

    const alignCenterButton = createActionButton('Alinhar obra ao centro', () => {
      const updatedOffset = onAlignNorthToTarget?.();
      if (typeof updatedOffset === 'number' && Number.isFinite(updatedOffset)) {
        state.northOffsetDeg = updatedOffset;
        syncAllControlsFromState();
        if (copyFeedbackElement) {
          copyFeedbackElement.textContent = `Norte: ${updatedOffset > 0 ? '+' : ''}${updatedOffset}°`;
        }
      }
    });

    compassLockButton = createActionButton('Norte: Fusão Auto', () => {
      if (onToggleCompassLock) {
        isCompassLocked = Boolean(onToggleCompassLock());
      } else {
        isCompassLocked = !isCompassLocked;
      }
      syncToggleButtonStates();
    });

    gpsLockButton = createActionButton('GPS: Ativo', () => {
      if (onToggleGpsLock) {
        isGpsLocked = Boolean(onToggleGpsLock());
      } else {
        isGpsLocked = !isGpsLocked;
      }
      syncToggleButtonStates();
    });

    const reanchorGpsButton = createActionButton('Reancorar GPS', () => {
      onReanchorGps?.();
      isGpsLocked = false;
      syncToggleButtonStates();
      if (copyFeedbackElement) {
        copyFeedbackElement.textContent = 'GPS reancorado';
      }
    });

    actionsGrid.append(alignCenterButton, compassLockButton, gpsLockButton, reanchorGpsButton);

    sensorNoteElement = document.createElement('p');
    sensorNoteElement.className = 'ar-sensor-note';
    sensorNoteElement.textContent =
      'Dica: aponte para onde a obra deve ficar e toque em "Alinhar obra ao centro". Depois trave o Norte.';

    sectionElement.append(actionsGrid, sensorNoteElement);
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
    title.textContent = 'Ajuste 3D • Posição, Escala & Sensores';

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
      { id: 'rotation', label: 'Rotação' },
      { id: 'sensors', label: 'Sensores' }
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
        animateToggleButton = createActionButton('', () => {
          state.autoAnimate = !state.autoAnimate;
          syncAllControlsFromState();
          emitChange();
        });
        sectionElement.appendChild(animateToggleButton);
      }

      if (tab.id === 'sensors') {
        buildSensorsExtras(sectionElement);
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
    reset: resetState,
    setSensorStatuses: ({ orientationText, compassLocked, gpsLocked }) => {
      if (typeof compassLocked === 'boolean') {
        isCompassLocked = compassLocked;
      }
      if (typeof gpsLocked === 'boolean') {
        isGpsLocked = gpsLocked;
      }
      if (sensorNoteElement && orientationText) {
        sensorNoteElement.textContent = orientationText;
      }
      syncToggleButtonStates();
    }
  };
}

