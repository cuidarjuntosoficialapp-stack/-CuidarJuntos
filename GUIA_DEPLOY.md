# Guia de Deploy — CuidarJuntos

## Visão geral

```
[Celular da família / equipe]
        ↓ abre
[GitHub Pages — app.html]
        ↓ envia dados
[Google Apps Script — CuidarJuntos_GAS.gs]
        ↓ salva em
[Google Sheets — Dados - [Paciente]]
        ↓ arquivos em
[Google Drive — CuidarJuntos - Pacientes / Paciente - [Nome]]
```

---

## PARTE 1 — Subir o app no GitHub Pages

### 1.1 Criar conta no GitHub (se não tiver)
Acesse: https://github.com → Sign up

### 1.2 Criar repositório
1. Clique em **New repository**
2. Nome: `CuidarJuntos`
3. Visibilidade: **Public** (necessário para o Pages gratuito)
4. Clique em **Create repository**

### 1.3 Subir os arquivos
Opção A — pelo site do GitHub:
1. Na página do repositório, clique em **uploading an existing file**
2. Arraste os arquivos: `app.html`, `index.html`, `README.md`
3. Clique em **Commit changes**

Opção B — pelo terminal (Git):
```bash
cd C:\Users\PC\Projetos\CuidarJuntos
git init
git add app.html index.html README.md
git commit -m "primeiro deploy"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/CuidarJuntos.git
git push -u origin main
```

### 1.4 Ativar GitHub Pages
1. No repositório → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)**
4. Clique em **Save**
5. Aguarde ~2 minutos

### 1.5 URL do app
O app ficará em:
```
https://SEU_USUARIO.github.io/CuidarJuntos/app.html
```
Compartilhe esse link via WhatsApp com a família e equipe.

---

## PARTE 2 — Configurar o Google Apps Script

### 2.1 Abrir o Google Apps Script
1. Acesse: https://script.google.com
2. Faça login com a conta Google que será usada para os dados
3. Clique em **Novo projeto**

### 2.2 Colar o código
1. Apague o código padrão (`function myFunction() {}`)
2. Cole todo o conteúdo do arquivo `CuidarJuntos_GAS.gs`
3. Clique no ícone de disquete para salvar
4. Dê o nome **CuidarJuntos** ao projeto

### 2.3 Criar a planilha do paciente
1. No editor, no menu suspenso de funções, selecione **criarPacienteDemo**
2. Antes de executar, edite o nome do paciente na linha:
   ```javascript
   nomePaciente: 'José do Carmo',  // ← coloque o nome real
   ```
3. Clique em **Executar**
4. Na primeira execução, o Google pedirá para autorizar o acesso ao Drive e Sheets — aceite tudo
5. Verifique no Google Drive: uma pasta **CuidarJuntos - Pacientes** terá sido criada

### 2.4 Pegar o ID da planilha
1. Abra o Google Drive e localize:
   `CuidarJuntos - Pacientes → Paciente - [Nome] → Dados - [Nome]`
2. Abra a planilha
3. Copie o **ID** da URL:
   ```
   https://docs.google.com/spreadsheets/d/ ESTE_TRECHO_É_O_ID /edit
   ```
4. Salve esse ID — você vai precisar dele no próximo passo

### 2.5 Publicar como Web App
1. No editor do Apps Script, clique em **Implantar** (canto superior direito)
2. Selecione **Novo deploy**
3. Em "Tipo", clique no ícone ⚙️ e selecione **Web App**
4. Configure:
   - **Descrição:** CuidarJuntos v1.0
   - **Executar como:** Minha conta
   - **Quem tem acesso:** Qualquer pessoa
5. Clique em **Implantar**
6. Copie a **URL do Web App** (começa com `https://script.google.com/macros/s/...`)

---

## PARTE 3 — Configurar o app para conectar ao backend

### 3.1 Primeiro acesso
1. Abra o app no celular: `https://SEU_USUARIO.github.io/CuidarJuntos/app.html`
2. Na tela de login, escolha **Família**
3. Login: `Renato` / Senha: `Renato@26`

### 3.2 Configurar conexão
1. Abra o menu lateral (ícone ☰)
2. Vá em **Configurações**
3. Cole a **URL do Apps Script** no campo correspondente
4. Cole o **ID da planilha** no campo correspondente
5. Clique em **Salvar**
6. Clique em **Testar** — deve aparecer "Conectado"

### 3.3 Alterar senhas temporárias
Cada usuário deve alterar a senha no primeiro acesso:
1. Menu → Configurações → **Alterar senha**
2. Senha atual = senha temporária da tabela abaixo
3. Nova senha = a senha pessoal (mínimo 6 caracteres)

| Usuário | Senha temporária |
|---------|-----------------|
| Renato | Renato@26 |
| Rene | Rene@2026 |
| Ronaldo | Ronald@26 |
| Rubia | Rubia@026 |
| Enfermagem | Enf@2026 |

---

## PARTE 4 — Para uma nova família (vender o sistema)

### O que a nova família precisa fazer:
1. Criar uma conta Google (ou usar a existente)
2. Você copia o arquivo `CuidarJuntos_GAS.gs` para o Apps Script deles
   - Eles seguem o Passo 2 acima
3. Editar `USUARIOS` e `SENHAS_PADRAO` no `app.html` com os nomes da nova família
   - Ou criar uma versão nova do repositório para cada família
4. Eles seguem o Passo 3 acima

### Versão SaaS simplificada:
- Mantenha **um único repositório** GitHub com o app genérico
- Cada família usa sua própria **URL do GAS + ID de planilha** nas configurações
- A tela de Configurações já suporta isso — cada celular salva sua própria conexão no localStorage

---

## PARTE 5 — Desenvolvimento local

Para testar sem publicar no GitHub:
```bash
cd C:\Users\PC\Projetos\CuidarJuntos
node server.js
```
Acesse no navegador: http://localhost:8080
Acesse no celular (mesma rede Wi-Fi): http://192.168.1.102:8080

---

## Estrutura de dados no Google Drive

```
📁 CuidarJuntos - Pacientes/
  📁 Paciente - José do Carmo/
    📊 Dados - José do Carmo          ← planilha com 14 abas
    📁 Anexos/                        ← arquivos gerais
    📁 Relatorios/                    ← relatórios gerados
    📁 Comprovantes/                  ← comprovantes financeiros
    📁 Exames/                        ← resultados de exames
    📁 Receitas_Medicas/              ← receitas médicas
    📁 Documentos/                    ← documentos pessoais
```

## Abas da planilha

| Aba | Conteúdo |
|-----|----------|
| Cadastro_Paciente | Dados pessoais do paciente |
| Usuarios_e_Permissoes | Logins e senhas dos usuários |
| Receita_Mensal | Aposentadoria, pensões, entradas |
| Saldo_Banco | Movimentações bancárias |
| Despesas | Gastos com cuidado |
| Complementacao_Filhos | Cotas por filho |
| Sinais_Vitais | Pressão, FC, temperatura, glicemia |
| Medicamentos | Medicamentos ativos |
| Administracoes_Medicamentos | Histórico de administrações |
| Cuidados_Diarios | Checklist diário |
| Consultas_Visitas | Consultas agendadas e realizadas |
| Exames | Exames agendados e resultados |
| Chat_Familiar | Mensagens da família |
| Relatorios | Relatórios mensais |

---

Suporte: cuidarjuntos.oficial.app@gmail.com
