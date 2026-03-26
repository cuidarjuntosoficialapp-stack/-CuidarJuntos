// ============================================================
// CuidarBem — Google Apps Script v3.1
// Correções: nomes de abas, admin, cadastro de usuários
// ============================================================

var CACHE_TTL = 60; // segundos de cache para leituras

var ABAS = {
  vitais:   'Sinais Vitais',
  meds:     'Medicamentos',
  medCad:   'Med. Cadastro',
  visitas:  'Visitas Médicas',
  exames:   'Exames e Docs',
  despesas: 'Despesas',
  receitas: 'Receitas',
  cuidados: 'Cuidados Diários',
  usuarios: 'Usuários',
  config:   'Configurações',
  log:      'Log de Ações'
};

// ============================================================
// ENTRY POINTS — resposta imediata com CORS
// ============================================================
function doGet(e)  { return responder(processar(e)); }
function doPost(e) { return responder(processar(e)); }

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// PROCESSADOR PRINCIPAL
// ============================================================
function processar(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var b = {};
    if (e && e.postData && e.postData.contents) {
      try { b = JSON.parse(e.postData.contents); } catch(_) {}
    }
    var acao   = p.acao   || b.acao   || 'ping';
    var tabela = p.tabela || b.tabela || '';

    // ── ROTEADOR ──
    if (acao === 'ping')              return ping();
    if (acao === 'listar')            return listar(tabela, p);
    if (acao === 'salvar')            return salvar(tabela, b.dados, b.arquivo);
    if (acao === 'atualizar')         return atualizar(tabela, b.id, b.dados);
    if (acao === 'excluir')           return excluir(tabela, b.id);
    if (acao === 'login')             return login(b.email, b.senha);
    if (acao === 'config')            return getConfig();
    if (acao === 'batch')             return batch(b.operacoes);
    // Gestão de usuários (apenas admin)
    if (acao === 'listarUsuarios')    return listarUsuarios(b.emailAdmin);
    if (acao === 'cadastrarUsuario')  return cadastrarUsuario(b.emailAdmin, b.dados);
    if (acao === 'editarUsuario')     return editarUsuario(b.emailAdmin, b.id, b.dados);
    if (acao === 'desativarUsuario')  return desativarUsuario(b.emailAdmin, b.id);
    if (acao === 'alterarSenha')      return alterarSenha(b.email, b.senhaAtual, b.novaSenha);
    return { ok: false, erro: 'Acao desconhecida: ' + acao };
  } catch(err) {
    return { ok: false, erro: err.toString() };
  }
}

// ============================================================
// PING — teste de conexão ultra rápido
// ============================================================
function ping() {
  return { ok: true, msg: 'CuidarBem v3.1', ts: new Date().getTime() };
}

// ============================================================
// UTILITÁRIOS OTIMIZADOS
// ============================================================
var _ssCache = null;
function getSS() {
  if (!_ssCache) _ssCache = SpreadsheetApp.getActiveSpreadsheet();
  return _ssCache;
}

var _abaCache = {};
function getAba(nome) {
  if (!_abaCache[nome]) _abaCache[nome] = getSS().getSheetByName(nome);
  return _abaCache[nome];
}

// Mapeamento tabela → nome da aba (COM acentos, consistente com ABAS)
var MAPA = {
  vitais:   'Sinais Vitais',
  meds:     'Medicamentos',
  medCad:   'Med. Cadastro',
  visitas:  'Visitas Médicas',
  exames:   'Exames e Docs',
  despesas: 'Despesas',
  receitas: 'Receitas',
  cuidados: 'Cuidados Diários',
  usuarios: 'Usuários'
};

function nomeAba(tabela) { return MAPA[tabela] || null; }

function gerarId() {
  return Utilities.getUuid().replace(/-/g,'').substring(0,8).toUpperCase();
}

// Leitura otimizada: pega tudo de uma vez com getValues()
function lerAba(aba) {
  var ultimo = aba.getLastRow();
  if (ultimo <= 1) return { headers: [], rows: [] };
  var dados = aba.getRange(1, 1, ultimo, aba.getLastColumn()).getValues();
  return { headers: dados[0], rows: dados.slice(1) };
}

