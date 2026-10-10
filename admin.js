import { auth, db } from "./firebase-config.js";

import {
  carregarPermissoes,
  podeCadastrarNaRede
} from "./permissoes.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const ADMIN_UID = "kVdR1Q1tsOVm5cYDN8tHrshCsIJ3";

const formRede = document.getElementById("form-rede");
// Troque para true quando precisar cadastrar novas redes.
const PERMITIR_CADASTRO_REDES = false;

formRede.classList.toggle("hidden", !PERMITIR_CADASTRO_REDES);
const campoNome = document.getElementById("nova-rede-nome");
const botaoRede = document.getElementById("btn-cadastrar-rede");
const mensagem = document.getElementById("admin-mensagem");

let salvando = false;

function atualizarBotao() {
  botaoRede.disabled =
    salvando || auth.currentUser?.uid !== ADMIN_UID;
}

onAuthStateChanged(auth, () => {
  atualizarBotao();
  mensagem.textContent = "";
});

formRede.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!PERMITIR_CADASTRO_REDES) return;

  const usuario = auth.currentUser;

  if (salvando || usuario?.uid !== ADMIN_UID) return;

  const nome = campoNome.value.trim().replace(/\s+/g, " ");

  const redeId = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!redeId || nome.length > 80) {
    mensagem.textContent = "Informe um nome válido para a Rede.";
    return;
  }

  if (!confirm(`Deseja cadastrar a Rede "${nome}"?`)) return;

  salvando = true;
  atualizarBotao();
  campoNome.disabled = true;
  mensagem.textContent = "Salvando Rede…";

  try {
    const referencia = doc(db, "redes", redeId);

    await runTransaction(db, async (transacao) => {
      const existente = await transacao.get(referencia);

      if (existente.exists()) {
        throw new Error("Essa Rede já está cadastrada.");
      }

      transacao.set(referencia, {
        nome,
        ativa: true,
        criadoEm: serverTimestamp(),
        criadoPor: usuario.uid
      });
    });

    mensagem.textContent = `Rede "${nome}" cadastrada com sucesso.`;
    formRede.reset();
  } catch (erro) {
    console.error("Erro ao cadastrar Rede:", erro);
    mensagem.textContent = `Não foi possível cadastrar: ${erro.message}`;
  } finally {
    salvando = false;
    campoNome.disabled = false;
    atualizarBotao();
  }
});

const formCelulas = document.getElementById("form-celulas-lote");
const campoRedeCelulas = document.getElementById("cadastro-celulas-rede");
const campoCodigosCelulas = document.getElementById("novas-celulas");
const botaoCelulas = document.getElementById("btn-cadastrar-celulas");

let permissoesCadastro = null;
let versaoPermissoesCadastro = 0;

function atualizarBotaoCelulas() {
  botaoCelulas.disabled =
    salvando ||
    auth.currentUser?.uid !== permissoesCadastro?.uid ||
    !podeCadastrarNaRede(
      permissoesCadastro,
      campoRedeCelulas.value
    );
}

campoRedeCelulas.addEventListener(
  "change",
  atualizarBotaoCelulas
);

