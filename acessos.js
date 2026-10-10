import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const ADMIN_UID = "kVdR1Q1tsOVm5cYDN8tHrshCsIJ3";

const painelAcessos = document.getElementById("painel-acessos");
const formAcessos = document.getElementById("form-acessos");
const campoUsuarioAcesso = document.getElementById("acesso-usuario");
const mensagemAcesso = document.getElementById("acesso-mensagem");
const campoRedeAcesso = document.getElementById("acesso-rede");
const listaCelulasAcesso = document.getElementById("acesso-celulas");

const caixaCadastrarCelulas =
  document.getElementById("acesso-cadastrar-celulas");

let versaoAcessos = 0;
let versaoPerfilAcesso = 0;
let celulasAcesso = [];
let usuarioAcessoCarregado = "";
let celulasMarcadas = new Set();
let redeCadastroAutorizada = "";

const botaoSalvarAcesso =
  document.getElementById("btn-salvar-acesso");
  const botaoRevogarAcesso =
  document.getElementById("btn-revogar-acesso");

let salvandoAcesso = false;

function atualizarBotaoSalvarAcesso() {
  const bloqueado =
    salvandoAcesso ||
    auth.currentUser?.uid !== ADMIN_UID ||
    !usuarioAcessoCarregado ||
    usuarioAcessoCarregado === ADMIN_UID ||
    usuarioAcessoCarregado !== campoUsuarioAcesso.value;

  botaoSalvarAcesso.disabled =
    bloqueado || !campoRedeAcesso.value;

  botaoRevogarAcesso.disabled = bloqueado;
}

campoRedeAcesso.addEventListener(
  "change",
  atualizarBotaoSalvarAcesso
);

function atualizarCaixaCadastroCelulas() {
  caixaCadastrarCelulas.disabled =
    !usuarioAcessoCarregado || !campoRedeAcesso.value;

  caixaCadastrarCelulas.checked = Boolean(
    campoRedeAcesso.value &&
    redeCadastroAutorizada === campoRedeAcesso.value
  );
}

function mostrarCelulasAcesso() {
  listaCelulasAcesso.replaceChildren();

  if (!campoRedeAcesso.value) {
    listaCelulasAcesso.textContent =
      "Selecione uma Rede para listar as células.";
    return;
  }

  const celulasDaRede = celulasAcesso
    .filter((celula) =>
      celula.redeId === campoRedeAcesso.value &&
      celula.ativa === true
    )
    .sort((a, b) =>
      (a.nome || a.id).localeCompare(
        b.nome || b.id,
        "pt-BR",
        { numeric: true }
      )
    );

  if (!celulasDaRede.length) {
    listaCelulasAcesso.textContent =
      "Esta Rede ainda não possui células ativas.";
    return;
  }

  for (const celula of celulasDaRede) {
    const linha = document.createElement("label");
    linha.className = "flex items-center gap-2 text-white";

    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    caixa.name = "celulas-autorizadas";
    caixa.value = celula.id;
    caixa.className = "h-4 w-4";
    caixa.checked = celulasMarcadas.has(celula.id);
caixa.disabled = !usuarioAcessoCarregado;

caixa.addEventListener("change", () => {
  if (caixa.checked) {
    celulasMarcadas.add(celula.id);
  } else {
    celulasMarcadas.delete(celula.id);
  }
});

    const nome = document.createElement("span");
    nome.textContent = celula.nome || celula.id;

    linha.append(caixa, nome);
    listaCelulasAcesso.append(linha);
  }
}

campoRedeAcesso.addEventListener("change", () => {
  mostrarCelulasAcesso();
  atualizarCaixaCadastroCelulas();
});

caixaCadastrarCelulas.addEventListener("change", () => {
  if (!usuarioAcessoCarregado || !campoRedeAcesso.value) return;

  if (caixaCadastrarCelulas.checked) {
    redeCadastroAutorizada = campoRedeAcesso.value;
  } else if (redeCadastroAutorizada === campoRedeAcesso.value) {
    redeCadastroAutorizada = "";
  }
});

