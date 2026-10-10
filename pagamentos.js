import { auth, db } from "./firebase-config.js";

import {
  carregarPermissoes,
  podeEditarCelula
} from "./permissoes.js";

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";



const formPagamento = document.getElementById("form-pagamento");
const membroPagamento = document.getElementById("pagamento-membro");
const redePagamento = document.getElementById("filtro-rede");
const celulaPagamento = document.getElementById("filtro-celula");
const valorPagamento = document.getElementById("valor");
const metodoPagamento = document.getElementById("metodo");
const botaoPagamento = document.getElementById("btn-submit-pagamento");
const mensagemPagamento = document.getElementById("pagamento-mensagem");
const campoDataPagamento = document.getElementById("data-pagamento");

function dataLocalHoje() {
  const agora = new Date();

  return [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, "0"),
    String(agora.getDate()).padStart(2, "0")
  ].join("-");
}

campoDataPagamento.value = dataLocalHoje();
campoDataPagamento.max = dataLocalHoje();

let salvandoPagamento = false;
let permissoesPagamento = null;
let versaoPermissoesPagamento = 0;

function autorizadoParaPagamento(celulaId) {
  const usuario = auth.currentUser;

  return Boolean(
    usuario &&
    permissoesPagamento?.uid === usuario.uid &&
    podeEditarCelula(permissoesPagamento, celulaId)
  );
}

// Identificador deste retiro, usado para separar futuros eventos.
const RETIRO_ID = "retiro_principal";

function atualizarBotaoPagamento() {
  const autorizado =
  autorizadoParaPagamento(celulaPagamento.value);
  const selecionado = Boolean(
    redePagamento.value &&
    celulaPagamento.value &&
    membroPagamento.value &&
    !membroPagamento.disabled
  );

  botaoPagamento.disabled =
  salvandoPagamento || !autorizado || !selecionado;
  botaoPagamento.setAttribute(
    "aria-disabled",
    String(botaoPagamento.disabled)
  );
}

onAuthStateChanged(auth, async (usuario) => {
  const versao = ++versaoPermissoesPagamento;

  permissoesPagamento = null;
  mensagemPagamento.textContent = "";
  atualizarBotaoPagamento();

  if (!usuario) return;

  try {
    const permissoes = await carregarPermissoes(usuario);

    if (
      versao !== versaoPermissoesPagamento ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    permissoesPagamento = permissoes;
    atualizarBotaoPagamento();
  } catch (erro) {
    if (
      versao !== versaoPermissoesPagamento ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    console.error("Erro ao carregar permissões de pagamentos:", erro);

    mensagemPagamento.textContent =
      "Não foi possível consultar sua autorização para registrar pagamentos.";
  }
});

redePagamento.addEventListener("change", atualizarBotaoPagamento);
celulaPagamento.addEventListener("change", atualizarBotaoPagamento);
membroPagamento.addEventListener("change", atualizarBotaoPagamento);

formPagamento.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (salvandoPagamento) return;

if (!auth.currentUser) {
  mensagemPagamento.textContent =
    "Entre com sua conta Google para registrar pagamentos.";
  return;
}

  if (
    !redePagamento.value ||
    !celulaPagamento.value ||
    !membroPagamento.value ||
    membroPagamento.disabled
  ) {
    mensagemPagamento.textContent = "Selecione a Rede, a Célula e o membro.";
    return;
  }

  if (!autorizadoParaPagamento(celulaPagamento.value)) {
  mensagemPagamento.textContent =
    "Sua conta não tem autorização para registrar pagamentos nesta célula.";
  return;
}

  // Converte o valor para centavos inteiros.
  const textoValor = valorPagamento.value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(textoValor)) {
    mensagemPagamento.textContent =
      "Informe um valor positivo com até duas casas decimais.";
    return;
  }

  const [reais, decimais = ""] = textoValor.split(".");
  const valorCentavos =
    Number(reais) * 100 + Number(decimais.padEnd(2, "0"));

  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    mensagemPagamento.textContent = "Informe um valor válido maior que zero.";
    return;
  }

  if (!["PIX", "Dinheiro"].includes(metodoPagamento.value)) {
    mensagemPagamento.textContent = "Escolha uma forma de pagamento válida.";
    return;
  }

  const dataPagamento = campoDataPagamento.value;
const dataConferida = new Date(`${dataPagamento}T12:00:00`);

const dataValida =
  /^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) &&
  !Number.isNaN(dataConferida.getTime()) &&
  dataConferida.getFullYear() === Number(dataPagamento.slice(0, 4)) &&
  dataConferida.getMonth() + 1 === Number(dataPagamento.slice(5, 7)) &&
  dataConferida.getDate() === Number(dataPagamento.slice(8, 10));

