import * as THREE from 'three';
import { App } from 'locar';
import { findInstallationById, INSTALLATIONS } from './installations-catalog.js';
import { disposeModelObject, loadNormalizedGltfModel } from './model-loader.js';
import { createSpatialHud } from './spatial-hud.js';
import { createTransformControls } from './transform-controls.js';

const SPATIAL_CONFIG = Object.freeze({
  cameraHorizontalFov: 80,
  cameraNear: 0.1,
  cameraFar: 15000,
  gpsMinDistanceMeters: 0.2,
  gpsMinAccuracyMeters: 100,
  orientationSmoothing: 0.2,
  hudAngleSmoothing: 0.18,
  aheadTestDistanceMeters: 15.0,
  simulationLatitudeOffset: -0.00022,
  levitationFrequency: 0.0022
});

/**
 * Configura iluminação equilibrada para modelos 3D PBR sobre o vídeo da câmera.
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
function configureSceneRendering(scene, renderer) {
  if (renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x3f3f46, 1.35);
  scene.add(hemisphereLight);

  const primaryDirectionalLight = new THREE.DirectionalLight(0xffffff, 1.65);
  primaryDirectionalLight.position.set(12, 24, 16);
  scene.add(primaryDirectionalLight);

  const fillDirectionalLight = new THREE.DirectionalLight(0xe4e4e7, 0.75);
  fillDirectionalLight.position.set(-14, 8, -14);
  scene.add(fillDirectionalLight);
}

/**
 * Cria um marcador wireframe discreto exibido enquanto o arquivo GLB é baixado.
 * @returns {THREE.Group}
 */
function createLoadingPlaceholder() {
  const placeholderGroup = new THREE.Group();
  const geometry = new THREE.OctahedronGeometry(1.1, 0);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.55
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  placeholderGroup.add(mesh);
  return placeholderGroup;
}

/**
 * Inicializa uma experiência Location AR 3D completa com LocAR.js e Three.js.
 *
 * @param {object} options
 * @param {string} options.initialInstallationId ID inicial ('01', '02', '03')
 * @param {object} options.elements Referências aos elementos do DOM
 */
