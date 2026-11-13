# ARtist • Intervenção Artística em WebAR (Geolocation 3D)

Projeto de Realidade Aumentada baseada na Web (WebAR) com foco em **geolocalização (GPS + bússola)** executado diretamente no navegador do smartphone via QR Codes, sem necessidade de download de aplicativos.

## 1. Diretrizes Técnicas do Projeto
- **Escopo Geolocation 3D:** Modelos 3D otimizados em formato **`.glb`**, ancorados em coordenadas geográficas reais via **Three.js (r170)** + **`GLTFLoader`** + **LocAR.js**.
- **Arquitetura Modular + Multi-Páginas:** Cada obra possui sua página autônoma (`location/01.html`, `location/02.html`, `location/03.html`), compartilhando os módulos de carregamento, normalização de pivô/escala e HUD espacial em `js/location/`.
- **Laboratório de Bancada:** `test-location.html` permite alternar entre as obras e validar visualmente com os modos `+15m à Frente` e `Simular (25m)` mesmo em ambientes fechados.

---

## 2. Obras Cadastradas

| Obra | Arquivo 3D | Local | Coordenadas (Lat, Lon) | Página |
| :--- | :--- | :--- | :--- | :--- |
| **01 • Mão Apontando** | `assets/location/01_mao_apontando.glb` | Meio do Cruzamento da Avenida da Universidade | `-3.740955, -38.539123` | `location/01.html` |
| **02 • Mão em Pé** | `assets/location/02_mao_em_pe.glb` | Pátio Central IFCE | `-3.744483, -38.536499` | `location/02.html` |
| **03 • Origami** | `assets/location/origami.glb` | Lago do Jacarey | `-3.800710, -38.490736` | `location/03.html` |

---

## 3. Estrutura Principal

```text
artist-project/
├── index.html                           # Portal com acesso direto às obras georreferenciadas
├── test-location.html                   # Laboratório unificado para troca de obra e calibração
├── location/
│   ├── 01.html                          # Obra 01 — Mão Apontando
│   ├── 02.html                          # Obra 02 — Mão em Pé
│   └── 03.html                          # Obra 03 — Origami
├── assets/
│   └── location/
│       ├── 01_mao_apontando.glb
│       ├── 02_mao_em_pe.glb
│       └── origami.glb
├── css/
│   └── main.css                         # Estilos do HUD WebAR e barra de progresso
└── js/
    ├── libs/
    │   ├── three.module.js              # Three.js r170
    │   ├── GLTFLoader.js                # Loader GLB/GLTF oficial r170
    │   ├── locar.es.js                  # LocAR.js
    │   └── es-module-shims.js
    ├── utils/
    │   └── BufferGeometryUtils.js       # Dependência do GLTFLoader r170
    └── location/
        ├── installations-catalog.js     # Coordenadas e parâmetros 3D das obras
        ├── model-loader.js              # Carregamento, normalização de pivô/escala e dispose
        ├── spatial-hud.js               # Bússola, mira e progresso nativo <progress>
        ├── location-ar-experience.js    # Controlador Three.js + LocAR + iluminação PBR
        └── location-page-bootstrap.js   # Inicialização compartilhada das páginas HTML
```

---

## 4. Como Executar Localmente com HTTPS

> **Aviso de Segurança dos Navegadores:** O acesso à câmera (`getUserMedia`), orientação (`DeviceOrientationEvent`) e localização (`Geolocation API`) exige conexão segura (**HTTPS** ou `localhost`).

```bash
# 1. Iniciar servidor estático na porta 8080
npx serve -l 8080 .

# 2. Em outro terminal, criar túnel HTTPS para testar no smartphone via Wi-Fi
npx local-ssl-proxy --source 8443 --target 8080
```

Acesse: `https://localhost:8443/`