campoUsuarioAcesso.addEventListener("change", async () => {
  const versao = ++versaoPerfilAcesso;
  const usuarioId = campoUsuarioAcesso.value;

  usuarioAcessoCarregado = "";
  celulasMarcadas = new Set();
  redeCadastroAutorizada = "";

  mostrarCelulasAcesso();
  atualizarCaixaCadastroCelulas();
  mensagemAcesso.textContent = "";

  if (!usuarioId || auth.currentUser?.uid !== ADMIN_UID) return;

  mensagemAcesso.textContent = "Consultando autorizações…";

  try {
    const resultado = await getDoc(
      doc(db, "usuarios", usuarioId)
    );

    if (
      versao !== versaoPerfilAcesso ||
      auth.currentUser?.uid !== ADMIN_UID ||
      campoUsuarioAcesso.value !== usuarioId
    ) {
      return;
    }

    const perfil = resultado.exists() ? resultado.data() : {};
    const ativo = perfil.ativo === true;

    celulasMarcadas = new Set(
      ativo && Array.isArray(perfil.celulasEditaveis)
        ? perfil.celulasEditaveis.filter(
            (id) => typeof id === "string" && id !== ""
          )
        : []
    );

    redeCadastroAutorizada =
      ativo && perfil.podeCadastrarCelulas === true
        ? perfil.redeId || ""
        : "";

    const redeExiste = Array.from(campoRedeAcesso.options)
      .some((opcao) => opcao.value === perfil.redeId);

    campoRedeAcesso.value = redeExiste ? perfil.redeId : "";
    usuarioAcessoCarregado = usuarioId;
    atualizarBotaoSalvarAcesso();

    mostrarCelulasAcesso();
    atualizarCaixaCadastroCelulas();

    mensagemAcesso.textContent = ativo
      ? "Autorizações carregadas. As marcações ainda não foram salvas."
      : "Esta pessoa não possui autorização ativa. Selecione a Rede e as células.";
  } catch (erro) {
    if (
      versao !== versaoPerfilAcesso ||
      auth.currentUser?.uid !== ADMIN_UID
    ) {
      return;
    }

    console.error("Erro ao consultar autorizações:", erro);
    mensagemAcesso.textContent =
      "Não foi possível consultar as autorizações desta pessoa.";
  }
});