if (!dataValida || dataPagamento > dataLocalHoje()) {
  mensagemPagamento.textContent =
    "Informe a data em que recebeu o pagamento, até a data de hoje.";
  return;
}

const dataPagamentoFormatada =
  dataPagamento.split("-").reverse().join("/");
  const nomeMembro = membroPagamento.selectedOptions[0].textContent;
  const nomeRede = redePagamento.selectedOptions[0].textContent;
  const nomeCelula = celulaPagamento.selectedOptions[0].textContent;

  const valorFormatado = (valorCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  const confirmou = confirm(
    `CONFIRME O PAGAMENTO\n\n` +
    `Membro: ${nomeMembro}\n` +
    `Rede: ${nomeRede}\n` +
    `Célula: ${nomeCelula}\n` +
    `Valor: ${valorFormatado}\n` +
`Recebido em: ${dataPagamentoFormatada}\n` +
`Forma: ${metodoPagamento.value}`
  );

   if (!confirmou) {
    mensagemPagamento.textContent = "Pagamento cancelado. Nada foi salvo.";
    return;
  }

  const usuario = auth.currentUser;
  const membroId = membroPagamento.value;
  const redeId = redePagamento.value;
  const celulaId = celulaPagamento.value;
  const metodo = metodoPagamento.value;
  const campoWhatsapp = document.getElementById("whatsapp");
  const whatsapp = campoWhatsapp.value.replace(/\D/g, "");

  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) {
    mensagemPagamento.textContent =
      "Confira o WhatsApp: informe o DDD e o número.";
    return;
  }

  const referenciaPagamento =
    doc(collection(db, "pagamentos_retiro"));

  salvandoPagamento = true;
  atualizarBotaoPagamento();
  mensagemPagamento.textContent = "Salvando pagamento…";

  try {
    await runTransaction(db, async (transacao) => {
      const dadosMembro = await transacao.get(
        doc(db, "membros_celula", membroId)
      );

      const dadosRede = await transacao.get(
        doc(db, "redes", redeId)
      );

      const dadosCelula = await transacao.get(
        doc(db, "celulas", celulaId)
      );

      if (!dadosRede.exists() || dadosRede.data().ativa !== true) {
        throw new Error("A Rede está indisponível.");
      }

      if (
        !dadosCelula.exists() ||
        dadosCelula.data().ativa !== true ||
        dadosCelula.data().redeId !== redeId
      ) {
        throw new Error("A Célula está indisponível ou pertence a outra Rede.");
      }

      if (!dadosMembro.exists()) {
        throw new Error("O membro não está mais cadastrado.");
      }

      const membro = dadosMembro.data();

      if (
        membro.ativo === false ||
        membro.redeId !== redeId ||
        membro.celulaId !== celulaId ||
        membro.nome !== nomeMembro
      ) {
        throw new Error(
          "O cadastro do membro mudou. Recarregue e confira a seleção."
        );
      }

            transacao.set(referenciaPagamento, {
        retiroId: RETIRO_ID,
        membroId,
        redeId,
        celulaId,
        valorCentavos,
        metodo,
        dataPagamento,
        criadoEm: serverTimestamp(),
        criadoPor: usuario.uid
      });

      // Guarda o telefone separado dos dados financeiros.
      if (whatsapp) {
        const referenciaContato = doc(
          db,
          "contatos_pagamentos",
          referenciaPagamento.id
        );

        transacao.set(referenciaContato, {
          pagamentoId: referenciaPagamento.id,
          retiroId: RETIRO_ID,
          membroId,
          redeId,
          celulaId,
          whatsapp,
          criadoEm: serverTimestamp(),
          criadoPor: usuario.uid
        });
      }
    });

    // Limpa os campos somente se ainda estiverem com os dados enviados.
    if (valorPagamento.value.trim() === textoValor) {
      valorPagamento.value = "";
    }

    if (campoWhatsapp.value.replace(/\D/g, "") === whatsapp) {
      campoWhatsapp.value = "";
    }

    mensagemPagamento.textContent =
      `Pagamento de ${valorFormatado} salvo para ${nomeMembro} ` +
      `em ${nomeRede} — ${nomeCelula}.`;
  } catch (erro) {
    console.error("Erro ao salvar pagamento:", erro);
    mensagemPagamento.textContent =
      `Não foi possível salvar: ${erro.message}`;
  } finally {
    salvandoPagamento = false;
    atualizarBotaoPagamento();
  }
});

atualizarBotaoPagamento();