function rowsParaObjetos(headers, rows) {
  return rows.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { if (h) obj[h] = row[i]; });
    return obj;
  });
}

// Verifica se email é admin
function verificarAdmin(emailAdmin) {
  if (!emailAdmin) return false;
  var aba = getAba('Usuários');
  if (!aba) return false;
  var lido = lerAba(aba);
  var usuarios = rowsParaObjetos(lido.headers, lido.rows);
  for (var i = 0; i < usuarios.length; i++) {
    var u = usuarios[i];
    if (u['Email'] && u['Email'].toString().toLowerCase() === emailAdmin.toLowerCase()
        && String(u['Perfil']).toLowerCase() === 'admin'
        && String(u['Ativo']) === 'true') {
      return true;
    }
  }
  return false;
}

// ============================================================
// LISTAR — com cache para não sobrecarregar
// ============================================================
function listar(tabela, params) {
  var nome = nomeAba(tabela);
  if (!nome) return { ok: false, erro: 'Tabela invalida: ' + tabela };

  // Tentar cache primeiro (leituras frequentes)
  var cache = CacheService.getScriptCache();
  var chaveCache = 'lista_' + tabela + '_' + (params.mes || 'todos');
  var cached = cache.get(chaveCache);
  if (cached && !params.nocache) {
    try {
      var dados = JSON.parse(cached);
      return { ok: true, dados: dados, total: dados.length, cached: true };
    } catch(_) {}
  }

  var aba = getAba(nome);
  if (!aba) return { ok: false, erro: 'Aba nao encontrada: ' + nome };

  var lido = lerAba(aba);
  var objetos = rowsParaObjetos(lido.headers, lido.rows);

  // Filtros
  if (params && params.mes) {
    objetos = objetos.filter(function(r) {
      var dt = String(r['Data'] || r['Data Pagto'] || r['Competencia'] || '');
      return dt.indexOf(params.mes) >= 0;
    });
  }
  if (params && params.limite) {
    objetos = objetos.slice(0, parseInt(params.limite));
  }

  // Salvar cache por 60s
  try { cache.put(chaveCache, JSON.stringify(objetos), CACHE_TTL); } catch(_) {}

  return { ok: true, dados: objetos, total: objetos.length };
}

// ============================================================
// SALVAR — otimizado com appendRow direto
// ============================================================
function salvar(tabela, dados, arquivo) {
  var nome = nomeAba(tabela);
  if (!nome) return { ok: false, erro: 'Tabela invalida' };
  var aba = getAba(nome);
  if (!aba) return { ok: false, erro: 'Aba nao encontrada: ' + nome };

  if (!dados) dados = {};
  if (!dados['ID']) dados['ID'] = gerarId();
  dados['Timestamp'] = new Date().toISOString();

  // Salvar arquivo no Drive
  var linkDrive = '';
  if (arquivo && arquivo.base64 && arquivo.nome) {
    try {
      linkDrive = salvarArquivoDriveRapido(arquivo.nome, arquivo.base64, arquivo.mime || 'application/pdf', tabela);
      dados['Link Drive'] = linkDrive;
      dados['Arquivo PDF'] = arquivo.nome;
    } catch(e) { dados['Arquivo PDF'] = arquivo.nome + ' (erro upload)'; }
  }

  // Pegar headers uma vez
  var headers = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var linha = headers.map(function(h) { return dados[h] !== undefined ? dados[h] : ''; });

  aba.appendRow(linha);

  // Invalidar cache da tabela
  try {
    var cache = CacheService.getScriptCache();
    cache.remove('lista_' + tabela + '_todos');
    cache.remove('lista_' + tabela + '_' + (dados['Data'] || dados['Data Pagto'] || '').substring(0,7));
  } catch(_) {}

  try { logRapido(dados['Registrado Por'] || '', 'SALVAR', nome, dados['ID']); } catch(_) {}

  // Verificar alertas se for sinais vitais
  var alertas = [];
  if (tabela === 'vitais') {
    alertas = verificarSinaisVitais(dados);
    if (alertas.length > 0) {
      try {
        var ultimaLinha = aba.getLastRow();
        var alertaCol = headers.indexOf('Alertas') + 1;
        if (alertaCol > 0) aba.getRange(ultimaLinha, alertaCol).setValue(alertas.join(' | '));
      } catch(_) {}
    }
  }

  return { ok: true, id: dados['ID'], alertas: alertas, linkDrive: linkDrive };
}

