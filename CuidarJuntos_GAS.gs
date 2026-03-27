// ============================================================
// CuidarJuntos — Google Apps Script v2.0
// Backend multi-paciente
// E-mail do projeto: cuidarjuntos.oficial.app@gmail.com
// ============================================================

// ─── CONFIGURAÇÃO GLOBAL ────────────────────────────────────
const CONFIG = {
  PASTA_RAIZ_NOME: 'CuidarJuntos - Pacientes',
  VERSION: '2.0',
};

// ─── HELPER: busca planilhaId salvo nas propriedades do script ──
function getPlanilhaId(p) {
  return (p && p.planilhaId) ||
         (p && p.dados && p.dados.planilhaId) ||
         PropertiesService.getScriptProperties().getProperty('PLANILHA_ID') || '';
}

// ─── ROTEADOR PRINCIPAL ─────────────────────────────────────
function doGet(e)  { return rotear(e); }
function doPost(e) { return rotear(e); }

function rotear(e) {
  try {
    const p = e.parameter || {};
    const b = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    const params = Object.assign({}, p, b);
    // CORRIGIDO: aceita tanto 'acao' (app) quanto 'action' (legado)
    const action = params.acao || params.action || '';

    const rotas = {
      // Sistema
      ping:                   () => ok('pong'),
      criarPaciente:          () => criarPaciente(params),
      listarPacientes:        () => listarPacientes(),
      configurar:             () => configurarApp(params),

      // Auth
      login:                  () => login(params),
      listarUsuarios:         () => listarUsuariosApp(params),
      desativarUsuario:       () => desativarUsuarioApp(params),
      cadastrarUsuario:       () => cadastrarUsuarioApp(params),
      editarUsuario:          () => editarUsuarioApp(params),
      alterarSenha:           () => alterarSenhaApp(params),

      // GENÉRICO — app usa api('salvar', 'tabela', dados)
      salvar:                 () => salvarApp(params),

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

      // Genérico legado
      salvarRegistro:         () => salvarRegistroGenerico(params),
      uploadArquivo:          () => uploadArquivo(params),
      excluirRegistro:        () => excluirRegistro(params),

      // Sistema multi-família
      gerarFamilia:           () => gerarFamilia(params),
      ativarCodigo:           () => ativarCodigo(params),
      listarFamilias:         () => listarFamilias(),
      desativarFamilia:       () => desativarFamilia(params),
    };

    if (rotas[action]) return rotas[action]();
    return erro('Ação não encontrada: ' + action);

  } catch(e) {
    return erro('Erro interno: ' + e.message);
  }
}

// ============================================================
// CONFIGURAR — salva planilhaId nas propriedades do script
// ============================================================
function configurarApp(p) {
  const planilhaId = (p.dados && p.dados.planilhaId) || p.planilhaId || '';
  if (!planilhaId) return erro('planilhaId obrigatório');
  PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', planilhaId);
  return ok({ configurado: true, planilhaId: planilhaId });
}

