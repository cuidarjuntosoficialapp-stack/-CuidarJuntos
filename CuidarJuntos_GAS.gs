// ============================================================
// CuidarJuntos — Google Apps Script v1.0
// Backend multi-paciente
// E-mail do projeto: cuidarjuntos.oficial.app@gmail.com
// ============================================================

// ─── CONFIGURAÇÃO GLOBAL ────────────────────────────────────
const CONFIG = {
  PASTA_RAIZ_NOME: 'CuidarJuntos - Pacientes',
  VERSION: '1.0',
};

// ─── ROTEADOR PRINCIPAL ─────────────────────────────────────
function doGet(e)  { return rotear(e); }
function doPost(e) { return rotear(e); }

function rotear(e) {
  try {
    const p = e.parameter || {};
    const b = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    const params = Object.assign({}, p, b);
    const action = params.action || '';

    const rotas = {
      // Sistema
      ping:                   () => ok('pong'),
      criarPaciente:          () => criarPaciente(params),
      listarPacientes:        () => listarPacientes(),

      // Auth
      login:                  () => login(params),

      // Sinais vitais
      getVitais:              () => getRegistros(params, 'Sinais_Vitais'),
      salvarVital:            () => salvarRegistro(params, 'Sinais_Vitais', colunasVitais()),

      // Medicamentos
      getMedicamentos:        () => getRegistros(params, 'Medicamentos'),
      salvarMedicamento:      () => salvarRegistro(params, 'Medicamentos', colunasMedicamentos()),
      getAdministracoes:      () => getRegistros(params, 'Administracoes_Medicamentos'),
      salvarAdministracao:    () => salvarRegistro(params, 'Administracoes_Medicamentos', colunasAdministracoes()),

      // Cuidados
      getCuidados:            () => getRegistros(params, 'Cuidados_Diarios'),
      salvarCuidado:          () => salvarRegistro(params, 'Cuidados_Diarios', colunasCuidados()),

      // Visitas / Consultas
      getVisitas:             () => getRegistros(params, 'Consultas_Visitas'),
      salvarVisita:           () => salvarRegistro(params, 'Consultas_Visitas', colunasVisitas()),

      // Exames
      getExames:              () => getRegistros(params, 'Exames'),
      salvarExame:            () => salvarRegistro(params, 'Exames', colunasExames()),

      // Financeiro
      getReceita:             () => getRegistros(params, 'Receita_Mensal'),
      salvarReceita:          () => salvarRegistro(params, 'Receita_Mensal', colunasReceita()),
      getSaldo:               () => getRegistros(params, 'Saldo_Banco'),
      salvarSaldo:            () => salvarRegistro(params, 'Saldo_Banco', colunasSaldo()),
      getDespesas:            () => getRegistros(params, 'Despesas'),
      salvarDespesa:          () => salvarRegistro(params, 'Despesas', colunasDespesas()),
      getCotas:               () => getRegistros(params, 'Complementacao_Filhos'),
      salvarCota:             () => salvarRegistro(params, 'Complementacao_Filhos', colunasCotas()),

      // Chat
      getChat:                () => getRegistros(params, 'Chat_Familiar'),
      salvarMensagem:         () => salvarRegistro(params, 'Chat_Familiar', colunasChat()),

      // Genérico — ação: salvarRegistro com {aba, dados}
      salvarRegistro:         () => salvarRegistroGenerico(params),

      // Upload de arquivo
      uploadArquivo:          () => uploadArquivo(params),
      excluirRegistro:        () => excluirRegistro(params),
    };

    if (rotas[action]) return rotas[action]();
    return erro('Ação não encontrada: ' + action);

  } catch(e) {
    return erro('Erro interno: ' + e.message);
  }
}