formAcessos.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (salvandoAcesso || auth.currentUser?.uid !== ADMIN_UID) return;

  const usuarioId = usuarioAcessoCarregado;
  const idsCelulas = [...celulasMarcadas];
  const permiteCadastro = Boolean(redeCadastroAutorizada);

  // A autorização de cadastrar células pertence a uma única Rede.
  const redePerfil = redeCadastroAutorizada || campoRedeAcesso.value;

  if (
    !usuarioId ||
    usuarioId === ADMIN_UID ||
    usuarioId !== campoUsuarioAcesso.value ||
    !redePerfil
  ) {
    mensagemAcesso.textContent = "Selecione a pessoa e a Rede.";
    return;
  }

  if (!idsCelulas.length && !permiteCadastro) {
    mensagemAcesso.textContent =
      "Marque uma célula ou permita cadastrar células. Para retirar todas as autorizações, usaremos o botão Revogar acesso.";
    return;
  }

  const pessoa = campoUsuarioAcesso.selectedOptions[0].textContent;

  const resumoCelulas = idsCelulas.map((id) => {
    const celula = celulasAcesso.find((item) => item.id === id);
    return celula ? `${celula.nome} (${celula.redeId})` : id;
  }).join("\n");

  const nomeRedeCadastro = Array.from(campoRedeAcesso.options)
    .find((opcao) => opcao.value === redeCadastroAutorizada)
    ?.textContent || redeCadastroAutorizada;

  if (!confirm(
    `SALVAR AUTORIZAÇÕES?\n\n` +
    `Pessoa: ${pessoa}\n\n` +
    `Gerenciar membros e pagamentos:\n${resumoCelulas || "Nenhuma célula"}\n\n` +
    `Cadastrar novas células: ${
      permiteCadastro ? nomeRedeCadastro : "Não permitido"
    }`
  )) return;

  salvandoAcesso = true;
  campoUsuarioAcesso.disabled = true;
  campoRedeAcesso.disabled = true;
  atualizarBotaoSalvarAcesso();
  mensagemAcesso.textContent = "Salvando autorizações…";

  try {
    await runTransaction(db, async (transacao) => {
      if (auth.currentUser?.uid !== ADMIN_UID) {
        throw new Error("Entre novamente com sua conta de administrador.");
      }

      const cadastro = await transacao.get(
        doc(db, "usuarios_site", usuarioId)
      );

      const rede = await transacao.get(
        doc(db, "redes", redePerfil)
      );

      if (!cadastro.exists()) {
        throw new Error("A pessoa não está mais na lista de usuários.");
      }

      if (!rede.exists() || rede.data().ativa !== true) {
        throw new Error("A Rede está indisponível.");
      }

      const referenciasCelulas = idsCelulas.map(
        (id) => doc(db, "celulas", id)
      );

      const documentosCelulas = await Promise.all(
        referenciasCelulas.map((referencia) =>
          transacao.get(referencia)
        )
      );

      for (const celula of documentosCelulas) {
        if (!celula.exists() || celula.data().ativa !== true) {
          throw new Error(
            "Uma das células está indisponível. Recarregue o painel."
          );
        }
      }

      const redesDasCelulas = [...new Set(
        documentosCelulas.map((celula) => celula.data().redeId)
      )];

      const documentosRedes = await Promise.all(
        redesDasCelulas.map((id) =>
          transacao.get(doc(db, "redes", id))
        )
      );

      if (documentosRedes.some(
        (rede) => !rede.exists() || rede.data().ativa !== true
      )) {
        throw new Error("Uma das Redes das células está indisponível.");
      }

      const primeiraCelulaDaRede = documentosCelulas.find(
        (celula) => celula.data().redeId === redePerfil
      );

      transacao.set(doc(db, "usuarios", usuarioId), {
        nome: cadastro.data().nome || cadastro.data().email,
        perfil: "lider",
        ativo: true,
        redeId: redePerfil,
        celulaId: primeiraCelulaDaRede?.id || "",
        celulasEditaveis: idsCelulas,
        podeCadastrarCelulas: permiteCadastro,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: ADMIN_UID
      }, { merge: true });
    });

    if (auth.currentUser?.uid === ADMIN_UID) {
      mensagemAcesso.textContent =
        "Autorizações salvas. Peça que a pessoa recarregue o site para atualizar os botões.";
    }
  } catch (erro) {
    console.error("Erro ao salvar autorizações:", erro);

    if (auth.currentUser?.uid === ADMIN_UID) {
      mensagemAcesso.textContent =
        `Não foi possível salvar: ${erro.message}`;
    }
  } finally {
    salvandoAcesso = false;

    if (auth.currentUser?.uid === ADMIN_UID) {
      campoUsuarioAcesso.disabled = false;
      campoRedeAcesso.disabled = false;
    }

    atualizarBotaoSalvarAcesso();
  }
});

onAuthStateChanged(auth, async (usuario) => {
  const versao = ++versaoAcessos;

  painelAcessos.classList.add("hidden");
  campoUsuarioAcesso.disabled = true;
  campoUsuarioAcesso.replaceChildren(
    new Option("Selecione uma pessoa", "")
  );
  mensagemAcesso.textContent = "";

++versaoPerfilAcesso;
usuarioAcessoCarregado = "";
atualizarBotaoSalvarAcesso();
celulasMarcadas = new Set();
redeCadastroAutorizada = "";
atualizarCaixaCadastroCelulas();

celulasAcesso = [];
campoRedeAcesso.disabled = true;
campoRedeAcesso.replaceChildren(
  new Option("Selecione uma Rede", "")
);
mostrarCelulasAcesso();

if (usuario?.uid !== ADMIN_UID) return;

  painelAcessos.classList.remove("hidden");
  mensagemAcesso.textContent = "Carregando pessoas…";

  try {
    const [resultado, resultadoRedes, resultadoCelulas] =
  await Promise.all([
    getDocs(collection(db, "usuarios_site")),
    getDocs(collection(db, "redes")),
    getDocs(collection(db, "celulas"))
  ]);

    if (
      versao !== versaoAcessos ||
      auth.currentUser?.uid !== ADMIN_UID
    ) {
      return;
    }

    const redesDisponiveis = resultadoRedes.docs
  .map((documento) => ({
    ...documento.data(),
    id: documento.id
  }))
  .filter((rede) => rede.ativa === true)
  .sort((a, b) =>
    (a.nome || a.id).localeCompare(
      b.nome || b.id,
      "pt-BR",
      { numeric: true }
    )
  );

for (const rede of redesDisponiveis) {
  campoRedeAcesso.add(
    new Option(rede.nome || rede.id, rede.id)
  );
}

celulasAcesso = resultadoCelulas.docs.map((documento) => ({
  ...documento.data(),
  id: documento.id
}));

campoRedeAcesso.disabled = redesDisponiveis.length === 0;
mostrarCelulasAcesso();

    const pessoas = resultado.docs
      .filter((documento) => documento.id !== ADMIN_UID)
      .map((documento) => ({
        uid: documento.id,
        ...documento.data()
      }))
      .sort((a, b) =>
        (a.nome || a.email || "").localeCompare(
          b.nome || b.email || "",
          "pt-BR"
        )
      );

    for (const pessoa of pessoas) {
      const identificacao = pessoa.nome
        ? `${pessoa.nome} — ${pessoa.email}`
        : pessoa.email;

      campoUsuarioAcesso.add(
        new Option(identificacao, pessoa.uid)
      );
    }

    campoUsuarioAcesso.disabled = pessoas.length === 0;

    mensagemAcesso.textContent = pessoas.length
      ? `${pessoas.length} pessoa(s) disponível(is).`
      : "Nenhuma outra pessoa cadastrada ainda. Peça que ela entre no site e depois recarregue esta página.";
  } catch (erro) {
    if (
      versao !== versaoAcessos ||
      auth.currentUser?.uid !== ADMIN_UID
    ) {
      return;
    }

    console.error("Erro ao listar usuários:", erro);
    mensagemAcesso.textContent =
      "Não foi possível carregar as pessoas. Confira o Console.";
  }
});

