# ARtist • Intervenção Artística em WebAR (Geolocation 3D)

Projeto de Realidade Aumentada baseada na Web (WebAR) com foco exclusivo em **geolocalização (GPS + bússola)** executado diretamente no navegador do smartphone via QR Codes, sem necessidade de download de aplicativos.

## 1. Diretrizes Técnicas do Projeto
- **Escopo Geolocation 3D:** Modelos 3D otimizados em formato **`.glb`**, ancorados em coordenadas geográficas reais via **Three.js (r170)** + **`GLTFLoader`** + **LocAR.js**.
- **Normalização Automática de Modelos:** Na carga do `.glb`, `model-loader.js` calcula o `THREE.Box3`, centraliza o pivô geométrico e normaliza a maior dimensão para `targetDimensionMeters`.
- **Arquitetura Modular + Multi-Páginas:** Cada obra possui sua página autônoma (`location/01.html`, `location/02.html`, `location/03.html`), compartilhando os módulos de carregamento, HUD espacial e calibração em `js/location/`.
- **Laboratório de Bancada:** `test-location.html` permite alternar entre as obras em tempo real e validar posicionamento em ambientes fechados.

---

## 2. Obras Cadastradas

| Obra | Arquivo 3D | Local | Coordenadas (Lat, Lon) | Página |
| :--- | :--- | :--- | :--- | :--- |
| **01 • Mão Apontando** | `assets/location/01_mao_apontando.glb` | Meio do Cruzamento da Avenida da Universidade | `-3.740955, -38.539123` | `location/01.html` |
| **02 • Mão em Pé** | `assets/location/02_mao_em_pe.glb` | Pátio Central IFCE | `-3.744483, -38.536499` | `location/02.html` |
| **03 • Origami** | `assets/location/origami.glb` | Lago do Jacarey | `-3.800710, -38.490736` | `location/03.html` |
| **04 • Avião de Papel** | `assets/location/aviao_de_papel.glb` | Píer da Messejana | `-3.831601, -38.497673` | `location/04.html` |

---

## 3. Ferramentas de Teste e Calibração 3D

Todas as páginas de Location AR (`location/*.html` e `test-location.html`) contam com ferramentas integradas para teste em campo e em bancada:

### Modos de Ancoragem
- **Obra XX (Real):** Ancora o modelo 3D na coordenada GPS real cadastrada em `installations-catalog.js`.
- **`+15m à Frente`:** Posiciona o objeto 15 metros à frente da orientação atual da câmera (ideal para testes em ambientes fechados sem sinal GPS).
- **`Simular (25m)`:** Aciona `locarInstance.fakeGps(...)` simulando o usuário a ~25 metros ao sul da coordenada real da obra.

### Painel **Ajuste 3D** (`transform-controls.js`)
Acessível pelo botão **Ajuste 3D** no canto superior direito da câmera, opera sobre `transformGroup` (preservando os ajustes relativos mesmo quando o GPS atualiza `anchorGroup`):
- **Posição:** deslocamento relativo à âncora em metros — `Lateral (X)` (`-20m` a `+20m`), `Altura (Y)` (`-5m` a `+15m`) e `Profundidade (Z)` (`-20m` a `+20m`), com passo de `0.25m`.
- **Escala:** multiplicador uniforme de `0.10x` a `4.00x` (passo `0.05x`), exibindo o tamanho resultante em metros.
- **Rotação:** ajuste fino nos 3 eixos (`X`, `Y`, `Z` de `-180°` a `+180°`) + botão **Animação: Ligada/Pausada** para congelar a rotação/levitação automática durante inspeção de ângulos.
- **Resetar tudo / Copiar valores:** restaura os valores padrão ou copia um JSON com `elevationMeters`, `targetDimensionMeters`, `offsetMeters` e `rotationDegrees` calibrados.

---

## 4. Estrutura Principal

```text
artist-project/
├── index.html                           # Portal com acesso direto às obras georreferenciadas
├── test-location.html                   # Laboratório unificado para troca de obra e calibração
├── location/
│   ├── 01.html                          # Obra 01 — Mão Apontando
│   ├── 02.html                          # Obra 02 — Mão em Pé
│   ├── 03.html                          # Obra 03 — Origami
│   └── 04.html                          # Obra 04 — Avião de Papel
├── assets/
│   └── location/
│       ├── 01_mao_apontando.glb
│       ├── 02_mao_em_pe.glb
│       ├── origami.glb
│       └── aviao_de_papel.glb
├── css/
│   └── main.css                         # Estilos do HUD WebAR, <progress> e sliders 3D
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
        ├── transform-controls.js        # Painel de teste (Posição, Escala, Rotação)
        ├── location-ar-experience.js    # Controlador Three.js + LocAR + iluminação PBR
        └── location-page-bootstrap.js   # Inicialização compartilhada das páginas HTML
```

---

## 5. Como Adicionar uma Nova Obra 3D

1. Salve o arquivo `.glb` em `assets/location/`.
2. Cadastre um novo item em `INSTALLATIONS` no arquivo `js/location/installations-catalog.js` com `id`, `title`, `locationName`, `latitude`, `longitude`, `modelUrl`, `elevationMeters` e `targetDimensionMeters`.
3. Crie a página `location/04.html` copiando `location/03.html` e alterando `bootLocationArPage('04')`, e adicione o card correspondente em `index.html` e `test-location.html`.

---

## 6. Como Executar Localmente com HTTPS

> **Aviso de Segurança dos Navegadores:** O acesso à câmera (`getUserMedia`), orientação (`DeviceOrientationEvent`) e localização (`Geolocation API`) exige conexão segura (**HTTPS** ou `localhost`).

```bash
# 1. Iniciar servidor estático na porta 8080
npx serve -l 8080 .

# 2. Em outro terminal, criar túnel HTTPS para testar no smartphone via Wi-Fi
npx local-ssl-proxy --source 8443 --target 8080
```

Acesse: `https://localhost:8443/`