// ============================================================
// BATCH — salvar múltiplos registros de uma vez
// ============================================================
function batch(operacoes) {
  if (!operacoes || !operacoes.length) return { ok: true, resultados: [] };
  var resultados = operacoes.map(function(op) {
    try {
      if (op.acao === 'salvar')    return salvar(op.tabela, op.dados, op.arquivo);
      if (op.acao === 'atualizar') return atualizar(op.tabela, op.id, op.dados);
      if (op.acao === 'excluir')   return excluir(op.tabela, op.id);
      return { ok: false, erro: 'Acao desconhecida: ' + op.acao };
    } catch(e) {
      return { ok: false, erro: e.toString() };
    }
  });
  return { ok: true, resultados: resultados };
}

// ============================================================
// ATUALIZAR
// ============================================================
function atualizar(tabela, id, dados) {
  var nome = nomeAba(tabela);
  if (!nome) return { ok: false, erro: 'Tabela invalida' };
  var aba = getAba(nome);
  var lido = lerAba(aba);
  var linhaIdx = -1;
  for (var i = 0; i < lido.rows.length; i++) {
    if (String(lido.rows[i][0]) === String(id)) { linhaIdx = i + 2; break; }
  }
  if (linhaIdx < 0) return { ok: false, erro: 'Registro nao encontrado' };
  dados['Timestamp'] = new Date().toISOString();
  lido.headers.forEach(function(h, i) {
    if (dados[h] !== undefined) aba.getRange(linhaIdx, i+1).setValue(dados[h]);
  });
  try { CacheService.getScriptCache().remove('lista_' + tabela + '_todos'); } catch(_) {}
  return { ok: true, id: id };
}

// ============================================================
// EXCLUIR
// ============================================================
function excluir(tabela, id) {
  var nome = nomeAba(tabela);
  if (!nome) return { ok: false, erro: 'Tabela invalida' };
  var aba = getAba(nome);
  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(id)) {
      aba.deleteRow(i + 1);
      try { CacheService.getScriptCache().remove('lista_' + tabela + '_todos'); } catch(_) {}
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Registro nao encontrado' };
}

// ============================================================
// LOGIN — com cache de sessão
// ============================================================
function login(email, senha) {
  if (!email) return { ok: false, erro: 'Email obrigatorio' };

  var cache = CacheService.getScriptCache();
  var chaveU = 'usuarios_lista';
  var usuarios = null;
  var cached = cache.get(chaveU);
  if (cached) {
    try { usuarios = JSON.parse(cached); } catch(_) {}
  }
  if (!usuarios) {
    var aba = getAba('Usuários');
    if (!aba) return { ok: false, erro: 'Sistema nao inicializado' };
    var lido = lerAba(aba);
    usuarios = rowsParaObjetos(lido.headers, lido.rows);
    try { cache.put(chaveU, JSON.stringify(usuarios), 300); } catch(_) {}
  }

  var usuario = null;
  for (var i = 0; i < usuarios.length; i++) {
    var u = usuarios[i];
    if (u['Email'] && u['Email'].toString().toLowerCase() === email.toLowerCase()
        && String(u['Ativo']) === 'true') {
      usuario = u; break;
    }
  }
  if (!usuario) return { ok: false, erro: 'Usuário não encontrado ou inativo' };
  if (String(usuario['Senha Hash']) !== String(senha)) return { ok: false, erro: 'Senha incorreta' };

  try { logRapido(usuario['Nome'], 'LOGIN', 'Sistema', email); } catch(_) {}

  return {
    ok: true,
    usuario: {
      id: usuario['ID'],
      nome: usuario['Nome'],
      email: usuario['Email'],
      perfil: String(usuario['Perfil']).toLowerCase()
    }
  };
}