onAuthStateChanged(auth, async (usuario) => {
  const versao = ++versaoPermissoesCadastro;

  permissoesCadastro = null;
  atualizarBotaoCelulas();

  if (!usuario) return;

  try {
    const permissoes = await carregarPermissoes(usuario);

    if (
      versao !== versaoPermissoesCadastro ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    permissoesCadastro = permissoes;
    atualizarBotaoCelulas();

    console.log(
      "Permissões de cadastro carregadas:",
      permissoesCadastro
    );
  } catch (erro) {
    if (versao !== versaoPermissoesCadastro) return;

    console.error("Erro ao carregar permissões:", erro);
    mensagem.textContent =
      "Não foi possível consultar a autorização de cadastro.";
  }
});

formCelulas.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (salvando) return;

  const usuario = auth.currentUser;
  const redeId = campoRedeCelulas.value;

  if (
    !usuario ||
    usuario.uid !== permissoesCadastro?.uid
  ) {
    mensagem.textContent =
      "Entre com uma conta autorizada para cadastrar células.";
    return;
  }

  if (!redeId) {
    mensagem.textContent =
      "Selecione a Rede que receberá as células.";
    return;
  }

  if (!podeCadastrarNaRede(permissoesCadastro, redeId)) {
    mensagem.textContent =
      "Você não tem autorização para cadastrar células nessa Rede.";
    return;
  }

  const nomeRede = campoRedeCelulas.selectedOptions[0].textContent;

  const codigos = [...new Set(
    campoCodigosCelulas.value
      .toUpperCase()
      .split(/[,\n;]+/)
      .map((codigo) => codigo.trim())
      .filter(Boolean)
  )];

  if (codigos.length === 0) {
    mensagem.textContent = "Informe pelo menos um código de célula.";
    return;
  }

  if (codigos.length > 100) {
    mensagem.textContent = "Cadastre no máximo 100 células por vez.";
    return;
  }

  const invalidos = codigos.filter(
    (codigo) => !/^[A-Z][A-Z0-9-]{0,19}$/.test(codigo)
  );

  if (invalidos.length > 0) {
    mensagem.textContent =
      `Confira estes códigos: ${invalidos.join(", ")}. ` +
      "Use letras, números ou hífen, sem espaços.";
    return;
  }

  const confirmou = confirm(
    `CONFIRME A REDE DE DESTINO\n\n` +
    `Rede: ${nomeRede}\n` +
    `Quantidade: ${codigos.length} células\n\n` +
    `Códigos: ${codigos.join(", ")}\n\n` +
    `Essas células pertencem à ${nomeRede}?`
  );

    if (!confirmou) {
    mensagem.textContent = "Ação cancelada. Nenhuma célula foi cadastrada.";
    return;
  }

  

  salvando = true;
  atualizarBotao();
  botaoCelulas.disabled = true;
  campoRedeCelulas.disabled = true;
  campoCodigosCelulas.disabled = true;
  mensagem.textContent = `Salvando células na ${nomeRede}…`;

  try {
    const totalCriadas = await runTransaction(db, async (transacao) => {
      const referenciaRede = doc(db, "redes", redeId);
      const rede = await transacao.get(referenciaRede);

      if (!rede.exists() || rede.data().ativa !== true) {
        throw new Error("A Rede selecionada não existe ou está inativa.");
      }

      const referencias = codigos.map((codigo) =>
        doc(db, "celulas", `${redeId}_${codigo.toLowerCase()}`)
      );

      // Primeiro lemos todas; depois fazemos as gravações.
      const existentes = await Promise.all(
        referencias.map((referencia) => transacao.get(referencia))
      );

      let criadas = 0;

      for (let i = 0; i < codigos.length; i++) {
        if (existentes[i].exists()) continue;

        const codigo = codigos[i];

        transacao.set(referencias[i], {
          codigo,
          nome: /^R\d+$/.test(codigo)
  ? `Refúgio ${codigo.slice(1)}`
  : codigo,
          redeId,
          ativa: true,
          criadoEm: serverTimestamp(),
          criadoPor: usuario.uid
        });

        criadas++;
      }

      return criadas;
    });

    const preservadas = codigos.length - totalCriadas;

    mensagem.textContent =
      `${nomeRede}: ${totalCriadas} célula(s) cadastrada(s). ` +
      `${preservadas} já existente(s), preservada(s). ` +
      "Recarregue a página para atualizar os seletores.";

    campoCodigosCelulas.value = "";
  } catch (erro) {
    console.error("Erro ao cadastrar células:", erro);
    mensagem.textContent = `Não foi possível cadastrar: ${erro.message}`;
  } finally {
    salvando = false;
    atualizarBotao();
        atualizarBotaoCelulas();
    campoRedeCelulas.disabled = false;
    campoCodigosCelulas.disabled = false;
  }
});
const seletorStatusRede = document.getElementById("rede-alterar-status");
const botaoStatusRede = document.getElementById("btn-alterar-status-rede");

let redesStatus = new Map();
let pararStatusRedes = null;
let alterandoStatusRede = false;
let versaoStatusRedes = 0;

function atualizarBotaoStatusRede() {
  const redeSelecionada = redesStatus.get(seletorStatusRede.value);
  const autorizado = auth.currentUser?.uid === ADMIN_UID;

  seletorStatusRede.disabled =
    !autorizado || alterandoStatusRede || redesStatus.size === 0;

  botaoStatusRede.disabled =
    !autorizado || alterandoStatusRede || !redeSelecionada;

  botaoStatusRede.textContent = redeSelecionada
    ? `${redeSelecionada.ativa ? "Desativar" : "Reativar"} ${redeSelecionada.nome}`
    : "Selecione uma Rede";
}