// ============================================================
// CRIAÇÃO DE ESTRUTURA DO PACIENTE
// ============================================================
function criarPaciente(p) {
  const nome = p.nomePaciente;
  if (!nome) return erro('nomePaciente obrigatório');

  const pastaRaiz = obterOuCriarPasta(CONFIG.PASTA_RAIZ_NOME, null);
  const nomePasta = 'Paciente - ' + nome;
  const pastaPaciente = obterOuCriarPasta(nomePasta, pastaRaiz.getId());

  const subpastas = ['Anexos', 'Relatorios', 'Comprovantes', 'Exames', 'Receitas_Medicas', 'Documentos'];
  const idsSubpastas = {};
  subpastas.forEach(sub => {
    const pasta = obterOuCriarPasta(sub, pastaPaciente.getId());
    idsSubpastas[sub] = pasta.getId();
  });

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

  // Salva planilhaId automaticamente nas propriedades
  PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', planilhaId);

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
  const abasExistentes = ss.getSheets().map(s => s.getName());
  if (abasExistentes[0] === 'Sheet1' || abasExistentes[0] === 'Página1' || abasExistentes[0] === 'Plan1') {
    ss.deleteSheet(ss.getSheets()[0]);
  }

  const abas = [
    { nome: 'Cadastro_Paciente',       colunas: ['ID','Nome','Apelido','DataNasc','Diagnostico','PastaId','PlanilhaId','CriadoEm'], cor: '#1565C0' },
    { nome: 'Usuarios_e_Permissoes',   colunas: ['ID','Nome','Role','Senha','Email','Ativo','CriadoEm'], cor: '#6A1B9A' },
    { nome: 'Sinais_Vitais',           colunas: ['ID','Data','Hora','Sistolica','Diastolica','FC','Saturacao','Temperatura','Glicemia','Nivel','Observacao','RegistradoPor','CriadoEm'], cor: '#C62828' },
    { nome: 'Medicamentos',            colunas: ['ID','Nome','Dose','Via','Horarios','Prescricao','Medico','Inicio','Termino','Ativo','Observacao','LinkReceita','CriadoEm'], cor: '#2E7D32' },
    { nome: 'Administracoes_Medicamentos', colunas: ['ID','MedicamentoId','Medicamento','Data','Hora','Dose','Via','RegistradoPor','Observacao','CriadoEm'], cor: '#388E3C' },
    { nome: 'Cuidados_Diarios',        colunas: ['ID','Data','Descricao','Categoria','Feito','HoraFeito','RegistradoPor','Observacao','CriadoEm'], cor: '#00695C' },
    { nome: 'Consultas_Visitas',       colunas: ['ID','Data','Hora','Especialidade','Medico','Local','Status','Observacao','LinkDocumento','RegistradoPor','CriadoEm'], cor: '#0277BD' },
    { nome: 'Exames',                  colunas: ['ID','Data','Hora','Nome','Laboratorio','Status','Resultado','LinkResultado','Observacao','RegistradoPor','CriadoEm'], cor: '#6A1B9A' },
    { nome: 'Receita_Mensal',          colunas: ['ID','Competencia','Tipo','Descricao','Valor','DataEntrada','Observacao','RegistradoPor','CriadoEm'], cor: '#E65100' },
    { nome: 'Saldo_Banco',             colunas: ['ID','Data','Tipo','Descricao','Valor','SaldoApos','Banco','Observacao','RegistradoPor','CriadoEm'], cor: '#4E342E' },
    { nome: 'Despesas',                colunas: ['ID','Competencia','Data','Categoria','Descricao','Valor','PagoPor','Comprovante','Status','Observacao','RegistradoPor','CriadoEm'], cor: '#BF360C' },
    { nome: 'Complementacao_Filhos',   colunas: ['ID','Competencia','Filho','Cota','Comprou','Diferenca','Status','Observacao','CriadoEm'], cor: '#F57F17' },
    { nome: 'Chat_Familiar',           colunas: ['ID','DataHora','Remetente','Role','Mensagem','CriadoEm'], cor: '#37474F' },
  ];

  abas.forEach(cfg => {
    if (ss.getSheetByName(cfg.nome)) return;
    const sheet = ss.insertSheet(cfg.nome);
    sheet.getRange(1, 1, 1, cfg.colunas.length).setValues([cfg.colunas]);
    sheet.getRange(1, 1, 1, cfg.colunas.length)
      .setBackground(cfg.cor)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  });

  // Criar usuário admin padrão
  const abaUsers = ss.getSheetByName('Usuarios_e_Permissoes');
  if (abaUsers && abaUsers.getLastRow() < 2) {
    abaUsers.appendRow([Utilities.getUuid(), 'Admin', 'admin', 'admin123', 'admin@cuidarjuntos.com', true, new Date()]);
  }
}

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
// LOGIN — CORRIGIDO
// ============================================================
function login(p) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado. Configure a planilha em Configurações.');

  // Aceita email/senha de dentro de 'dados' ou direto no params
  const email = (p.dados && p.dados.email) || p.email || p.nome || '';
  const senha = (p.dados && p.dados.senha) || p.senha || '';

  if (!email) return erro('E-mail ou usuário obrigatório');
  if (!senha) return erro('Senha obrigatória');

  const ss = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName('Usuarios_e_Permissoes');
  if (!aba) return erro('Aba de usuários não encontrada. Execute "Criar estrutura" primeiro.');

  const rows = aba.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [id, nomeU, roleU, senhaU, emailU, ativo] = rows[i];
    if (!ativo) continue;
    const matchEmail = emailU && String(emailU).toLowerCase() === email.toLowerCase();
    const matchNome  = nomeU  && String(nomeU).toLowerCase()  === email.toLowerCase();
    if ((matchEmail || matchNome) && String(senhaU) === String(senha)) {
      // Mapeia role da planilha → perfil do app
      const roleNorm = String(roleU).toLowerCase();
      const perfil = roleNorm === 'admin' ? 'admin' :
                     ['filho','filha'].includes(roleNorm) ? 'filho' : 'enfermagem';
      return ok({ usuario: { id, nome: nomeU, perfil, email: emailU || email } });
    }
  }
  return erro('Usuário ou senha incorretos');
}