// ============================================================
// GESTÃO DE USUÁRIOS (apenas admin)
// ============================================================
function listarUsuarios(emailAdmin) {
  if (!verificarAdmin(emailAdmin)) return { ok: false, erro: 'Acesso negado' };
  var aba = getAba('Usuários');
  if (!aba) return { ok: false, erro: 'Aba nao encontrada' };
  var lido = lerAba(aba);
  var lista = rowsParaObjetos(lido.headers, lido.rows);
  // Não retornar senha hash
  lista = lista.map(function(u) {
    return { ID: u['ID'], Nome: u['Nome'], Email: u['Email'], Perfil: u['Perfil'], Ativo: u['Ativo'] };
  });
  return { ok: true, dados: lista };
}

function cadastrarUsuario(emailAdmin, dados) {
  if (!verificarAdmin(emailAdmin)) return { ok: false, erro: 'Acesso negado' };
  if (!dados || !dados['Nome'] || !dados['Email'] || !dados['Senha Hash']) {
    return { ok: false, erro: 'Nome, email e senha são obrigatórios' };
  }
  var aba = getAba('Usuários');
  if (!aba) return { ok: false, erro: 'Aba nao encontrada' };

  // Verificar se email já existe
  var lido = lerAba(aba);
  var existentes = rowsParaObjetos(lido.headers, lido.rows);
  var jaExiste = existentes.some(function(u) {
    return u['Email'] && u['Email'].toString().toLowerCase() === dados['Email'].toLowerCase();
  });
  if (jaExiste) return { ok: false, erro: 'Este e-mail já está cadastrado' };

  dados['ID'] = gerarId();
  dados['Ativo'] = 'true';
  dados['Timestamp'] = new Date().toISOString();

  var headers = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var linha = headers.map(function(h) { return dados[h] !== undefined ? dados[h] : ''; });
  aba.appendRow(linha);

  try { CacheService.getScriptCache().remove('usuarios_lista'); } catch(_) {}
  try { logRapido(emailAdmin, 'CRIAR_USUARIO', 'Usuários', dados['Email']); } catch(_) {}

  return { ok: true, id: dados['ID'] };
}

function editarUsuario(emailAdmin, id, dados) {
  if (!verificarAdmin(emailAdmin)) return { ok: false, erro: 'Acesso negado' };
  if (!id) return { ok: false, erro: 'ID obrigatorio' };

  var aba = getAba('Usuários');
  if (!aba) return { ok: false, erro: 'Aba nao encontrada' };
  var lido = lerAba(aba);
  var linhaIdx = -1;
  for (var i = 0; i < lido.rows.length; i++) {
    if (String(lido.rows[i][0]) === String(id)) { linhaIdx = i + 2; break; }
  }
  if (linhaIdx < 0) return { ok: false, erro: 'Usuário nao encontrado' };

  dados['Timestamp'] = new Date().toISOString();
  lido.headers.forEach(function(h, i) {
    if (dados[h] !== undefined && h !== 'ID') aba.getRange(linhaIdx, i+1).setValue(dados[h]);
  });

  try { CacheService.getScriptCache().remove('usuarios_lista'); } catch(_) {}
  try { logRapido(emailAdmin, 'EDITAR_USUARIO', 'Usuários', id); } catch(_) {}

  return { ok: true };
}

function desativarUsuario(emailAdmin, id) {
  if (!verificarAdmin(emailAdmin)) return { ok: false, erro: 'Acesso negado' };
  if (!id) return { ok: false, erro: 'ID obrigatorio' };

  var aba = getAba('Usuários');
  if (!aba) return { ok: false, erro: 'Aba nao encontrada' };
  var lido = lerAba(aba);
  var atvIdx = lido.headers.indexOf('Ativo');
  if (atvIdx < 0) return { ok: false, erro: 'Coluna Ativo nao encontrada' };

  for (var i = 0; i < lido.rows.length; i++) {
    if (String(lido.rows[i][0]) === String(id)) {
      var novoStatus = String(lido.rows[i][atvIdx]) === 'true' ? 'false' : 'true';
      aba.getRange(i + 2, atvIdx + 1).setValue(novoStatus);
      try { CacheService.getScriptCache().remove('usuarios_lista'); } catch(_) {}
      try { logRapido(emailAdmin, novoStatus === 'true' ? 'ATIVAR_USUARIO' : 'DESATIVAR_USUARIO', 'Usuários', id); } catch(_) {}
      return { ok: true, ativo: novoStatus };
    }
  }
  return { ok: false, erro: 'Usuário nao encontrado' };
}