// ============================================================
// CRIAÇÃO DE ESTRUTURA DO PACIENTE
// ============================================================
function criarPaciente(p) {
  const nome = p.nomePaciente;
  if (!nome) return erro('nomePaciente obrigatório');

  // 1. Pasta raiz
  const pastaRaiz = obterOuCriarPasta(CONFIG.PASTA_RAIZ_NOME, null);

  // 2. Pasta do paciente
  const nomePasta = 'Paciente - ' + nome;
  const pastaPaciente = obterOuCriarPasta(nomePasta, pastaRaiz.getId());

  // 3. Subpastas
  const subpastas = ['Anexos', 'Relatorios', 'Comprovantes', 'Exames', 'Receitas_Medicas', 'Documentos'];
  const idsSubpastas = {};
  subpastas.forEach(sub => {
    const pasta = obterOuCriarPasta(sub, pastaPaciente.getId());
    idsSubpastas[sub] = pasta.getId();
  });

  // 4. Planilha do paciente
  let planilhaId = '';
  const arquivos = pastaPaciente.getFilesByName('Dados - ' + nome);
  if (arquivos.hasNext()) {
    planilhaId = arquivos.next().getId();
  } else {
    const ss = SpreadsheetApp.create('Dados - ' + nome);
    planilhaId = ss.getId();
    DriveApp.getFileById(planilhaId).moveTo(pastaPaciente);
    criarAbas(ss, nome, p);
  }

  // 5. Salvar na aba de cadastro
  const ss = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName('Cadastro_Paciente');
  if (aba && aba.getLastRow() < 2) {
    aba.getRange(2, 1, 1, 8).setValues([[
      Utilities.getUuid(), nome, p.apelido||'', p.dataNasc||'', p.diagnostico||'',
      pastaPaciente.getId(), planilhaId, new Date()
    ]]);
  }

  return ok({
    pacienteId:   Utilities.getUuid(),
    planilhaId:   planilhaId,
    pastaId:      pastaPaciente.getId(),
    subpastas:    idsSubpastas,
    nome:         nome,
  });
}

function criarAbas(ss, nomePaciente, p) {
  // Remove aba padrão
  const abaDefault = ss.getSheets()[0];

  const abas = [
    { nome: 'Cadastro_Paciente',           colunas: ['ID','Nome','Apelido','DataNasc','Diagnostico','PastaId','PlanilhaId','CriadoEm'] },
    { nome: 'Usuarios_e_Permissoes',       colunas: ['ID','Nome','Role','Senha','Email','Ativo','CriadoEm'] },
    { nome: 'Receita_Mensal',              colunas: ['ID','Competencia','Tipo','Descricao','Valor','DataEntrada','Observacao','RegistradoPor','CriadoEm'] },
    { nome: 'Saldo_Banco',                 colunas: ['ID','Data','Tipo','Descricao','Valor','SaldoApos','Banco','Observacao','RegistradoPor','CriadoEm'] },
    { nome: 'Despesas',                    colunas: ['ID','Competencia','Data','Categoria','Descricao','Valor','PagoPor','Comprovante','Status','Observacao','RegistradoPor','CriadoEm'] },
    { nome: 'Complementacao_Filhos',       colunas: ['ID','Competencia','Filho','Cota','Comprou','Diferenca','Status','Observacao','CriadoEm'] },
    { nome: 'Sinais_Vitais',               colunas: ['ID','Data','Hora','Sistolica','Diastolica','FC','Saturacao','Temperatura','Glicemia','Nivel','Observacao','RegistradoPor','CriadoEm'] },
    { nome: 'Medicamentos',                colunas: ['ID','Nome','Dose','Via','Horarios','Prescricao','Medico','Inicio','Termino','Ativo','Observacao','LinkReceita','CriadoEm'] },
    { nome: 'Administracoes_Medicamentos', colunas: ['ID','MedicamentoId','Medicamento','Data','Hora','Dose','Via','RegistradoPor','Observacao','CriadoEm'] },
    { nome: 'Cuidados_Diarios',            colunas: ['ID','Data','Descricao','Categoria','Feito','HoraFeito','RegistradoPor','Observacao','CriadoEm'] },
    { nome: 'Consultas_Visitas',           colunas: ['ID','Data','Hora','Especialidade','Medico','Local','Status','Observacao','LinkDocumento','RegistradoPor','CriadoEm'] },
    { nome: 'Exames',                      colunas: ['ID','Data','Hora','Nome','Laboratorio','Status','Resultado','LinkResultado','Observacao','RegistradoPor','CriadoEm'] },
    { nome: 'Chat_Familiar',               colunas: ['ID','DataHora','Remetente','Role','Mensagem','CriadoEm'] },
    { nome: 'Relatorios',                  colunas: ['ID','Competencia','TipoRelatorio','LinkArquivo','GeradoPor','CriadoEm'] },
  ];

  const cores = {
    'Cadastro_Paciente':           '#1565C0',
    'Usuarios_e_Permissoes':       '#6A1B9A',
    'Receita_Mensal':              '#2E7D32',
    'Saldo_Banco':                 '#1976D2',
    'Despesas':                    '#E65100',
    'Complementacao_Filhos':       '#F57F17',
    'Sinais_Vitais':               '#C62828',
    'Medicamentos':                '#00838F',
    'Administracoes_Medicamentos': '#00695C',
    'Cuidados_Diarios':            '#4527A0',
    'Consultas_Visitas':           '#1565C0',
    'Exames':                      '#558B2F',
    'Chat_Familiar':               '#37474F',
    'Relatorios':                  '#4E342E',
  };

  abas.forEach((def, i) => {
    let aba;
    if (i === 0) {
      abaDefault.setName(def.nome);
      aba = abaDefault;
    } else {
      aba = ss.insertSheet(def.nome);
    }
    // Cabeçalho
    aba.getRange(1, 1, 1, def.colunas.length).setValues([def.colunas]);
    aba.getRange(1, 1, 1, def.colunas.length)
      .setBackground(cores[def.nome] || '#1565C0')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    aba.setFrozenRows(1);
    aba.setColumnWidth(1, 220);
  });
}