// ============================================================
// GERENCIAMENTO DE USUÁRIOS
// ============================================================
function listarUsuariosApp(p) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado');
  const ss  = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName('Usuarios_e_Permissoes');
  if (!aba) return erro('Aba não encontrada');
  const rows = aba.getDataRange().getValues();
  if (rows.length < 2) return ok([]);
  const lista = rows.slice(1).map(r => ({
    id: r[0], nome: r[1], perfil: r[2], email: r[4], ativo: r[5]
  }));
  return ok(lista);
}

function cadastrarUsuarioApp(p) {
  const dados = p.dados || {};
  if (!dados.Senha && !dados['Senha Hash']) return erro('Senha obrigatória');

  // Se vier código de família, busca a planilha correta
  const codigoFamilia = dados.CodigoFamilia || dados.codigoFamilia || '';
  let planilhaId = '';

  if (codigoFamilia) {
    const familias = getRegistroFamilias();
    const familia  = familias.find(f => f.codigo === codigoFamilia && f.ativo);
    if (!familia) return erro('Código de família inválido: ' + codigoFamilia);
    planilhaId = familia.planilhaId;
  } else {
    planilhaId = getPlanilhaId(p);
    if (!planilhaId) return erro('planilhaId ou codigoFamilia obrigatório');
  }

  const ss  = SpreadsheetApp.openById(planilhaId);
  let aba = ss.getSheetByName('Usuarios_e_Permissoes');

  // Cria a aba automaticamente se não existir
  if (!aba) {
    aba = ss.insertSheet('Usuarios_e_Permissoes');
    const colunas = ['ID','Nome','Role','Senha','Email','Ativo','CriadoEm'];
    aba.getRange(1, 1, 1, colunas.length).setValues([colunas]);
    aba.getRange(1, 1, 1, colunas.length)
      .setBackground('#6A1B9A').setFontColor('#FFFFFF').setFontWeight('bold');
    aba.setFrozenRows(1);
  }

  const email  = dados.Email  || dados.email  || '';
  const senha  = dados.Senha  || dados['Senha Hash'] || '';
  const nome   = dados.Nome   || dados.nome   || email.split('@')[0];
  const perfil = dados.Perfil || dados.perfil || 'filho';

  aba.appendRow([Utilities.getUuid(), nome, perfil, senha, email, true, new Date()]);
  return ok({ criado: true });
}

function editarUsuarioApp(p) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado');
  const dados = p.dados || {};
  const id = p.id || dados.id || '';
  if (!id) return erro('ID obrigatório');
  const ss  = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName('Usuarios_e_Permissoes');
  const rows = aba.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      if (dados.Nome   || dados.nome)   aba.getRange(i+1, 2).setValue(dados.Nome || dados.nome);
      if (dados.Perfil || dados.perfil) aba.getRange(i+1, 3).setValue(dados.Perfil || dados.perfil);
      if (dados.Senha  || dados['Nova Senha']) aba.getRange(i+1, 4).setValue(dados.Senha || dados['Nova Senha']);
      if (dados.Email  || dados.email)  aba.getRange(i+1, 5).setValue(dados.Email || dados.email);
      return ok({ atualizado: true });
    }
  }
  return erro('Usuário não encontrado');
}

function desativarUsuarioApp(p) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado');
  const id = (p.dados && p.dados.id) || p.id || '';
  if (!id) return erro('ID obrigatório');
  const ss  = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName('Usuarios_e_Permissoes');
  const rows = aba.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      aba.getRange(i+1, 6).setValue(false);
      return ok({ desativado: true });
    }
  }
  return erro('Usuário não encontrado');
}