export async function startLocationArExperience({ initialInstallationId, elements }) {
  const hud = createSpatialHud(elements);
  const animationClock = new THREE.Clock();

  let currentInstallation = findInstallationById(initialInstallationId);
  let currentTargetMode = 'real'; // 'real' | 'ahead' | 'simulate'

  let appInstance = null;
  let locarInstance = null;
  let anchorGroup = null;
  let transformGroup = null;
  let motionGroup = null;
  let activeModelGroup = null;
  let activeAnimationMixer = null;
  let loadSequenceCounter = 0;

  let hasGpsOrigin = false;
  let smoothedYawDegrees = 0;
  let smoothedPitchDegrees = 0;
  let isAutoAnimationEnabled = true;

  const transformControls = createTransformControls({
    toggleButton: elements.transformToggleButton,
    panelElement: elements.transformPanel,
    getInstallationContext: () => currentInstallation,
    onChange: (nextState) => {
      applyTransformState(nextState);
    }
  });

  /**
   * Aplica deslocamento de posição, escala e rotação ao grupo de calibração 3D.
   * @param {object} transformState
   */
  function applyTransformState(transformState) {
    isAutoAnimationEnabled = Boolean(transformState.autoAnimate);
    if (!transformGroup) {
      return;
    }

    transformGroup.position.set(
      transformState.offsetX,
      transformState.offsetY,
      transformState.offsetZ
    );
    transformGroup.scale.setScalar(transformState.scaleMultiplier);
    transformGroup.rotation.set(
      THREE.MathUtils.degToRad(transformState.rotationXDeg),
      THREE.MathUtils.degToRad(transformState.rotationYDeg),
      THREE.MathUtils.degToRad(transformState.rotationZDeg)
    );

    if (!isAutoAnimationEnabled && motionGroup) {
      motionGroup.position.y = 0;
    }
  }

  /**
   * Atualiza o texto da barra de status com a coordenada geográfica ativa.
   */
  function updateTargetCoordsDisplay() {
    if (currentTargetMode === 'ahead') {
      hud.setTargetCoordinatesLabel(
        `Alvo: +${SPATIAL_CONFIG.aheadTestDistanceMeters}m à frente (${currentInstallation.title})`
      );
      return;
    }

    hud.setTargetCoordinatesLabel(
      `Alvo: ${currentInstallation.latitude.toFixed(5)}, ${currentInstallation.longitude.toFixed(5)}`
    );
  }

  /**
   * Posiciona a âncora 3D na coordenada GPS real da obra atual.
   */
  function positionAnchorAtGeoTarget() {
    if (!locarInstance || !anchorGroup || !hasGpsOrigin) {
      return;
    }

    try {
      const [worldX, worldZ] = locarInstance.lonLatToWorldCoords(
        currentInstallation.longitude,
        currentInstallation.latitude
      );
      anchorGroup.position.set(worldX, currentInstallation.elevationMeters, worldZ);
    } catch (error) {
      console.warn('[LocationAR] Aguardando origem GPS para posicionar obra:', error);
    }
  }

  /**
   * Posiciona a âncora 3D a uma distância fixa à frente da câmera para validação visual.
   */
  function positionAnchorAheadOfCamera() {
    if (!appInstance || !anchorGroup) {
      return;
    }

    const forwardDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(
      appInstance.camera.quaternion
    );
    forwardDirection.y = 0;

    if (forwardDirection.lengthSq() < 0.0001) {
      forwardDirection.set(0, 0, -1);
    } else {
      forwardDirection.normalize();
    }

    const targetX =
      appInstance.camera.position.x +
      forwardDirection.x * SPATIAL_CONFIG.aheadTestDistanceMeters;
    const targetZ =
      appInstance.camera.position.z +
      forwardDirection.z * SPATIAL_CONFIG.aheadTestDistanceMeters;

    anchorGroup.position.set(targetX, currentInstallation.elevationMeters, targetZ);
  }

  /**
   * Remove o modelo atualmente montado na âncora e libera recursos da GPU.
   */
  function clearActiveModel() {
    if (!motionGroup || !activeModelGroup) {
      return;
    }
    motionGroup.remove(activeModelGroup);
    disposeModelObject(activeModelGroup);
    activeModelGroup = null;
    activeAnimationMixer = null;
  }

  /**
   * Carrega e monta o modelo GLB da instalação selecionada.
   * @param {Readonly<object>} installation
   */
  async function loadInstallationModel(installation) {
    const requestSequence = ++loadSequenceCounter;

    clearActiveModel();
    activeModelGroup = createLoadingPlaceholder();
    motionGroup.add(activeModelGroup);

    hud.showLoadingProgress(null, `Carregando ${installation.title}...`);

    try {
      const { object, mixer } = await loadNormalizedGltfModel({
        modelUrl: installation.modelUrl,
        targetDimensionMeters: installation.targetDimensionMeters,
        onProgress: (ratio) => {
          if (requestSequence !== loadSequenceCounter) {
            return;
          }
          hud.showLoadingProgress(ratio, `Carregando ${installation.title}`);
        }
      });

      if (requestSequence !== loadSequenceCounter) {
        disposeModelObject(object);
        return;
      }

      clearActiveModel();
      activeModelGroup = object;
      activeAnimationMixer = mixer;
      motionGroup.position.set(0, 0, 0);
      motionGroup.rotation.set(0, 0, 0);
      motionGroup.add(activeModelGroup);

      hud.hideLoadingProgress();
      hud.setStatus(`${installation.title} carregada em 3D`);

      if (currentTargetMode === 'real' || currentTargetMode === 'simulate') {
        positionAnchorAtGeoTarget();
      }
    } catch (error) {
      if (requestSequence !== loadSequenceCounter) {
        return;
      }
      console.error('[LocationAR] Erro ao carregar modelo GLB:', error);
      hud.hideLoadingProgress();
      hud.setStatus(`Falha ao carregar modelo 3D de ${installation.title}.`);
    }
  }

  /**
   * Atualiza o botão visualmente selecionado entre os modos de destino.
   * @param {HTMLButtonElement | null} activeButton
   */
  function setActiveModeButton(activeButton) {
    const modeButtons = [
      elements.buttonTargetReal,
      elements.buttonTargetAhead,
      elements.buttonTargetSimulate
    ];
    for (const button of modeButtons) {
      button?.classList.remove('is-active');
    }
    activeButton?.classList.add('is-active');
  }

  /**
   * Atualiza os rótulos de cabeçalho e botão de modo real conforme a instalação ativa.
   * @param {Readonly<object>} installation
   */
  function syncInstallationLabels(installation) {
    const labelPrefix = installation.shortLabel || `Obra ${installation.id}`;
    if (elements.badgeElement) {
      elements.badgeElement.textContent = `${labelPrefix} • ${installation.title}`;
    }
    if (elements.buttonTargetReal) {
      elements.buttonTargetReal.textContent = `${labelPrefix} (Real)`;
    }
  }

  /**
   * Alterna para outra obra do catálogo (usado no laboratório unificado).
   * @param {string} installationId
   */
  async function selectInstallation(installationId) {
    const nextInstallation = findInstallationById(installationId);
    currentInstallation = nextInstallation;

    syncInstallationLabels(nextInstallation);

    updateTargetCoordsDisplay();
    transformControls.refreshContextLabels();

    if (currentTargetMode === 'simulate' && locarInstance) {
      const simulatedLatitude =
        currentInstallation.latitude + SPATIAL_CONFIG.simulationLatitudeOffset;
      locarInstance.fakeGps(currentInstallation.longitude, simulatedLatitude);
    } else if (currentTargetMode === 'ahead') {
      positionAnchorAheadOfCamera();
    } else {
      positionAnchorAtGeoTarget();
    }

    await loadInstallationModel(nextInstallation);
  }

  /**
   * Vincula os controles de modo de alvo e seletor de obras.
   */
  function bindInteractionControls() {
    elements.buttonTargetReal?.addEventListener('click', () => {
      currentTargetMode = 'real';
      setActiveModeButton(elements.buttonTargetReal);
      updateTargetCoordsDisplay();
      positionAnchorAtGeoTarget();
      hud.setStatus(
        hasGpsOrigin
          ? `Alvo definido para ${currentInstallation.title} (${currentInstallation.locationName})`
          : 'Aguardando sinal GPS para ancorar na coordenada real...'
      );
    });

    elements.buttonTargetAhead?.addEventListener('click', () => {
      currentTargetMode = 'ahead';
      setActiveModeButton(elements.buttonTargetAhead);
      positionAnchorAheadOfCamera();
      updateTargetCoordsDisplay();
      hud.setStatus(
        `${currentInstallation.title} posicionada ${SPATIAL_CONFIG.aheadTestDistanceMeters}m à sua frente`
      );
    });

    elements.buttonTargetSimulate?.addEventListener('click', () => {
      currentTargetMode = 'simulate';
      setActiveModeButton(elements.buttonTargetSimulate);
      if (!locarInstance) {
        return;
      }

      const simulatedLatitude =
        currentInstallation.latitude + SPATIAL_CONFIG.simulationLatitudeOffset;
      locarInstance.fakeGps(currentInstallation.longitude, simulatedLatitude);
      hasGpsOrigin = true;
      positionAnchorAtGeoTarget();
      updateTargetCoordsDisplay();
      hud.setStatus(`Posição simulada a ~25m de ${currentInstallation.title}`);
    });

    if (Array.isArray(elements.installationButtons)) {
      for (const button of elements.installationButtons) {
        button.addEventListener('click', () => {
          const targetId = button.dataset.installationId;
          if (!targetId || targetId === currentInstallation.id) {
            return;
          }

          for (const itemButton of elements.installationButtons) {
            itemButton.classList.toggle('is-active', itemButton === button);
          }
          selectInstallation(targetId);
        });
      }
    }
  }

  /**
   * Loop contínuo de animação 3D, levitação suave e atualização direcional do HUD.
   */
  function renderFrame() {
    requestAnimationFrame(renderFrame);

    if (!appInstance || !anchorGroup || !transformGroup || !motionGroup) {
      return;
    }

    const deltaSeconds = animationClock.getDelta();
    if (activeAnimationMixer && isAutoAnimationEnabled) {
      activeAnimationMixer.update(deltaSeconds);
    }

    if (isAutoAnimationEnabled) {
      const elapsedMs = performance.now();
      const levitationOffset =
        Math.sin(elapsedMs * SPATIAL_CONFIG.levitationFrequency) *
        currentInstallation.levitationAmplitude;
      motionGroup.position.y = levitationOffset;
      motionGroup.rotation.y += currentInstallation.idleRotationSpeed * deltaSeconds;
    }

    const targetWorldPosition = new THREE.Vector3();
    transformGroup.getWorldPosition(targetWorldPosition);

    const deltaWorldVector = new THREE.Vector3().subVectors(
      targetWorldPosition,
      appInstance.camera.position
    );
    const distanceMeters = deltaWorldVector.length();

    const inverseCameraQuaternion = appInstance.camera.quaternion.clone().invert();
    const localTargetVector = deltaWorldVector.clone().applyQuaternion(inverseCameraQuaternion);

    const rawYawDegrees =
      Math.atan2(localTargetVector.x, -localTargetVector.z) * (180 / Math.PI);
    const groundDistance = Math.hypot(localTargetVector.x, localTargetVector.z);
    const rawPitchDegrees =
      Math.atan2(localTargetVector.y, Math.max(groundDistance, 0.001)) * (180 / Math.PI);

    let yawDelta = rawYawDegrees - smoothedYawDegrees;
    while (yawDelta > 180) yawDelta -= 360;
    while (yawDelta < -180) yawDelta += 360;
    smoothedYawDegrees += yawDelta * SPATIAL_CONFIG.hudAngleSmoothing;
    smoothedPitchDegrees +=
      (rawPitchDegrees - smoothedPitchDegrees) * SPATIAL_CONFIG.hudAngleSmoothing;

    hud.updateOrientation({
      yawDegrees: smoothedYawDegrees,
      pitchDegrees: smoothedPitchDegrees,
      distanceMeters,
      isInFrontOfCamera: localTargetVector.z < 0,
      installationTitle: currentInstallation.title
    });
  }

  try {
    hud.setStatus('Iniciando câmera HD e sensores de orientação...');
    syncInstallationLabels(currentInstallation);
    updateTargetCoordsDisplay();
    transformControls.refreshContextLabels();
    bindInteractionControls();

    appInstance = new App({
      cameraOptions: {
        hFov: SPATIAL_CONFIG.cameraHorizontalFov,
        near: SPATIAL_CONFIG.cameraNear,
        far: SPATIAL_CONFIG.cameraFar
      },
      canvas: elements.canvas,
      videoConstraints: {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      },
      gpsOptions: {
        gpsMinDistance: SPATIAL_CONFIG.gpsMinDistanceMeters,
        gpsMinAccuracy: SPATIAL_CONFIG.gpsMinAccuracyMeters
      },
      deviceOrientationOptions: {
        enabled: true,
        smoothingFactor: SPATIAL_CONFIG.orientationSmoothing
      }
    });

    locarInstance = await appInstance.start();
    configureSceneRendering(appInstance.scene, appInstance.renderer);

    anchorGroup = new THREE.Group();
    anchorGroup.position.set(0, currentInstallation.elevationMeters, -15);
    appInstance.scene.add(anchorGroup);

    transformGroup = new THREE.Group();
    anchorGroup.add(transformGroup);

    motionGroup = new THREE.Group();
    transformGroup.add(motionGroup);

    applyTransformState(transformControls.getState());

    hud.setStatus('Câmera conectada. Carregando escultura 3D e sinal GPS...');
    hud.setGpsBadge('Buscando GPS...');

    locarInstance.on('gpserror', (error) => {
      console.warn('[LocationAR] Erro de geolocalização:', error);
      hud.setGpsBadge('GPS indisponível');
      hud.setStatus(
        'Sinal GPS indisponível ou negado. Use "+15m à Frente" ou "Simular (25m)" para testar.'
      );
    });

    locarInstance.on('gpsupdate', (event) => {
      const { coords } = event.position;
      const accuracyLabel = coords.accuracy ? `±${Math.round(coords.accuracy)}m` : 'ativo';
      hud.setGpsBadge(`GPS: ${accuracyLabel}`);
      hasGpsOrigin = true;

      if (currentTargetMode === 'real' || currentTargetMode === 'simulate') {
        positionAnchorAtGeoTarget();
      }
    });

    locarInstance.startGps();
    requestAnimationFrame(renderFrame);

    await loadInstallationModel(currentInstallation);
  } catch (error) {
    console.error('[LocationAR] Falha ao inicializar experiência:', error);
    hud.hideLoadingProgress();
    hud.setStatus(`Erro ao acessar câmera ou sensores: ${error.message || error}`);
    hud.setGpsBadge('Erro de permissão');
  }
}

export { INSTALLATIONS };