// ============================================================
// LISTAR PACIENTES
// ============================================================
function listarPacientes() {
  const pastaRaiz = obterOuCriarPasta(CONFIG.PASTA_RAIZ_NOME, null);
  const subpastas = pastaRaiz.getFolders();
  const lista = [];
  while (subpastas.hasNext()) {
    const pasta = subpastas.next();
    const nome = pasta.getName().replace('Paciente - ', '');
    const arquivos = pasta.getFilesByName('Dados - ' + nome);
    let planilhaId = '';
    if (arquivos.hasNext()) planilhaId = arquivos.next().getId();
    lista.push({ nome, pastaId: pasta.getId(), planilhaId });
  }
  return ok(lista);
}

// ============================================================
// LOGIN
// ============================================================
function login(p) {
  const { planilhaId, nome, senha, role } = p;
  if (!planilhaId) return erro('planilhaId obrigatório');

  const ss   = SpreadsheetApp.openById(planilhaId);
  const aba  = ss.getSheetByName('Usuarios_e_Permissoes');
  const rows = aba.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const [id, nomeU, roleU, senhaU, email, ativo] = rows[i];
    if (nomeU.toLowerCase() === nome.toLowerCase() && senhaU === senha && ativo) {
      const rolesValidos = role === 'filho' ? ['filho','filha'] : ['cuidador','enfermagem'];
      if (!rolesValidos.includes(roleU.toLowerCase())) continue;
      return ok({ id, nome: nomeU, role: roleU, email });
    }
  }
  return erro('Credenciais inválidas');
}

// ============================================================
// CRUD GENÉRICO — ação usada pelo app (salvarRegistro)
// ============================================================

// Mapa de colunas por aba (para escrita genérica vinda do app)
const COLUNAS_POR_ABA = {
  Sinais_Vitais:               ['ID','Data','Hora','Sistolica','Diastolica','FC','Saturacao','Temperatura','Glicemia','Nivel','Observacao','RegistradoPor','CriadoEm'],
  Medicamentos:                ['ID','Nome','Dose','Via','Horarios','Prescricao','Medico','Inicio','Termino','Ativo','Observacao','LinkReceita','CriadoEm'],
  Administracoes_Medicamentos: ['ID','MedicamentoId','Medicamento','Data','Hora','Dose','Via','RegistradoPor','Observacao','CriadoEm'],
  Cuidados_Diarios:            ['ID','Data','Descricao','Categoria','Feito','HoraFeito','RegistradoPor','Observacao','CriadoEm'],
  Consultas_Visitas:           ['ID','Data','Hora','Especialidade','Medico','Local','Status','Observacao','LinkDocumento','RegistradoPor','CriadoEm'],
  Exames:                      ['ID','Data','Hora','Nome','Laboratorio','Status','Resultado','LinkResultado','Observacao','RegistradoPor','CriadoEm'],
  Receita_Mensal:              ['ID','Competencia','Tipo','Descricao','Valor','DataEntrada','Observacao','RegistradoPor','CriadoEm'],
  Saldo_Banco:                 ['ID','Data','Tipo','Descricao','Valor','SaldoApos','Banco','Observacao','RegistradoPor','CriadoEm'],
  Despesas:                    ['ID','Competencia','Data','Categoria','Descricao','Valor','PagoPor','Comprovante','Status','Observacao','RegistradoPor','CriadoEm'],
  Complementacao_Filhos:       ['ID','Competencia','Filho','Cota','Comprou','Diferenca','Status','Observacao','CriadoEm'],
  Chat_Familiar:               ['ID','DataHora','Remetente','Role','Mensagem','CriadoEm'],
};