function alterarSenha(email, senhaAtual, novaSenha) {
  if (!email || !senhaAtual || !novaSenha) return { ok: false, erro: 'Dados incompletos' };
  if (novaSenha.length < 6) return { ok: false, erro: 'Nova senha deve ter pelo menos 6 caracteres' };

  var aba = getAba('Usuários');
  if (!aba) return { ok: false, erro: 'Aba nao encontrada' };
  var lido = lerAba(aba);
  var senhaIdx = lido.headers.indexOf('Senha Hash');
  if (senhaIdx < 0) return { ok: false, erro: 'Coluna senha nao encontrada' };

  for (var i = 0; i < lido.rows.length; i++) {
    var u = lido.rows[i];
    var emailCol = lido.headers.indexOf('Email');
    if (emailCol >= 0 && String(u[emailCol]).toLowerCase() === email.toLowerCase()) {
      if (String(u[senhaIdx]) !== String(senhaAtual)) return { ok: false, erro: 'Senha atual incorreta' };
      aba.getRange(i + 2, senhaIdx + 1).setValue(novaSenha);
      try { CacheService.getScriptCache().remove('usuarios_lista'); } catch(_) {}
      try { logRapido(email, 'ALTERAR_SENHA', 'Usuários', email); } catch(_) {}
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Usuário nao encontrado' };
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================
function getConfig() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('config_geral');
  if (cached) { try { return { ok: true, config: JSON.parse(cached) }; } catch(_) {} }
  var aba = getAba('Configurações');
  if (!aba) return { ok: false, erro: 'Nao inicializado' };
  var lido = lerAba(aba);
  var cfg = {};
  lido.rows.forEach(function(r) { if (r[0]) cfg[r[0]] = r[1]; });
  try { cache.put('config_geral', JSON.stringify(cfg), 300); } catch(_) {}
  return { ok: true, config: cfg };
}

// ============================================================
// LOG RÁPIDO (non-blocking append)
// ============================================================
function logRapido(usuario, acao, modulo, detalhe) {
  var aba = getAba('Log de Ações');
  if (aba) aba.appendRow([new Date(), usuario, acao, modulo, String(detalhe).substring(0,200), '']);
}

// ============================================================
// VERIFICAR SINAIS VITAIS
// ============================================================
function verificarSinaisVitais(dados) {
  var alertas = [];
  var checks = [
    { campo:'Sistolica',   min:90,  max:140, nome:'Pressao sistolica',  un:'mmHg'},
    { campo:'Diastolica',  min:60,  max:90,  nome:'Pressao diastolica', un:'mmHg'},
    { campo:'Oxigenacao',  min:92,  max:100, nome:'Oxigenacao',         un:'%'   },
    { campo:'FC',          min:50,  max:110, nome:'Freq. cardiaca',     un:'bpm' },
    { campo:'Temperatura', min:35.5,max:37.8,nome:'Temperatura',        un:'C'   },
    { campo:'Glicemia',    min:60,  max:180, nome:'Glicemia',           un:'mg/dL'}
  ];
  checks.forEach(function(c) {
    var v = parseFloat(dados[c.campo] || '');
    if (isNaN(v)) return;
    if (v < c.min) alertas.push('BAIXO: ' + c.nome + ' ' + v + c.un + ' (min ' + c.min + ')');
    else if (v > c.max) alertas.push('ALTO: ' + c.nome + ' ' + v + c.un + ' (max ' + c.max + ')');
  });
  return alertas;
}

// ============================================================
// UPLOAD DRIVE RÁPIDO
// ============================================================
function salvarArquivoDriveRapido(nome, base64, mime, tipo) {
  var subpastas = { visitas:'Visitas Medicas', exames:'Exames e Laudos', despesas:'Comprovantes' };
  var nomePasta = subpastas[tipo] || 'Documentos Gerais';
  var aba = getAba('Configurações');
  var pastaId = '';
  if (aba) {
    var dados = aba.getDataRange().getValues();
    for (var i=1; i<dados.length; i++) {
      if (dados[i][0]==='pasta_drive'){ pastaId=dados[i][1]; break; }
    }
  }
  if (!pastaId) return '';
  var pasta = DriveApp.getFolderById(pastaId);
  var subs = pasta.getFoldersByName(nomePasta);
  var destino = subs.hasNext() ? subs.next() : pasta.createFolder(nomePasta);
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mime, nome);
  var arq = destino.createFile(blob);
  arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/file/d/' + arq.getId() + '/view';
}

// ============================================================
// INICIALIZAR PLANILHA
// IMPORTANTE: nomes das abas COM acentos para coincidir com MAPA/ABAS
// ============================================================
function inicializarPlanilha() {
  var ss = getSS();
  var estrutura = {
    'Sinais Vitais':    ['ID','Data','Hora','Sistolica','Diastolica','Oxigenacao','FC','Temperatura','Glicemia','Obs','Registrado Por','Timestamp','Alertas'],
    'Medicamentos':     ['ID','Data','Hora','Medicamento','Dose','Via','Obs','Status','Registrado Por','Timestamp'],
    'Med. Cadastro':    ['ID','Nome','Dose','Via','Horarios','Prescricao','Inicio','Fim','Obs','Ativo','Timestamp'],
    'Visitas Médicas':  ['ID','Data','Hora','Especialidade','Profissional','Obs','Arquivo PDF','Link Drive','Registrado Por','Timestamp'],
    'Exames e Docs':    ['ID','Data','Hora','Tipo','Laboratorio','Resultado','Obs','Arquivo PDF','Link Drive','Registrado Por','Timestamp'],
    'Despesas':         ['ID','Data','Filho','Descricao','Qtd','Valor','Total','Categoria','Arquivo','Link Drive','Registrado Por','Timestamp'],
    'Receitas':         ['ID','Data Pagto','Filho','Valor','Forma','Competencia','Obs','Registrado Por','Timestamp'],
    'Cuidados Diários': ['ID','Data','Hora','Categoria','Item','Feito','Obs','Registrado Por','Timestamp'],
    'Usuários':         ['ID','Nome','Email','Perfil','Celular','Ativo','Senha Hash','Timestamp'],
    'Configurações':    ['Chave','Valor','Descricao'],
    'Log de Ações':     ['Timestamp','Usuario','Acao','Modulo','Detalhes','IP']
  };

  var cores = {
    'Sinais Vitais':'#B71C1C','Medicamentos':'#1B5E20','Med. Cadastro':'#2E7D32',
    'Visitas Médicas':'#4A148C','Exames e Docs':'#1565C0','Despesas':'#E65100',
    'Receitas':'#1A237E','Cuidados Diários':'#00695C','Usuários':'#37474F',
    'Configurações':'#455A64','Log de Ações':'#4E342E'
  };

  Object.keys(estrutura).forEach(function(nome) {
    var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var cols = estrutura[nome];
    aba.getRange(1,1,1,cols.length).setValues([cols])
       .setBackground(cores[nome]||'#1A3A5C')
       .setFontColor('#FFFFFF').setFontWeight('bold');
    aba.setFrozenRows(1);
    for (var i=1;i<=cols.length;i++) aba.setColumnWidth(i,140);
  });

  // Usuário admin padrão (senha: admin123 — trocar imediatamente!)
  var abaU = ss.getSheetByName('Usuários');
  if (abaU && abaU.getLastRow() <= 1) {
    var now = new Date();
    abaU.appendRow([gerarId(),'Administrador','admin@cuidarbem.com','admin','','true','admin123',now]);
    // Instruções nos dados
    Logger.log('IMPORTANTE: Acesse com admin@cuidarbem.com / admin123 e troque a senha imediatamente!');
  }

  // Configurações padrão
  var abaCfg = ss.getSheetByName('Configurações');
  if (abaCfg && abaCfg.getLastRow() <= 1) {
    abaCfg.appendRow(['nome_paciente','Paciente','Nome do paciente']);
    abaCfg.appendRow(['cota_filho','300','Cota mensal R$']);
    abaCfg.appendRow(['pasta_drive','','ID da pasta Drive']);
    abaCfg.appendRow(['versao','3.1','Versao']);
  }

  // Criar pasta Drive
  criarPastaDrive();

  try { CacheService.getScriptCache().removeAll(['usuarios_lista','config_geral']); } catch(_) {}

  try {
    try { SpreadsheetApp.getUi().alert(
      'CuidarBem v3.1 inicializado!\n\n' +
      'Abas criadas com sucesso.\n' +
      'Usuário admin criado:\n' +
      '  E-mail: admin@cuidarbem.com\n' +
      '  Senha: admin123\n\n' +
      'IMPORTANTE: Troque a senha do admin pelo app!\n\n' +
      'Agora: Implantar > Nova implantação para obter a URL da API.'
    ); } catch(e) {
      Logger.log('CuidarBem v3.1 inicializado! Admin: admin@cuidarbem.com / admin123');
    }
  } catch(e) {}
}

function criarPastaDrive() {
  var ss = getSS();
  var abaCfg = ss.getSheetByName('Configurações');
  if (!abaCfg) return '';
  var dados = abaCfg.getDataRange().getValues();
  var pastaId = '';
  var linhaCfg = -1;
  for (var i=1;i<dados.length;i++) {
    if (dados[i][0]==='pasta_drive'){ pastaId=dados[i][1]; linhaCfg=i+1; break; }
  }
  if (pastaId) return pastaId;
  var raiz = DriveApp.createFolder('CuidarBem - Documentos');
  ['Exames e Laudos','Comprovantes','Visitas Medicas','Documentos Gerais'].forEach(function(n){ raiz.createFolder(n); });
  if (linhaCfg>0) abaCfg.getRange(linhaCfg,2).setValue(raiz.getId());
  return raiz.getId();
}

// ============================================================
// MENU
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CuidarBem')
    .addItem('Inicializar planilha','inicializarPlanilha')
    .addItem('Ver URL da API','verURL')
    .addItem('Testar API','testarAPI')
    .addItem('Limpar cache','limparCache')
    .addItem('Abrir pasta Drive','abrirDrive')
    .addToUi();
}

