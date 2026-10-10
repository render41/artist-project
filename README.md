# ARtist • Intervenção Artística em WebAR

Projeto de Realidade Aumentada baseada na Web (WebAR) executado diretamente no navegador do smartphone via QR Codes, sem necessidade de download de aplicativos.

## 1. Diretrizes Técnicas do Projeto
- **Escopo 100% 2D:** Sem geometria 3D, malhas pesadas ou arquivos `.glb`/`.gltf`. Todas as obras são ilustrações 2D transparentes (`PNG` ou `WebP`) renderizadas via `<a-image>`.
- **Arquitetura Multi-Páginas:** Cada QR Code aponta para um arquivo `.html` estático autônomo, evitando vazamento de memória (*memory leaks*) de WebGL/Webcam e simplificando o ciclo de vida da câmera nos dispositivos móveis.
- **Pilha Tecnológica:** HTML5, CSS3, JavaScript nativo, [A-Frame 1.3.0](https://aframe.io/releases/1.3.0/aframe.min.js) e [AR.js](https://github.com/AR-js-org/AR.js) (versão compatível com a biblioteca de tracking).
- **Preservação de Aspect Ratio:** Uso obrigatório do componente customizado `auto-ratio` para evitar distorção visual das obras.

---

## 2. Estrutura de Pastas

Estrutura desenhada para hospedagem estática (GitHub Pages, Vercel, Netlify ou Cloudflare Pages):

```text
artist-project/
├── index.html                 # Página inicial ou redirecionamento/apresentação geral
├── test-marker.html           # Página de teste do marcador Hiro com componente auto-ratio
├── marker/                    # Experiências de Marker Tracking (.patt / presets)
│   ├── obra-01.html
│   ├── obra-02.html
│   └── obra-03.html
├── nft/                       # Experiências de Image Tracking / NFT (Natural Feature Tracking)
│   ├── obra-04.html
│   ├── obra-05.html
│   └── obra-06.html
├── location/                  # Experiências baseadas em Localização / GPS
│   ├── obra-07.html
│   ├── obra-08.html
│   └── obra-09.html
├── assets/                    # Ativos visuais e arquivos de calibração
│   ├── images/                # Ilustrações 2D transparentes (PNG/WebP otimizados)
│   │   └── sample-art.png
│   ├── markers/               # Arquivos de padrão de marcadores (.patt) e referências visuais
│   └── nft/                   # Conjuntos de descritores de imagem (.fset, .fset3, .iset)
├── css/                       # Estilos globais e overlays de interface WebAR
│   └── main.css
└── js/                        # Scripts e componentes do A-Frame
    └── components/
        └── auto-ratio.js      # Componente de cálculo dinâmico de aspect ratio
```

---

## 3. Componente A-Frame: `auto-ratio`

### Problema Resolvido
A primitiva `<a-image>` do A-Frame assume dimensões padrão quadradas (`width: 1`, `height: 1`) quando não especificadas, ou exige valores fixos manuais. Isso faz com que obras de proporções variadas (como 3:4, 2:3, 16:9) fiquem achatadas ou esticadas.

### Como Funciona
O componente `auto-ratio`:
1. Intercepta o atributo `src` da tag `<a-image>` (seja um ID de asset como `#sample-art` ou uma URL direta).
2. Aguarda e extrai o `naturalWidth` e `naturalHeight` da imagem.
3. Mantém a largura base configurada no atributo `width` (padrão: `1.5` metros virtuais).
4. Calcula a nova altura proporcional:
   $$\text{height} = \text{largura\_base} \times \left( \frac{\text{naturalHeight}}{\text{naturalWidth}} \right)$$
5. Atualiza os atributos `width` e `height` do elemento e dispara o evento `autoratiocalculated`.
6. Monitora alterações dinâmicas na imagem via `materialtextureloaded`, `componentchanged` e `MutationObserver`.

### Exemplo de Uso
```html
<a-image
  src="#sample-art"
  position="0 0.05 0"
  rotation="-90 0 0"
  auto-ratio="width: 1.5">
</a-image>
```

---

## 4. Como Executar Localmente com HTTPS

> **Aviso de Segurança dos Navegadores:** O acesso à câmera (`getUserMedia`) e à localização (`Geolocation API`) exige conexão segura (**HTTPS** ou `localhost`). Para testar no celular via rede Wi-Fi local, utilize uma das opções abaixo:

### Opção A: Usando `npx local-ssl-proxy` ou `caddy` / `mkcert`
```bash
# 1. Iniciar servidor estático simples na porta 8080
npx serve -l 8080 .

# 2. Em outro terminal, criar túnel HTTPS
npx local-ssl-proxy --source 8443 --target 8080
```

### Opção B: Usando `live-server` com certificado SSL
```bash
npx live-server --ssl --host=0.0.0.0 --port=8443
```

Acesse no navegador:
`https://localhost:8443/test-marker.html`