function alterarSenhaApp(p) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado');
  const dados = p.dados || {};
  const email      = dados.email     || p.email     || '';
  const senhaAtual = dados.senhaAtual || p.senhaAtual || '';
  const novaSenha  = dados.novaSenha  || p.novaSenha  || '';
  if (!email || !senhaAtual || !novaSenha) return erro('Dados incompletos');
  const ss  = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName('Usuarios_e_Permissoes');
  const rows = aba.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const emailU = String(rows[i][4]).toLowerCase();
    if (emailU === email.toLowerCase() && String(rows[i][3]) === String(senhaAtual)) {
      aba.getRange(i+1, 4).setValue(novaSenha);
      return ok({ alterado: true });
    }
  }
  return erro('Senha atual incorreta');
}

// ============================================================
// SALVAR GENÉRICO — app usa api('salvar', 'tabela', dados)
// ============================================================
const TABELA_PARA_ABA = {
  vitais:   'Sinais_Vitais',
  meds:     'Administracoes_Medicamentos',
  medCad:   'Medicamentos',
  visitas:  'Consultas_Visitas',
  exames:   'Exames',
  receitas: 'Receita_Mensal',
  saldo:    'Saldo_Banco',
  despesas: 'Despesas',
  cuidados: 'Cuidados_Diarios',
  chat:     'Chat_Familiar',
  cotas:    'Complementacao_Filhos',
};

function salvarApp(p) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado. Configure em Configurações → ID da Planilha.');

  const tabela = p.tabela || '';
  const nomeAba = TABELA_PARA_ABA[tabela];
  if (!nomeAba) return erro('Tabela desconhecida: ' + tabela);

  const colunas = COLUNAS_POR_ABA[nomeAba];
  if (!colunas) return erro('Colunas não definidas para: ' + nomeAba);

  const ss  = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName(nomeAba);
  if (!aba) return erro('Aba não encontrada: ' + nomeAba + '. Execute "Criar estrutura" primeiro.');

  const dados = normalizarCampos(p.dados || {});
  const id    = dados.ID || Utilities.getUuid();
  const now   = new Date();

  const linha = colunas.map(col => {
    if (col === 'ID')        return id;
    if (col === 'CriadoEm') return now;
    return dados[col] !== undefined ? dados[col] : '';
  });

  // Atualizar se ID já existe
  const existing = aba.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (existing[i][0] === id) {
      aba.getRange(i+1, 1, 1, linha.length).setValues([linha]);
      return ok({ id, atualizado: true });
    }
  }
  aba.appendRow(linha);
  return ok({ id, criado: true });
}

// ============================================================
// CRUD GENÉRICO — ação usada pelo app (salvarRegistro)
// ============================================================
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

const ALIAS_CAMPOS = {
  sis_mmhg:      'Sistolica',
  dia_mmhg:      'Diastolica',
  fc_bpm:        'FC',
  sat_pct:       'Saturacao',
  temp_c:        'Temperatura',
  gli_mgdl:      'Glicemia',
  alertas:       'Nivel',
  observacoes:   'Observacao',
  obs:           'Observacao',
  registro_por:  'RegistradoPor',
  registrado_por:'RegistradoPor',
  'registrado por': 'RegistradoPor',
  'registrado_por': 'RegistradoPor',
  nome:          'Nome',
  dose:          'Dose',
  via:           'Via',
  horarios:      'Horarios',
  prescricao:    'Prescricao',
  medico:        'Medico',
  inicio:        'Inicio',
  fim:           'Termino',
  medicamento:   'Medicamento',
  hora:          'Hora',
  data:          'Data',
  especialidade: 'Especialidade',
  local:         'Local',
  status:        'Status',
  laboratorio:   'Laboratorio',
  resultado:     'Resultado',
  tipo:          'Tipo',
  descricao:     'Descricao',
  valor:         'Valor',
  competencia:   'Competencia',
  filho:         'Filho',
  usuario:       'Remetente',
  perfil:        'Role',
  mensagem:      'Mensagem',
  data_hora:     'DataHora',
  'data pagto':  'DataEntrada',
  'data pagto':  'Data',
  qtd:           'Qtd',
  total:         'Total',
};

function normalizarCampos(dados) {
  const out = {};
  Object.keys(dados).forEach(k => {
    const kLower = k.toLowerCase();
    const col = ALIAS_CAMPOS[kLower] || ALIAS_CAMPOS[k] || k.charAt(0).toUpperCase() + k.slice(1);
    out[col] = dados[k];
  });
  return out;
}