function verURL() {
  var msg = 'COMO OBTER A URL:\n\n' +
    '1. Clique em Implantar > Nova implantação\n' +
    '2. Tipo: App da Web\n' +
    '3. Executar como: Eu\n' +
    '4. Acesso: Qualquer pessoa\n' +
    '5. Clique em Implantar\n' +
    '6. Copie a URL gerada\n\n' +
    'Cole essa URL no app em Configurações (perfil Admin)';
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) { Logger.log(msg); }
}

function testarAPI() {
  var r = ping();
  try { SpreadsheetApp.getUi().alert('API respondeu:\n'+JSON.stringify(r)); } catch(e) { Logger.log('API: '+JSON.stringify(r)); }
}

function limparCache() {
  try {
    CacheService.getScriptCache().removeAll(['usuarios_lista','config_geral','lista_vitais_todos','lista_meds_todos','lista_visitas_todos']);
    try { SpreadsheetApp.getUi().alert('Cache limpo!'); } catch(e) { Logger.log('Cache limpo!'); }
  } catch(e) {
    try { SpreadsheetApp.getUi().alert('Erro: '+e); } catch(e2) { Logger.log('Erro: '+e); }
  }
}

function abrirDrive() {
  var aba = getAba('Configurações');
  if (!aba) { try { SpreadsheetApp.getUi().alert('Nao inicializado.'); } catch(e) {} return; }
  var dados = aba.getDataRange().getValues();
  for (var i=1;i<dados.length;i++) {
    if (dados[i][0]==='pasta_drive' && dados[i][1]) {
      try { SpreadsheetApp.getUi().alert('Pasta:\nhttps://drive.google.com/drive/folders/'+dados[i][1]); } catch(e) {}
      return;
    }
  }
  try { SpreadsheetApp.getUi().alert('Pasta nao encontrada. Execute Inicializar primeiro.'); } catch(e) {}
}