// Mapa de nomes de campos do app → colunas da planilha
const ALIAS_CAMPOS = {
  // vitais
  sis_mmhg:      'Sistolica',
  dia_mmhg:      'Diastolica',
  fc_bpm:        'FC',
  sat_pct:       'Saturacao',
  temp_c:        'Temperatura',
  gli_mgdl:      'Glicemia',
  alertas:       'Nivel',
  observacoes:   'Observacao',
  registro_por:  'RegistradoPor',
  registrado_por:'RegistradoPor',
  // medicamentos
  nome:          'Nome',
  dose:          'Dose',
  via:           'Via',
  horarios:      'Horarios',
  prescricao:    'Prescricao',
  medico:        'Medico',
  inicio:        'Inicio',
  fim:           'Termino',
  // administrações
  medicamento:   'Medicamento',
  hora:          'Hora',
  data:          'Data',
  // cuidados
  descricao:     'Descricao',
  categoria:     'Categoria',
  tipo:          'Categoria',
  humor:         'Categoria',
  // visitas
  especialidade: 'Especialidade',
  local:         'Local',
  status:        'Status',
  // chat
  usuario:       'Remetente',
  perfil:        'Role',
  mensagem:      'Mensagem',
  // financeiro
  valor:         'Valor',
  // geral
  data_hora:     'DataHora',
};

function normalizarCampos(dados) {
  const out = {};
  Object.keys(dados).forEach(k => {
    const col = ALIAS_CAMPOS[k] || k.charAt(0).toUpperCase() + k.slice(1);
    out[col] = dados[k];
  });
  return out;
}

function salvarRegistroGenerico(p) {
  if (!p.planilhaId) return erro('planilhaId obrigatório');
  if (!p.aba)        return erro('aba obrigatória');

  const colunas = COLUNAS_POR_ABA[p.aba];
  if (!colunas) return erro('Aba desconhecida: ' + p.aba);

  const ss  = SpreadsheetApp.openById(p.planilhaId);
  const aba = ss.getSheetByName(p.aba);
  if (!aba) return erro('Aba não encontrada: ' + p.aba);

  // Normalizar campos vindos do app
  const dados = normalizarCampos(p.dados || {});

  const id  = dados.ID || Utilities.getUuid();
  const now = new Date();

  const linha = colunas.map(col => {
    if (col === 'ID')        return id;
    if (col === 'CriadoEm') return now;
    return dados[col] !== undefined ? dados[col] : '';
  });

  // Atualizar se já existe
  const existing = aba.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (existing[i][0] === id) {
      aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
      return ok({ id, atualizado: true });
    }
  }

  aba.appendRow(linha);
  return ok({ id, criado: true });
}

// ============================================================
// CRUD GENÉRICO (funções por aba — mantidas para compatibilidade)
// ============================================================
function getRegistros(p, nomeAba) {
  const ss  = SpreadsheetApp.openById(p.planilhaId);
  const aba = ss.getSheetByName(nomeAba);
  if (!aba) return erro('Aba não encontrada: ' + nomeAba);

  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) return ok([]);

  const headers = dados[0];
  const rows = dados.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  // Filtro por competência se informado
  if (p.competencia) return ok(rows.filter(r => r.Competencia === p.competencia));
  return ok(rows);
}

function salvarRegistro(p, nomeAba, colunas) {
  const ss  = SpreadsheetApp.openById(p.planilhaId);
  const aba = ss.getSheetByName(nomeAba);
  if (!aba) return erro('Aba não encontrada: ' + nomeAba);

  const id  = p.id || Utilities.getUuid();
  const now = new Date();

  // Montar linha na ordem das colunas
  const linha = colunas.map(col => {
    if (col === 'ID')        return id;
    if (col === 'CriadoEm') return now;
    return p[col] !== undefined ? p[col] : '';
  });

  // Atualizar se ID já existe
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === id) {
      aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
      return ok({ id, atualizado: true });
    }
  }

  // Inserir novo
  aba.appendRow(linha);
  return ok({ id, criado: true });
}

function excluirRegistro(p) {
  const ss  = SpreadsheetApp.openById(p.planilhaId);
  const aba = ss.getSheetByName(p.aba);
  if (!aba) return erro('Aba não encontrada');

  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === p.id) {
      aba.deleteRow(i + 1);
      return ok({ excluido: true });
    }
  }
  return erro('Registro não encontrado');
}

