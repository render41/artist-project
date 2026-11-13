import * as THREE from 'three';
import { GLTFLoader } from '../libs/GLTFLoader.js';

const sharedGltfLoader = new GLTFLoader();

/**
 * Centraliza e normaliza a escala de uma cena GLTF para um tamanho alvo em metros virtuais.
 * Isso corrige pivôs deslocados na exportação e padroniza a legibilidade espacial em campo.
 *
 * @param {THREE.Object3D} rawScene
 * @param {number} targetDimensionMeters
 * @returns {THREE.Group}
 */
function normalizeModelTransform(rawScene, targetDimensionMeters) {
  const anchorGroup = new THREE.Group();
  rawScene.updateMatrixWorld(true);

  const boundingBox = new THREE.Box3().setFromObject(rawScene);
  if (boundingBox.isEmpty()) {
    anchorGroup.add(rawScene);
    return anchorGroup;
  }

  const dimensions = new THREE.Vector3();
  const geometricCenter = new THREE.Vector3();
  boundingBox.getSize(dimensions);
  boundingBox.getCenter(geometricCenter);

  const largestAxis = Math.max(dimensions.x, dimensions.y, dimensions.z, 0.001);
  const scaleFactor = targetDimensionMeters / largestAxis;

  const pivotWrapper = new THREE.Group();
  rawScene.position.sub(geometricCenter);
  pivotWrapper.add(rawScene);
  pivotWrapper.scale.setScalar(scaleFactor);

  anchorGroup.add(pivotWrapper);
  return anchorGroup;
}

/**
 * Ajusta flags de materiais carregados para melhor renderização sob iluminação WebAR.
 *
 * @param {THREE.Object3D} rootObject
 */
function configureMaterials(rootObject) {
  rootObject.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    node.frustumCulled = false;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
      }
      material.needsUpdate = true;
    }
  });
}

/**
 * Libera geometrias, materiais e texturas de um modelo 3D da memória da GPU.
 *
 * @param {THREE.Object3D | null} rootObject
 */
export function disposeModelObject(rootObject) {
  if (!rootObject) {
    return;
  }

  rootObject.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (node.geometry) {
      node.geometry.dispose();
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }

      for (const value of Object.values(material)) {
        if (value && typeof value.dispose === 'function' && value.isTexture) {
          value.dispose();
        }
      }

      if (typeof material.dispose === 'function') {
        material.dispose();
      }
    }
  });
}

/**
 * Carrega um arquivo GLB, normaliza sua escala/pivô e prepara mixer de animação se existir.
 *
 * @param {object} options
 * @param {string} options.modelUrl
 * @param {number} options.targetDimensionMeters
 * @param {(progressRatio: number | null) => void} [options.onProgress]
 * @returns {Promise<{ object: THREE.Group, mixer: THREE.AnimationMixer | null }>}
 */
export function loadNormalizedGltfModel({ modelUrl, targetDimensionMeters, onProgress }) {
  return new Promise((resolve, reject) => {
    sharedGltfLoader.load(
      modelUrl,
      (gltf) => {
        try {
          configureMaterials(gltf.scene);
          const normalizedGroup = normalizeModelTransform(gltf.scene, targetDimensionMeters);

          let mixer = null;
          if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(gltf.scene);
            for (const clip of gltf.animations) {
              mixer.clipAction(clip).play();
            }
          }

          resolve({ object: normalizedGroup, mixer });
        } catch (error) {
          reject(error);
        }
      },
      (progressEvent) => {
        if (!onProgress) {
          return;
        }
        if (progressEvent.lengthComputable && progressEvent.total > 0) {
          const ratio = Math.min(Math.max(progressEvent.loaded / progressEvent.total, 0), 1);
          onProgress(ratio);
          return;
        }
        onProgress(null);
      },
      (error) => {
        reject(error);
      }
    );
  });
}

