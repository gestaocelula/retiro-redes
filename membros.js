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
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


const form = document.getElementById("form-membro");
const campoNome = document.getElementById("novo-membro-nome");
const botao = document.getElementById("btn-cadastrar-membro");
const destino = document.getElementById("destino-membro");
const mensagem = document.getElementById("membro-mensagem");
const rede = document.getElementById("filtro-rede");
const celula = document.getElementById("filtro-celula");

let salvandoMembro = false;
let permissoesMembro = null;
let versaoPermissoesMembro = 0;

function autorizadoNaCelula(celulaId) {
  const usuario = auth.currentUser;

  return Boolean(
    usuario &&
    permissoesMembro?.uid === usuario.uid &&
    podeEditarCelula(permissoesMembro, celulaId)
  );
}

function atualizarFormulario() {
  const selecionado = Boolean(rede.value && celula.value);
  const autorizado = autorizadoNaCelula(celula.value);

  botao.disabled = salvandoMembro || !selecionado || !autorizado;
  botao.setAttribute("aria-disabled", String(botao.disabled));

  if (!selecionado) {
    destino.textContent =
      "Selecione uma Rede e uma Célula nos filtros acima.";
    return;
  }

  destino.textContent =
    `Destino: ${rede.selectedOptions[0].textContent} — ` +
    `${celula.selectedOptions[0].textContent}`;

  if (!autorizado) {
    destino.textContent +=
      " — Cadastro indisponível para sua conta nesta célula.";
  }
}

onAuthStateChanged(auth, async (usuario) => {
  const versao = ++versaoPermissoesMembro;

  permissoesMembro = null;
  mensagem.textContent = "";
  atualizarFormulario();

  if (!usuario) return;

  try {
    const permissoes = await carregarPermissoes(usuario);

    if (
      versao !== versaoPermissoesMembro ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    permissoesMembro = permissoes;
    atualizarFormulario();
  } catch (erro) {
    if (
      versao !== versaoPermissoesMembro ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    console.error("Erro ao carregar permissões de membros:", erro);

    mensagem.textContent =
      "Não foi possível consultar sua autorização de cadastro.";
  }
});

rede.addEventListener("change", atualizarFormulario);
celula.addEventListener("change", atualizarFormulario);

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const usuario = auth.currentUser;
  const redeId = rede.value;
  const celulaId = celula.value;
  const nome = campoNome.value.trim().replace(/\s+/g, " ");

  if (salvandoMembro) return;

if (!usuario) {
  mensagem.textContent =
    "Entre com sua conta Google para cadastrar membros.";
  return;
}

if (
  redeId &&
  celulaId &&
  !autorizadoNaCelula(celulaId)
) {
  mensagem.textContent =
    "Sua conta não tem autorização para cadastrar nesta célula.";
  return;
}

  if (!redeId || !celulaId) {
    mensagem.textContent = "Escolha uma Rede e uma Célula específicas.";
    return;
  }

  if (!nome || nome.length > 120) {
    mensagem.textContent = "Informe um nome válido, com até 120 caracteres.";
    return;
  }

  const nomeRede = rede.selectedOptions[0].textContent;
  const nomeCelula = celula.selectedOptions[0].textContent;

  if (!confirm(
    `Cadastrar este membro?\n\n` +
    `Nome: ${nome}\nRede: ${nomeRede}\nCélula: ${nomeCelula}`
  )) return;

  salvandoMembro = true;
  campoNome.disabled = true;
  atualizarFormulario();
  mensagem.textContent = "Salvando membro…";

  // O identificador representa a pessoa, independentemente do nome.
  const referenciaMembro = doc(collection(db, "membros_celula"));

  try {
    await runTransaction(db, async (transacao) => {
      const dadosRede = await transacao.get(doc(db, "redes", redeId));
      const dadosCelula = await transacao.get(doc(db, "celulas", celulaId));

      if (!dadosRede.exists() || dadosRede.data().ativa !== true) {
        throw new Error("A Rede não existe ou está inativa.");
      }

      if (
        !dadosCelula.exists() ||
        dadosCelula.data().ativa !== true ||
        dadosCelula.data().redeId !== redeId
      ) {
        throw new Error("A Célula está indisponível ou pertence a outra Rede.");
      }

      transacao.set(referenciaMembro, {
        nome,
        redeId,
        celulaId,
        ativo: true,
        criadoEm: serverTimestamp(),
        criadoPor: usuario.uid
      });
    });

    form.reset();
    mensagem.textContent =
      `${nome} cadastrado em ${nomeRede} — ${nomeCelula}.`;
  } catch (erro) {
    console.error("Erro ao cadastrar membro:", erro);
    mensagem.textContent = `Não foi possível cadastrar: ${erro.message}`;
  } finally {
    salvandoMembro = false;
    campoNome.disabled = false;
    atualizarFormulario();
  }
});

atualizarFormulario();