botaoRevogarAcesso.addEventListener("click", async () => {
  if (salvandoAcesso || auth.currentUser?.uid !== ADMIN_UID) return;

  const usuarioId = usuarioAcessoCarregado;
  const versao = versaoPerfilAcesso;

  if (
    !usuarioId ||
    usuarioId === ADMIN_UID ||
    usuarioId !== campoUsuarioAcesso.value
  ) {
    return;
  }

  const pessoa = campoUsuarioAcesso.selectedOptions[0].textContent;

  if (!confirm(
    `REVOGAR AUTORIZAÇÕES?\n\n` +
    `Pessoa: ${pessoa}\n\n` +
    `Serão retiradas todas as autorizações para gerenciar ` +
    `membros, pagamentos e cadastrar células.\n\n` +
    `A pessoa continuará podendo consultar os dados.`
  )) return;

  salvandoAcesso = true;
  campoUsuarioAcesso.disabled = true;
  campoRedeAcesso.disabled = true;
  atualizarBotaoSalvarAcesso();
  mensagemAcesso.textContent = "Revogando autorizações…";

  try {
    await runTransaction(db, async (transacao) => {
      if (auth.currentUser?.uid !== ADMIN_UID) {
        throw new Error("Entre novamente como administrador.");
      }

      const referencia = doc(db, "usuarios", usuarioId);
      const perfil = await transacao.get(referencia);

      if (!perfil.exists()) return;

      transacao.update(referencia, {
        ativo: false,
        celulasEditaveis: [],
        podeCadastrarCelulas: false,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: ADMIN_UID
      });
    });

    if (
      auth.currentUser?.uid === ADMIN_UID &&
      versao === versaoPerfilAcesso &&
      campoUsuarioAcesso.value === usuarioId
    ) {
      celulasMarcadas = new Set();
      redeCadastroAutorizada = "";

      mostrarCelulasAcesso();
      atualizarCaixaCadastroCelulas();

      mensagemAcesso.textContent =
        "Autorizações revogadas. A pessoa mantém acesso à consulta dos dados.";
    }
  } catch (erro) {
    console.error("Erro ao revogar autorizações:", erro);

    if (
      auth.currentUser?.uid === ADMIN_UID &&
      versao === versaoPerfilAcesso
    ) {
      mensagemAcesso.textContent =
        `Não foi possível revogar: ${erro.message}`;
    }
  } finally {
    salvandoAcesso = false;

    if (auth.currentUser?.uid === ADMIN_UID) {
      campoUsuarioAcesso.disabled = false;
      campoRedeAcesso.disabled = false;
    }

    atualizarBotaoSalvarAcesso();
  }
});