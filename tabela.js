import { auth, db } from "./firebase-config.js";
import {
  carregarPermissoes,
  podeEditarCelula
} from "./permissoes.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


const tabela = document.getElementById("tabela-status");
const filtroRede = document.getElementById("filtro-rede");
const filtroCelula = document.getElementById("filtro-celula");

let membros = [];
let pagamentos = [];
let pagamentoEmEdicao = null;
let salvandoEdicao = false;
let membroEmEdicao = null;
let salvandoNomeMembro = false;

function autorizadoEditarMembro(membro) {
  const usuario = auth.currentUser;

  return Boolean(
    usuario &&
    membro &&
    permissoesTabela?.uid === usuario.uid &&
    podeEditarCelula(permissoesTabela, membro.celulaId)
  );
}
let permissoesTabela = null;
let versaoPermissoesTabela = 0;

function autorizadoEditarPagamento(pagamento) {
  const usuario = auth.currentUser;

  return Boolean(
    usuario &&
    pagamento &&
    permissoesTabela?.uid === usuario.uid &&
    podeEditarCelula(permissoesTabela, pagamento.celulaId)
  );
}

onAuthStateChanged(auth, async (usuario) => {
  const versao = ++versaoPermissoesTabela;

permissoesTabela = null;
pagamentoEmEdicao = null;
membroEmEdicao = null;

const janelaMembro = document.getElementById("dialog-editar-membro");
if (janelaMembro.open) janelaMembro.close();

  document.getElementById("btn-salvar-edicao").disabled = true;

  const janela = document.getElementById("dialog-editar-pagamento");
  if (janela.open) janela.close();

  atualizarTabela();

  if (!usuario) return;

  try {
    const permissoes = await carregarPermissoes(usuario);

    if (
      versao !== versaoPermissoesTabela ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    permissoesTabela = permissoes;
    atualizarTabela();
  } catch (erro) {
    if (
      versao !== versaoPermissoesTabela ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    console.error("Erro ao consultar permissões de edição:", erro);
  }
});

const RETIRO_ID = "retiro_principal";
const META_CENTAVOS = 45000;

function formatarDinheiro(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}
let nomesRedes = new Map();
let nomesCelulas = new Map();
let carregado = false;
let versaoLeitura = 0;
let pararPagamentos = null;
let pararMembros = null;
let membrosProntos = false;
let pagamentosProntos = false;

function limparIndicadores() {
  document.getElementById("kpi-total").textContent = "—";
  document.getElementById("kpi-progress-bar").style.width = "0%";
  document.getElementById("kpi-progress-text").textContent = "—";
}

function mostrarMensagem(texto) {
  const linha = document.createElement("tr");
  const coluna = document.createElement("td");

  coluna.colSpan = 6;
  coluna.className = "py-8 px-3 text-center text-gray-400";
  coluna.textContent = texto;

  linha.append(coluna);
  tabela.replaceChildren(linha);
}
function atualizarVisibilidadeFormularios() {
  const usuario = auth.currentUser;

  const podeGerenciar = Boolean(
    usuario &&
    permissoesTabela?.uid === usuario.uid &&
    (
      permissoesTabela.administrador ||
      permissoesTabela.celulasEditaveis.length > 0
    )
  );

  const formularios = document.getElementById("form-container");
  const painelTabela = document.getElementById("table-container");

  formularios.classList.toggle("hidden", !podeGerenciar);

  painelTabela.classList.toggle("lg:col-span-2", podeGerenciar);
  painelTabela.classList.toggle("lg:col-span-3", !podeGerenciar);
}
let gruposCelulasAbertos = new Set();
let contextoGruposCelulas = "";

function configurarLinhaGrupo(linha, chaveGrupo, agrupar) {
  if (!agrupar) return;

  linha.dataset.grupoCelula = chaveGrupo;
  linha.style.display =
    gruposCelulasAbertos.has(chaveGrupo) ? "" : "none";
}

function adicionarCabecalhoCelula(grupo, chaveGrupo) {
  const linha = document.createElement("tr");
  const coluna = document.createElement("td");
  const botao = document.createElement("button");

  coluna.colSpan = 6;
  coluna.className = "px-3 py-3 bg-gray-800";

  botao.type = "button";
  botao.className =
    "w-full text-left text-blue-300 font-semibold";

  const total = pagamentos
    .filter((pagamento) =>
      pagamento.redeId === grupo.redeId &&
      pagamento.celulaId === grupo.celulaId
    )
    .reduce((soma, pagamento) => soma + pagamento.valorCentavos, 0);

  const nomeCelula =
    nomesCelulas.get(grupo.celulaId) || grupo.celulaId;

  function atualizarTexto() {
    const aberto = gruposCelulasAbertos.has(chaveGrupo);

    botao.setAttribute("aria-expanded", String(aberto));
    botao.textContent =
      `${aberto ? "▼" : "▶"} ${nomeCelula} — ` +
      `${grupo.quantidade} membro(s) — ${formatarDinheiro(total)}`;
  }

  botao.addEventListener("click", () => {
    const abrir = !gruposCelulasAbertos.has(chaveGrupo);

    if (abrir) {
      gruposCelulasAbertos.add(chaveGrupo);
    } else {
      gruposCelulasAbertos.delete(chaveGrupo);
    }

    for (const item of tabela.children) {
      if (item.dataset.grupoCelula === chaveGrupo) {
        item.style.display = abrir ? "" : "none";
      }
    }

    atualizarTexto();
  });

  atualizarTexto();
  coluna.append(botao);
  linha.append(coluna);
  tabela.append(linha);
}

function atualizarTabela() {
  atualizarVisibilidadeFormularios();
  atualizarMembrosPagamento();

  if (!carregado) return;

  const filtrados = membros.filter((membro) =>
    membro.ativo !== false &&
    (!filtroRede.value || membro.redeId === filtroRede.value) &&
    (!filtroCelula.value || membro.celulaId === filtroCelula.value)
  );
const pagamentosFiltrados = pagamentos.filter((pagamento) =>
  (!filtroRede.value || pagamento.redeId === filtroRede.value) &&
  (!filtroCelula.value || pagamento.celulaId === filtroCelula.value)
);

const totalArrecadado = pagamentosFiltrados.reduce(
  (total, pagamento) => total + pagamento.valorCentavos,
  0
);

// Cada membro ativo contribui com sua meta individual.
const metaGrupo = filtrados.length * META_CENTAVOS;

const progressoGrupo = metaGrupo > 0
  ? Math.min(100, totalArrecadado / metaGrupo * 100)
  : 0;

document.getElementById("kpi-total").textContent =
  formatarDinheiro(totalArrecadado);

document.getElementById("kpi-progress-bar").style.width =
  `${progressoGrupo}%`;

document.getElementById("kpi-progress-text").textContent =
  metaGrupo > 0
    ? `${progressoGrupo.toLocaleString("pt-BR", {
        maximumFractionDigits: 1
      })}%`
    : "Sem meta";
  if (filtrados.length === 0) {
    mostrarMensagem("Nenhum membro cadastrado neste filtro.");
    return;
  }

  const agrupar = !filtroCelula.value;

const contextoAtual = JSON.stringify([
  auth.currentUser?.uid,
  filtroRede.value,
  filtroCelula.value
]);

if (contextoAtual !== contextoGruposCelulas) {
  contextoGruposCelulas = contextoAtual;
  gruposCelulasAbertos.clear();
}

const comparar = (a, b) =>
  String(a || "").localeCompare(String(b || ""), "pt-BR", {
    numeric: true,
    sensitivity: "base"
  });

filtrados.sort((a, b) =>
  comparar(
    nomesRedes.get(a.redeId) || a.redeId,
    nomesRedes.get(b.redeId) || b.redeId
  ) ||
  comparar(a.redeId, b.redeId) ||
  comparar(
    nomesCelulas.get(a.celulaId) || a.celulaId,
    nomesCelulas.get(b.celulaId) || b.celulaId
  ) ||
  comparar(a.celulaId, b.celulaId) ||
  comparar(a.nome, b.nome)
);

const grupos = new Map();

for (const membro of filtrados) {
  const chave = JSON.stringify([membro.redeId, membro.celulaId]);

  if (!grupos.has(chave)) {
    grupos.set(chave, {
      redeId: membro.redeId,
      celulaId: membro.celulaId,
      quantidade: 0
    });
  }

  grupos.get(chave).quantidade++;
}

tabela.replaceChildren();

let ultimaRede = null;
let ultimoGrupo = null;

for (const membro of filtrados) {
  const chaveGrupo = JSON.stringify([
  membro.redeId,
  membro.celulaId
]);

if (agrupar && membro.redeId !== ultimaRede) {
  const linhaRede = document.createElement("tr");
  const colunaRede = document.createElement("td");

  colunaRede.colSpan = 6;
  colunaRede.className =
    "px-3 py-4 bg-gray-900 text-white font-bold text-lg";
  colunaRede.textContent =
    nomesRedes.get(membro.redeId) || membro.redeId;

  linhaRede.append(colunaRede);
  tabela.append(linhaRede);

  ultimaRede = membro.redeId;
}

if (agrupar && chaveGrupo !== ultimoGrupo) {
  adicionarCabecalhoCelula(grupos.get(chaveGrupo), chaveGrupo);
  ultimoGrupo = chaveGrupo;
}
    const linha = document.createElement("tr");
    linha.className = "border-b border-gray-700";

    const totalPago = pagamentos
  .filter((pagamento) =>
    pagamento.membroId === membro.id &&
    pagamento.redeId === membro.redeId &&
    pagamento.celulaId === membro.celulaId
  )
  .reduce((total, pagamento) => total + pagamento.valorCentavos, 0);

const falta = Math.max(0, META_CENTAVOS - totalPago);
const progresso = Math.min(100, totalPago / META_CENTAVOS * 100);

const valores = [
  membro.nome,
  nomesRedes.get(membro.redeId) || membro.redeId,
  nomesCelulas.get(membro.celulaId) || membro.celulaId,
  formatarDinheiro(totalPago),
  formatarDinheiro(falta),
  `${progresso.toLocaleString("pt-BR", {
    maximumFractionDigits: 1
  })}%`
];

    valores.forEach((valor, indice) => {
      const coluna = document.createElement("td");
      coluna.className = indice >= 3
        ? "py-3 px-3 text-center"
        : "py-3 px-3";

      coluna.textContent = valor;

if (indice === 0) {
  const botaoEditarNome = document.createElement("button");

  botaoEditarNome.type = "button";
  botaoEditarNome.className =
    "block mt-2 px-3 py-1 rounded-lg bg-blue-600 text-white text-sm";

  botaoEditarNome.textContent = "Editar nome";
  botaoEditarNome.disabled = !autorizadoEditarMembro(membro);
  botaoEditarNome.hidden = !autorizadoEditarMembro(membro);

  botaoEditarNome.addEventListener("click", () => {
    if (
      salvandoNomeMembro ||
      !autorizadoEditarMembro(membro)
    ) return;

    membroEmEdicao = { ...membro };

    document.getElementById("editar-membro-nome").value =
      membro.nome;

    document.getElementById("editar-membro-contexto").textContent =
      `${nomesRedes.get(membro.redeId) || membro.redeId} — ` +
      `${nomesCelulas.get(membro.celulaId) || membro.celulaId}`;

    document.getElementById("editar-membro-mensagem").textContent = "";

    document.getElementById("btn-salvar-membro-edicao").disabled =
  !autorizadoEditarMembro(membro);

    document.getElementById("dialog-editar-membro").showModal();
    document.getElementById("editar-membro-nome").focus();
  });

  if (autorizadoEditarMembro(membro)) {
  coluna.append(botaoEditarNome);
}
}

linha.append(coluna);
    });

    configurarLinhaGrupo(linha, chaveGrupo, agrupar);
tabela.append(linha);

// O histórico aparece apenas nas células que a pessoa pode editar.
if (!autorizadoEditarMembro(membro)) continue;

const historico = pagamentos
  .filter((pagamento) =>
    pagamento.membroId === membro.id &&
    pagamento.redeId === membro.redeId &&
    pagamento.celulaId === membro.celulaId
  )
  .sort((a, b) =>
    (b.criadoEm?.toMillis() || 0) - (a.criadoEm?.toMillis() || 0)
  );

const linhaHistorico = document.createElement("tr");
const colunaHistorico = document.createElement("td");
colunaHistorico.colSpan = 6;
colunaHistorico.className = "px-3 pb-3";

const detalhes = document.createElement("details");
detalhes.className = "rounded-lg bg-gray-900 p-3";

const resumo = document.createElement("summary");
resumo.className = "cursor-pointer text-blue-400 font-semibold";
resumo.textContent = `Histórico de pagamentos (${historico.length})`;
detalhes.append(resumo);

if (historico.length === 0) {
  const aviso = document.createElement("p");
  aviso.className = "mt-3 text-gray-400";
  aviso.textContent = "Nenhum pagamento registrado.";
  detalhes.append(aviso);
}

for (const pagamento of historico) {
  const item = document.createElement("p");
  item.className = "mt-3 border-t border-gray-700 pt-3";

  const data = pagamento.criadoEm?.toDate();
  const dataFormatada = data
    ? data.toLocaleString("pt-BR")
    : "Confirmando data…";

  const dataRecebimento = pagamento.dataPagamento
  ? pagamento.dataPagamento.split("-").reverse().join("/")
  : "Não informada";

item.textContent =
  `${formatarDinheiro(pagamento.valorCentavos)} — ` +
  `${pagamento.metodo} — Recebido em: ${dataRecebimento} — ` +
  `Registrado em: ${dataFormatada}`;

  const botaoEditar = document.createElement("button");

botaoEditar.type = "button";
botaoEditar.className =
  "block mt-2 px-3 py-1 rounded-lg bg-blue-600 text-white text-sm";

botaoEditar.textContent = "Editar pagamento";
botaoEditar.dataset.pagamentoId = pagamento.id;
botaoEditar.disabled = !autorizadoEditarPagamento(pagamento);
botaoEditar.hidden = !autorizadoEditarPagamento(pagamento);

botaoEditar.addEventListener("click", () => {
  if (
  salvandoEdicao ||
  !autorizadoEditarPagamento(pagamento)
) return;

  pagamentoEmEdicao = { ...pagamento };
  document.getElementById("btn-salvar-edicao").disabled = false;

  document.getElementById("editar-pagamento-id").value = pagamento.id;

  document.getElementById("editar-pagamento-valor").value =
    (pagamento.valorCentavos / 100).toFixed(2);

  document.getElementById("editar-pagamento-data").value =
    pagamento.dataPagamento || "";

  document.getElementById("editar-pagamento-metodo").value =
    pagamento.metodo;

  document.getElementById("editar-pagamento-contexto").textContent =
    `${membro.nome} — ` +
    `${nomesRedes.get(pagamento.redeId) || pagamento.redeId} — ` +
    `${nomesCelulas.get(pagamento.celulaId) || pagamento.celulaId}`;

  document.getElementById("editar-pagamento-mensagem").textContent = "";

  document.getElementById("dialog-editar-pagamento").showModal();
});

if (autorizadoEditarPagamento(pagamento)) {
  item.append(botaoEditar);
}
  detalhes.append(item);
}

colunaHistorico.append(detalhes);
linhaHistorico.append(colunaHistorico);
configurarLinhaGrupo(linhaHistorico, chaveGrupo, agrupar);
tabela.append(linhaHistorico);
  }
}

onAuthStateChanged(auth, async (usuario) => {
  const versao = ++versaoLeitura;
   if (pararPagamentos) {
    pararPagamentos();
    pararPagamentos = null;
  }

  limparIndicadores();
  if (pararMembros) {
  pararMembros();
  pararMembros = null;
}

membrosProntos = false;
pagamentosProntos = false;
  
  carregado = false;
  membros = [];
  pagamentos = [];
  nomesRedes.clear();
  atualizarMembrosPagamento();
  nomesCelulas.clear();

    if (!usuario) {
    mostrarMensagem(
      "Entre com sua conta Google para visualizar os membros e pagamentos."
    );
    return;
  }

  mostrarMensagem("Carregando membros…");

  try {
    const [dadosRedes, dadosCelulas] = await Promise.all([
  getDocs(collection(db, "redes")),
  getDocs(collection(db, "celulas"))
]);

    if (versao !== versaoLeitura) return;


    nomesRedes = new Map(
      dadosRedes.docs.map((documento) => [
        documento.id, documento.data().nome
      ])
    );

    nomesCelulas = new Map(
      dadosCelulas.docs.map((documento) => [
        documento.id, documento.data().nome
      ])
    );
pararMembros = onSnapshot(
  collection(db, "membros_celula"),
  (resultado) => {
    if (versao !== versaoLeitura) return;

    membros = resultado.docs
      .map((documento) => ({
        ...documento.data(),
        id: documento.id
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    membrosProntos = true;
    carregado = membrosProntos && pagamentosProntos;
    atualizarTabela();
  },
  (erro) => {
    if (versao !== versaoLeitura) return;

    membrosProntos = false;
    carregado = false;
    membros = [];
    atualizarMembrosPagamento();
    limparIndicadores();

    console.error("Erro ao acompanhar membros:", erro);
    mostrarMensagem(
      "Não foi possível atualizar os membros. Recarregue a página."
    );
  }
);
    pararPagamentos = onSnapshot(
  query(
    collection(db, "pagamentos_retiro"),
    where("retiroId", "==", RETIRO_ID)
  ),
  (resultado) => {
    if (versao !== versaoLeitura) return;

    pagamentos = resultado.docs.map((documento) => ({
      ...documento.data(),
      id: documento.id
    }));

    pagamentosProntos = true;
    carregado = membrosProntos && pagamentosProntos;
    atualizarTabela();
  },
  (erro) => {
    if (versao !== versaoLeitura) return;

    pagamentosProntos = false;
    carregado = false;
    pagamentos = [];
    atualizarMembrosPagamento();
    limparIndicadores();

    console.error("Erro ao acompanhar pagamentos:", erro);
    mostrarMensagem(
      "Não foi possível atualizar os pagamentos. Recarregue a página."
    );
  }
);
  } catch (erro) {
    if (versao !== versaoLeitura) return;

    console.error("Erro ao carregar membros:", erro);
    mostrarMensagem("Não foi possível carregar os membros. Recarregue a página.");
  }
});

filtroRede.addEventListener("change", atualizarTabela);
filtroCelula.addEventListener("change", atualizarTabela);
const seletorMembroPagamento =
  document.getElementById("pagamento-membro");

function atualizarMembrosPagamento() {
  const selecionadoAntes = seletorMembroPagamento.value;

  seletorMembroPagamento.replaceChildren();
  seletorMembroPagamento.disabled = true;

  if (!carregado || !filtroRede.value || !filtroCelula.value) {
    seletorMembroPagamento.add(
      new Option("Selecione uma Rede e uma Célula", "")
    );
    return;
  }

  const membrosDaCelula = membros.filter((membro) =>
    membro.ativo !== false &&
    membro.redeId === filtroRede.value &&
    membro.celulaId === filtroCelula.value
  );

  seletorMembroPagamento.add(
    new Option(
      membrosDaCelula.length
        ? "Selecione o membro"
        : "Nenhum membro cadastrado nesta célula",
      ""
    )
  );

  for (const membro of membrosDaCelula) {
    seletorMembroPagamento.add(new Option(membro.nome, membro.id));
  }

  seletorMembroPagamento.disabled = membrosDaCelula.length === 0;

  if (membrosDaCelula.some((membro) => membro.id === selecionadoAntes)) {
    seletorMembroPagamento.value = selecionadoAntes;
  }
}
document.getElementById("btn-fechar-edicao")
  .addEventListener("click", () => {
    document.getElementById("dialog-editar-pagamento").close();
  });

document.getElementById("form-editar-pagamento")
  .addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const usuario = auth.currentUser;
    const original = pagamentoEmEdicao;
    const mensagem = document.getElementById("editar-pagamento-mensagem");
    const botaoSalvar = document.getElementById("btn-salvar-edicao");
    const botaoCancelar = document.getElementById("btn-fechar-edicao");
    const janela = document.getElementById("dialog-editar-pagamento");

    if (salvandoEdicao || !original) return;

if (!autorizadoEditarPagamento(original)) {
  mensagem.textContent =
    "Sua conta não tem autorização para editar pagamentos desta célula.";
  return;
}

    const textoValor =
      document.getElementById("editar-pagamento-valor").value.trim();

    const dataPagamento =
      document.getElementById("editar-pagamento-data").value;

    const metodo =
      document.getElementById("editar-pagamento-metodo").value;

    if (!/^\d+(\.\d{1,2})?$/.test(textoValor)) {
      mensagem.textContent = "Informe um valor com até duas casas decimais.";
      return;
    }

    const [reais, decimais = ""] = textoValor.split(".");
    const valorCentavos =
      Number(reais) * 100 + Number(decimais.padEnd(2, "0"));

    if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
      mensagem.textContent = "Informe um valor válido maior que zero.";
      return;
    }

    const agora = new Date();
    const hoje = [
      agora.getFullYear(),
      String(agora.getMonth() + 1).padStart(2, "0"),
      String(agora.getDate()).padStart(2, "0")
    ].join("-");

    const data = new Date(`${dataPagamento}T12:00:00`);

    const dataValida =
      /^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) &&
      !Number.isNaN(data.getTime()) &&
      data.getFullYear() === Number(dataPagamento.slice(0, 4)) &&
      data.getMonth() + 1 === Number(dataPagamento.slice(5, 7)) &&
      data.getDate() === Number(dataPagamento.slice(8, 10));

    if (!dataValida || dataPagamento > hoje) {
      mensagem.textContent = "Informe uma data de recebimento válida até hoje.";
      return;
    }

    if (!["PIX", "Dinheiro"].includes(metodo)) {
      mensagem.textContent = "Escolha uma forma de pagamento válida.";
      return;
    }

    const contexto =
      document.getElementById("editar-pagamento-contexto").textContent;

    if (!confirm(
      `Salvar alterações neste pagamento?\n\n${contexto}\n\n` +
      `Valor: ${formatarDinheiro(original.valorCentavos)} → ` +
      `${formatarDinheiro(valorCentavos)}\n` +
      `Recebido em: ${dataPagamento.split("-").reverse().join("/")}\n` +
      `Forma: ${metodo}`
    )) return;

    salvandoEdicao = true;
    botaoSalvar.disabled = true;
    botaoCancelar.disabled = true;
    mensagem.textContent = "Salvando alterações…";

    try {
      await runTransaction(db, async (transacao) => {
  if (
    auth.currentUser?.uid !== usuario.uid ||
    !autorizadoEditarPagamento(original)
  ) {
    throw new Error(
      "A conta ou a autorização mudou. Recarregue a página."
    );
  }

  const referencia = doc(db, "pagamentos_retiro", original.id);
        const resultado = await transacao.get(referencia);

        if (!resultado.exists()) {
          throw new Error("Esse pagamento não existe mais.");
        }

        const atual = resultado.data();

        const mudou =
          atual.retiroId !== original.retiroId ||
          atual.membroId !== original.membroId ||
          atual.redeId !== original.redeId ||
          atual.celulaId !== original.celulaId ||
          atual.valorCentavos !== original.valorCentavos ||
          atual.metodo !== original.metodo ||
          (atual.dataPagamento || "") !== (original.dataPagamento || "") ||
          (atual.atualizadoEm?.toMillis() || 0) !==
            (original.atualizadoEm?.toMillis() || 0);

        if (mudou) {
          throw new Error(
            "O pagamento mudou durante a edição. Cancele e abra novamente."
          );
        }

        transacao.update(referencia, {
          valorCentavos,
          dataPagamento,
          metodo,
          atualizadoEm: serverTimestamp(),
          atualizadoPor: usuario.uid
        });
      });

      janela.close();
      pagamentoEmEdicao = null;
    } catch (erro) {
      console.error("Erro ao editar pagamento:", erro);
      mensagem.textContent = `Não foi possível salvar: ${erro.message}`;
    } finally {
      salvandoEdicao = false;
      botaoSalvar.disabled =
  !autorizadoEditarPagamento(pagamentoEmEdicao);
      botaoCancelar.disabled = false;
    }
  });

document.getElementById("dialog-editar-pagamento")
  .addEventListener("cancel", (evento) => {
    if (salvandoEdicao) evento.preventDefault();
  });

  document.getElementById("btn-fechar-membro-edicao")
  .addEventListener("click", () => {
    if (salvandoNomeMembro) return;

    document.getElementById("dialog-editar-membro").close();
  });

document.getElementById("dialog-editar-membro")
  .addEventListener("close", () => {
    membroEmEdicao = null;
  });

document.getElementById("dialog-editar-membro")
  .addEventListener("cancel", (evento) => {
    if (salvandoNomeMembro) evento.preventDefault();
  });

document.getElementById("form-editar-membro")
  .addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const usuario = auth.currentUser;
    const original = membroEmEdicao;
    const janela = document.getElementById("dialog-editar-membro");
    const campoNome = document.getElementById("editar-membro-nome");
    const mensagem = document.getElementById("editar-membro-mensagem");
    const botaoSalvar = document.getElementById("btn-salvar-membro-edicao");
    const botaoCancelar = document.getElementById("btn-fechar-membro-edicao");

    if (salvandoNomeMembro || !original) return;

    if (!autorizadoEditarMembro(original)) {
      mensagem.textContent =
        "Sua conta não tem autorização para editar este membro.";
      return;
    }

    const nome = campoNome.value.trim().replace(/\s+/g, " ");

    if (!nome || nome.length > 120) {
      mensagem.textContent =
        "Informe um nome válido, com até 120 caracteres.";
      return;
    }

    if (nome === original.nome) {
      mensagem.textContent = "O nome permanece igual. Nada foi alterado.";
      return;
    }

    const contexto =
      document.getElementById("editar-membro-contexto").textContent;

    if (!confirm(
      `ALTERAR NOME DO MEMBRO?\n\n` +
      `${contexto}\n\n` +
      `Nome atual: ${original.nome}\n` +
      `Novo nome: ${nome}\n\n` +
      `Os pagamentos e o histórico serão preservados.`
    )) return;

    const versao = versaoPermissoesTabela;

    salvandoNomeMembro = true;
    campoNome.disabled = true;
    botaoSalvar.disabled = true;
    botaoCancelar.disabled = true;
    mensagem.textContent = "Salvando nome…";

    try {
      await runTransaction(db, async (transacao) => {
        if (
          versao !== versaoPermissoesTabela ||
          auth.currentUser?.uid !== usuario.uid ||
          !autorizadoEditarMembro(original)
        ) {
          throw new Error(
            "A conta ou autorização mudou. Recarregue a página."
          );
        }

        const referencia = doc(db, "membros_celula", original.id);
        const resultado = await transacao.get(referencia);

        if (!resultado.exists()) {
          throw new Error("Este membro não está mais cadastrado.");
        }

        const atual = resultado.data();

        const mudou =
          atual.nome !== original.nome ||
          atual.redeId !== original.redeId ||
          atual.celulaId !== original.celulaId ||
          atual.ativo !== original.ativo ||
          (atual.atualizadoEm?.toMillis() || 0) !==
            (original.atualizadoEm?.toMillis() || 0);

        if (mudou) {
          throw new Error(
            "O cadastro mudou durante a edição. Cancele e abra novamente."
          );
        }

        if (atual.ativo === false) {
          throw new Error("Este membro está inativo.");
        }

        transacao.update(referencia, {
          nome,
          atualizadoEm: serverTimestamp(),
          atualizadoPor: usuario.uid
        });
      });

      if (
        versao === versaoPermissoesTabela &&
        auth.currentUser?.uid === usuario.uid
      ) {
        janela.close();
      }
    } catch (erro) {
      console.error("Erro ao editar nome:", erro);

      if (
        versao === versaoPermissoesTabela &&
        auth.currentUser?.uid === usuario.uid
      ) {
        mensagem.textContent =
          `Não foi possível salvar: ${erro.message}`;
      }
    } finally {
      salvandoNomeMembro = false;
      campoNome.disabled = false;
      botaoCancelar.disabled = false;
      botaoSalvar.disabled =
        !autorizadoEditarMembro(membroEmEdicao);
    }
  });