onAuthStateChanged(auth, (usuario) => {
  const versao = ++versaoStatusRedes;

  if (pararStatusRedes) {
    pararStatusRedes();
    pararStatusRedes = null;
  }

  redesStatus.clear();
  seletorStatusRede.replaceChildren(
    new Option("Selecione a Rede", "")
  );
  atualizarBotaoStatusRede();

  if (usuario?.uid !== ADMIN_UID) return;

  pararStatusRedes = onSnapshot(
    collection(db, "redes"),
    (resultado) => {
      if (versao !== versaoStatusRedes) return;

      const selecionadaAntes = seletorStatusRede.value;

      const redes = resultado.docs
        .map((documento) => ({
          ...documento.data(),
          id: documento.id
        }))
        .sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })
        );

      redesStatus = new Map(redes.map((rede) => [rede.id, rede]));

      seletorStatusRede.replaceChildren(
        new Option("Selecione a Rede", "")
      );

      for (const rede of redes) {
        seletorStatusRede.add(new Option(
          `${rede.nome} — ${rede.ativa === true ? "Ativa" : "Inativa"}`,
          rede.id
        ));
      }

      if (redesStatus.has(selecionadaAntes)) {
        seletorStatusRede.value = selecionadaAntes;
      }

      atualizarBotaoStatusRede();
    },
    (erro) => {
      if (versao !== versaoStatusRedes) return;

      redesStatus.clear();
      atualizarBotaoStatusRede();
      console.error("Erro ao carregar status das redes:", erro);
      mensagem.textContent = "Não foi possível carregar as redes.";
    }
  );
});

seletorStatusRede.addEventListener("change", atualizarBotaoStatusRede);

botaoStatusRede.addEventListener("click", async () => {
  const usuario = auth.currentUser;
  const rede = redesStatus.get(seletorStatusRede.value);

  if (
    usuario?.uid !== ADMIN_UID ||
    alterandoStatusRede ||
    !rede
  ) return;

  const estavaAtiva = rede.ativa === true;
  const novaSituacao = !estavaAtiva;
  const acao = estavaAtiva ? "desativar" : "reativar";

  if (!confirm(
    `Deseja ${acao} a ${rede.nome}?\n\n` +
    (estavaAtiva
      ? "Novos cadastros e pagamentos serão bloqueados nessa Rede.\n"
      : "Novos cadastros e pagamentos serão permitidos nessa Rede.\n") +
    "Os membros e pagamentos existentes serão preservados."
  )) return;

  alterandoStatusRede = true;
  atualizarBotaoStatusRede();
  mensagem.textContent = `Alterando ${rede.nome}…`;

  try {
    await runTransaction(db, async (transacao) => {
      const referencia = doc(db, "redes", rede.id);
      const atual = await transacao.get(referencia);

      if (
        !atual.exists() ||
        (atual.data().ativa === true) !== estavaAtiva ||
        atual.data().nome !== rede.nome
      ) {
        throw new Error("A Rede mudou. Confira a lista e tente novamente.");
      }

      transacao.update(referencia, {
        ativa: novaSituacao,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: usuario.uid
      });
    });

    mensagem.textContent =
      `${rede.nome} ${novaSituacao ? "reativada" : "desativada"}. ` +
      "Recarregue a página para atualizar os filtros.";
  } catch (erro) {
    console.error("Erro ao alterar Rede:", erro);
    mensagem.textContent = `Não foi possível alterar: ${erro.message}`;
  } finally {
    alterandoStatusRede = false;
    atualizarBotaoStatusRede();
  }
});
// Habilite somente quando precisar gerenciar as redes.
const EXIBIR_GESTAO_REDES = false;

const painelStatusRedes =
  document.getElementById("gestao-status-redes");

onAuthStateChanged(auth, (usuario) => {
  const podeExibir =
    EXIBIR_GESTAO_REDES && usuario?.uid === ADMIN_UID;

  painelStatusRedes.classList.toggle("hidden", !podeExibir);
});