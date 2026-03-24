# CuidarJuntos — Sistema de Cuidado Familiar

App PWA mobile-first para gerenciamento do cuidado de pacientes, usado por família e equipe de enfermagem.

---

## Estrutura do Projeto

```
CuidarJuntos/
├── app.html              ← App completo (HTML + CSS + JS em um único arquivo)
├── index.html            ← Página de apresentação / redirecionamento
├── CuidarJuntos_GAS.gs   ← Backend Google Apps Script (copiar para o GAS)
└── server.js             ← Servidor local para desenvolvimento
```

---

## Como Usar

### Opção 1 — GitHub Pages (recomendado para produção)

1. Faça fork deste repositório no GitHub
2. Vá em **Settings → Pages → Source → main / (root)**
3. O app ficará disponível em: `https://[seu-usuario].github.io/CuidarJuntos/app.html`
4. Compartilhe esse link com a família e equipe

### Opção 2 — Celular local (Wi-Fi)

```bash
node server.js
```
Acesse: `http://[IP-DO-PC]:8080`

---

## Configuração do Backend (Google Apps Script)

### Passo 1 — Criar o Apps Script

1. Acesse [script.google.com](https://script.google.com) com sua conta Google
2. Clique em **Novo projeto**
3. Apague o código padrão e cole todo o conteúdo de `CuidarJuntos_GAS.gs`
4. Salve (Ctrl+S) com o nome: `CuidarJuntos`

### Passo 2 — Criar a planilha do paciente

1. No editor do Apps Script, clique em **Executar** → selecione a função `criarPaciente`
2. Clique em **Executar** novamente
3. Uma pasta será criada no seu Google Drive em: `CuidarJuntos - Pacientes / Paciente - [Nome]`
4. Abra a planilha criada e copie o **ID** da URL:
   - URL: `docs.google.com/spreadsheets/d/`**ID_AQUI**`/edit`

### Passo 3 — Publicar como Web App

1. No editor, clique em **Implantar → Novo deploy**
2. Tipo: **Web App**
3. Executar como: **Minha conta**
4. Quem tem acesso: **Qualquer pessoa**
5. Clique em **Implantar** e copie a URL gerada

### Passo 4 — Configurar no App

1. Abra o app e faça login
2. Vá em **Menu → Configurações**
3. Cole a **URL do Apps Script** e o **ID da Planilha**
4. Clique em **Salvar** e depois **Testar**

---

## Usuários Padrão

| Nome | Perfil | Senha temporária |
|------|--------|-----------------|
| Renato | Família | `Renato@26` |
| Rene | Família | `Rene@2026` |
| Ronaldo | Família | `Ronald@26` |
| Rubia | Família | `Rubia@026` |
| Enfermagem | Equipe de Enfermagem | `Enf@2026` |

> **Importante:** Cada usuário deve alterar a senha no primeiro acesso (Menu → Configurações → Alterar senha).

---

## Funcionalidades

| Módulo | Família | Equipe de Enfermagem |
|--------|---------|----------------------|
| Sinais Vitais | ✅ Ver | ✅ Registrar |
| Medicamentos | ✅ Ver | ✅ Registrar |
| Cuidados Diários | ✅ Ver | ✅ Registrar |
| Visitas Médicas | ✅ Completo | ✅ Completo |
| Exames | ✅ Completo | ✅ Completo |
| Agenda | ✅ Completo | ✅ Completo |
| Financeiro | ✅ Completo | ❌ Bloqueado |
| Chat Familiar | ✅ Completo | ✅ Completo |
| Documentos | ✅ Completo | ✅ Completo |
| Relatórios | ✅ Completo | ❌ Bloqueado |
| Configurações | ✅ Completo | — |

---

## Tecnologia

- **Frontend:** HTML + CSS + JavaScript puro (sem framework)
- **Backend:** Google Apps Script (serverless)
- **Banco de dados:** Google Sheets (uma planilha por paciente)
- **Arquivos:** Google Drive (uma pasta por paciente)
- **Hospedagem:** GitHub Pages (gratuito)
- **Offline:** localStorage para dados temporários

---

## Para vender para outra família

1. A família cria uma conta Google
2. Você copia o `CuidarJuntos_GAS.gs` para o Apps Script deles (ou eles mesmos fazem)
3. Roda `criarPaciente()` para criar a planilha do paciente deles
4. Publica o Web App
5. A família acessa via GitHub Pages e configura URL + ID da planilha nas Configurações

---

## Suporte

Desenvolvido por **RSo** · [cuidarjuntos.oficial.app@gmail.com](mailto:cuidarjuntos.oficial.app@gmail.com)