function salvarRegistroGenerico(p) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado');
  if (!p.aba)      return erro('aba obrigatória');

  const colunas = COLUNAS_POR_ABA[p.aba];
  if (!colunas) return erro('Aba desconhecida: ' + p.aba);

  const ss  = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName(p.aba);
  if (!aba) return erro('Aba não encontrada: ' + p.aba);

  const dados = normalizarCampos(p.dados || {});
  const id    = dados.ID || Utilities.getUuid();
  const now   = new Date();

  const linha = colunas.map(col => {
    if (col === 'ID')        return id;
    if (col === 'CriadoEm') return now;
    return dados[col] !== undefined ? dados[col] : '';
  });

  const existing = aba.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (existing[i][0] === id) {
      aba.getRange(i+1, 1, 1, linha.length).setValues([linha]);
      return ok({ id, atualizado: true });
    }
  }
  aba.appendRow(linha);
  return ok({ id, criado: true });
}

function getRegistros(p, nomeAba) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado');
  const ss  = SpreadsheetApp.openById(planilhaId);
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

  if (p.competencia) return ok(rows.filter(r => r.Competencia === p.competencia));
  return ok(rows);
}

function salvarRegistro(p, nomeAba, colunas) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado');
  const ss  = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName(nomeAba);
  if (!aba) return erro('Aba não encontrada: ' + nomeAba);

  const id  = p.id || Utilities.getUuid();
  const now = new Date();

  const linha = colunas.map(col => {
    if (col === 'ID')        return id;
    if (col === 'CriadoEm') return now;
    return p[col] !== undefined ? p[col] : '';
  });

  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === id) {
      aba.getRange(i+1, 1, 1, linha.length).setValues([linha]);
      return ok({ id, atualizado: true });
    }
  }
  aba.appendRow(linha);
  return ok({ id, criado: true });
}

function excluirRegistro(p) {
  const planilhaId = getPlanilhaId(p);
  if (!planilhaId) return erro('planilhaId não configurado');
  const ss  = SpreadsheetApp.openById(planilhaId);
  const aba = ss.getSheetByName(p.aba);
  if (!aba) return erro('Aba não encontrada');

  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === p.id) {
      aba.deleteRow(i+1);
      return ok({ excluido: true });
    }
  }
  return erro('Registro não encontrado');
}