// ============================================================
// UPLOAD DE ARQUIVO
// ============================================================
function uploadArquivo(p) {
  const { planilhaId, subpasta, nomeArquivo, mimeType, conteudoBase64 } = p;
  if (!conteudoBase64) return erro('Conteúdo base64 obrigatório');

  // Encontrar pasta do paciente
  const pastaRaiz = obterOuCriarPasta(CONFIG.PASTA_RAIZ_NOME, null);
  const ss = SpreadsheetApp.openById(planilhaId);
  const nomePlanilha = ss.getName().replace('Dados - ', '');
  const pastaPaciente = obterOuCriarPasta('Paciente - ' + nomePlanilha, pastaRaiz.getId());
  const pastaDestino  = obterOuCriarPasta(subpasta || 'Anexos', pastaPaciente.getId());

  const bytes  = Utilities.base64Decode(conteudoBase64);
  const blob   = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', nomeArquivo || 'arquivo');
  const arquivo = pastaDestino.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return ok({ linkArquivo: arquivo.getUrl(), fileId: arquivo.getId() });
}

// ============================================================
// DEFINIÇÃO DAS COLUNAS POR ABA
// ============================================================
function colunasVitais()         { return ['ID','Data','Hora','Sistolica','Diastolica','FC','Saturacao','Temperatura','Glicemia','Nivel','Observacao','RegistradoPor','CriadoEm']; }
function colunasMedicamentos()   { return ['ID','Nome','Dose','Via','Horarios','Prescricao','Medico','Inicio','Termino','Ativo','Observacao','LinkReceita','CriadoEm']; }
function colunasAdministracoes() { return ['ID','MedicamentoId','Medicamento','Data','Hora','Dose','Via','RegistradoPor','Observacao','CriadoEm']; }
function colunasCuidados()       { return ['ID','Data','Descricao','Categoria','Feito','HoraFeito','RegistradoPor','Observacao','CriadoEm']; }
function colunasVisitas()        { return ['ID','Data','Hora','Especialidade','Medico','Local','Status','Observacao','LinkDocumento','RegistradoPor','CriadoEm']; }
function colunasExames()         { return ['ID','Data','Hora','Nome','Laboratorio','Status','Resultado','LinkResultado','Observacao','RegistradoPor','CriadoEm']; }
function colunasReceita()        { return ['ID','Competencia','Tipo','Descricao','Valor','DataEntrada','Observacao','RegistradoPor','CriadoEm']; }
function colunasSaldo()          { return ['ID','Data','Tipo','Descricao','Valor','SaldoApos','Banco','Observacao','RegistradoPor','CriadoEm']; }
function colunasDespesas()       { return ['ID','Competencia','Data','Categoria','Descricao','Valor','PagoPor','Comprovante','Status','Observacao','RegistradoPor','CriadoEm']; }
function colunasCotas()          { return ['ID','Competencia','Filho','Cota','Comprou','Diferenca','Status','Observacao','CriadoEm']; }
function colunasChat()           { return ['ID','DataHora','Remetente','Role','Mensagem','CriadoEm']; }

// ============================================================
// UTILITÁRIOS
// ============================================================
function obterOuCriarPasta(nome, parentId) {
  const parent = parentId ? DriveApp.getFolderById(parentId) : DriveApp.getRootFolder();
  const it = parent.getFoldersByName(nome);
  if (it.hasNext()) return it.next();
  return parent.createFolder(nome);
}

function ok(data)  {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function erro(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, erro: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// MENU NA PLANILHA (uso manual)
// ============================================================
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('CuidarJuntos')
      .addItem('Criar estrutura do paciente', 'menuCriarPaciente')
      .addItem('Testar conexão', 'menuTestar')
      .addToUi();
  } catch(e) { Logger.log('onOpen: ' + e.message); }
}

function menuCriarPaciente() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt('Nome completo do paciente:');
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const r = criarPaciente({ nomePaciente: resp.getResponseText() });
  ui.alert('Estrutura criada!\n' + r.getContent());
}

// Executa diretamente pelo botão "Executar" do editor GAS
// Edite o nome do paciente antes de executar
function criarPacienteDemo() {
  const r = criarPaciente({
    nomePaciente: 'José do Carmo',   // ← altere aqui
    apelido:      'Carmito',
    diagnostico:  'Hipertensão, Diabetes tipo 2',
  });
  Logger.log(r.getContent());
}

function menuTestar() {
  try { SpreadsheetApp.getUi().alert('✅ Apps Script funcionando!'); }
  catch(e) { Logger.log('✅ Apps Script funcionando!'); }
}