// ============================================================
// UPLOAD DE ARQUIVO
// ============================================================
function uploadArquivo(p) {
  const planilhaId = getPlanilhaId(p);
  const { subpasta, nomeArquivo, mimeType, conteudoBase64 } = p;
  if (!conteudoBase64) return erro('Conteúdo base64 obrigatório');

  const pastaRaiz = obterOuCriarPasta(CONFIG.PASTA_RAIZ_NOME, null);
  const ss = SpreadsheetApp.openById(planilhaId);
  const nomePlanilha = ss.getName().replace('Dados - ', '');
  const pastaPaciente = obterOuCriarPasta('Paciente - ' + nomePlanilha, pastaRaiz.getId());
  const pastaDestino  = obterOuCriarPasta(subpasta || 'Anexos', pastaPaciente.getId());

  const bytes   = Utilities.base64Decode(conteudoBase64);
  const blob    = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', nomeArquivo || 'arquivo');
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

// ============================================================
// SISTEMA MULTI-FAMÍLIA — Geração e Ativação de Códigos
// ============================================================

function getRegistroFamilias() {
  const raw = PropertiesService.getScriptProperties().getProperty('CJ_FAMILIAS') || '[]';
  try { return JSON.parse(raw); } catch(e) { return []; }
}

function salvarRegistroFamilias(reg) {
  PropertiesService.getScriptProperties().setProperty('CJ_FAMILIAS', JSON.stringify(reg));
}

function gerarCodigoUnico() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo;
  const reg = getRegistroFamilias();
  do {
    let r = '';
    for(let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
    codigo = 'CJ-' + r.substring(0,3) + '-' + r.substring(3,6);
  } while(reg.some(f => f.codigo === codigo));
  return codigo;
}

function gerarFamilia(p) {
  if(!p.nomePaciente) return erro('nomePaciente obrigatório');

  const pastaRaiz     = obterOuCriarPasta(CONFIG.PASTA_RAIZ_NOME, null);
  const nomePasta     = 'Paciente - ' + p.nomePaciente;
  const pastaPaciente = obterOuCriarPasta(nomePasta, pastaRaiz.getId());

  const subpastas = ['Anexos','Relatorios','Comprovantes','Exames','Receitas_Medicas','Documentos'];
  subpastas.forEach(sub => obterOuCriarPasta(sub, pastaPaciente.getId()));

  let planilhaId = '';
  const arquivos = pastaPaciente.getFilesByName('Dados - ' + p.nomePaciente);
  if(arquivos.hasNext()) {
    planilhaId = arquivos.next().getId();
  } else {
    const ss = SpreadsheetApp.create('Dados - ' + p.nomePaciente);
    planilhaId = ss.getId();
    DriveApp.getFileById(planilhaId).moveTo(pastaPaciente);
    criarAbas(ss, p.nomePaciente, p);
  }

  // Verifica se já existe código para este paciente
  const reg = getRegistroFamilias();
  const existente = reg.find(f => f.planilhaId === planilhaId && f.ativo);
  if(existente) {
    return ok({ codigo: existente.codigo, planilhaId, nomePaciente: p.nomePaciente, jaExistia: true });
  }

  const codigo = gerarCodigoUnico();
  reg.push({
    codigo,
    nomePaciente: p.nomePaciente,
    cpf:          p.cpf || '',
    nomeFamilia:  p.nomeFamilia || p.nomePaciente,
    planilhaId,
    pastaId:      pastaPaciente.getId(),
    criadoEm:     new Date().toISOString(),
    ativo:        true
  });
  salvarRegistroFamilias(reg);

  return ok({ codigo, planilhaId, nomePaciente: p.nomePaciente, jaExistia: false });
}

function ativarCodigo(p) {
  const codigo = (p.codigo || '').trim().toUpperCase().replace(/\s/g,'');
  if(!codigo) return erro('Código obrigatório');

  const reg    = getRegistroFamilias();
  const familia = reg.find(f => f.codigo === codigo && f.ativo);
  if(!familia) return erro('Código inválido ou não encontrado');

  return ok({
    planilhaId:   familia.planilhaId,
    nomePaciente: familia.nomePaciente,
    nomeFamilia:  familia.nomeFamilia,
    pastaId:      familia.pastaId
  });
}

function listarFamilias() {
  return ok(getRegistroFamilias());
}

function desativarFamilia(p) {
  if(!p.codigo) return erro('Código obrigatório');
  const reg = getRegistroFamilias();
  const idx = reg.findIndex(f => f.codigo === p.codigo);
  if(idx === -1) return erro('Família não encontrada');
  reg[idx].ativo = false;
  salvarRegistroFamilias(reg);
  return ok({ desativado: true });
}

// ============================================================
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
      .addItem('Ver ID da Planilha', 'menuVerPlanilhaId')
      .addItem('Testar conexão', 'menuTestar')
      .addToUi();
  } catch(e) { Logger.log('onOpen: ' + e.message); }
}

function menuCriarPaciente() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt('Nome completo do paciente:');
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const r = criarPaciente({ nomePaciente: resp.getResponseText() });
  const data = JSON.parse(r.getContent());
  ui.alert('Estrutura criada!\n\nID da Planilha:\n' + (data.data && data.data.planilhaId || '') + '\n\nCole este ID no app em Configurações → ID da Planilha');
}

function menuVerPlanilhaId() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ui = SpreadsheetApp.getUi();
    ui.alert('ID desta Planilha:\n\n' + ss.getId() + '\n\nCole este ID no app em Configurações → ID da Planilha');
  } catch(e) { Logger.log(e.message); }
}

function menuTestar() {
  try { SpreadsheetApp.getUi().alert('✅ Apps Script funcionando!'); }
  catch(e) { Logger.log('✅ Apps Script funcionando!'); }
}

// Executa diretamente pelo botão "Executar" do editor GAS
function criarPacienteDemo() {
  const r = criarPaciente({
    nomePaciente: 'José do Carmo',
    apelido:      'Carmito',
    diagnostico:  'Hipertensão, Diabetes tipo 2',
  });
  Logger.log(r.getContent());
}
