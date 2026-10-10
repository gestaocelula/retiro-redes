import { auth, db } from "./firebase-config.js";

import { carregarPermissoes } from "./permissoes.js";

import {
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const ADMIN_UID = "kVdR1Q1tsOVm5cYDN8tHrshCsIJ3";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const btnLogin = document.getElementById("btn-login");
const btnLogout = document.getElementById("btn-logout");
const userInfo = document.getElementById("user-info");
const userEmail = document.getElementById("user-email");

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function habilitarBotao(botao) {
  botao.disabled = false;
  botao.removeAttribute("aria-disabled");
}

habilitarBotao(btnLogin);
habilitarBotao(btnLogout);

btnLogin.addEventListener("click", async () => {
  btnLogin.disabled = true;

  try {
    await signInWithPopup(auth, provider);
  } catch (erro) {
    console.error("Erro no login:", erro);

    if (erro.code !== "auth/popup-closed-by-user") {
      alert(`Não foi possível entrar. Código: ${erro.code}`);
    }
  } finally {
    habilitarBotao(btnLogin);
  }
});

btnLogout.addEventListener("click", async () => {
  btnLogout.disabled = true;

  try {
    await signOut(auth);
  } catch (erro) {
    console.error("Erro ao sair:", erro);
    alert("Não foi possível sair. Tente novamente.");
  } finally {
    habilitarBotao(btnLogout);
  }
});

async function registrarUsuarioNoSite(usuario) {
  if (!usuario.email) {
    throw new Error("A conta conectada não possui e-mail.");
  }

  const referencia = doc(db, "usuarios_site", usuario.uid);

  await runTransaction(db, async (transacao) => {
    if (auth.currentUser?.uid !== usuario.uid) {
      throw new Error("A conta conectada mudou.");
    }

    const cadastro = await transacao.get(referencia);

    // Preserva o cadastro quando ele já existe.
    if (cadastro.exists()) return;

    transacao.set(referencia, {
      nome: (usuario.displayName || "").trim().slice(0, 120),
      email: usuario.email,
      criadoEm: serverTimestamp()
    });
  });
}

let versaoPerfil = 0;

onAuthStateChanged(auth, async (usuario) => {
  const versao = ++versaoPerfil;
  const painelAdmin = document.getElementById("painel-admin");

  // Mantém o painel oculto enquanto consulta a autorização.
  painelAdmin.classList.add("hidden");

  btnLogin.classList.toggle("hidden", Boolean(usuario));
  userInfo.classList.toggle("hidden", !usuario);

  userEmail.textContent = usuario
    ? usuario.email || "Usuário conectado"
    : "";

  if (!usuario) return;

  console.log("Usuário conectado. UID:", usuario.uid);

try {
  await registrarUsuarioNoSite(usuario);

  if (
    versao === versaoPerfil &&
    auth.currentUser?.uid === usuario.uid
  ) {
    console.log("Cadastro do usuário no site conferido.");
  }
} catch (erro) {
  if (
    versao === versaoPerfil &&
    auth.currentUser?.uid === usuario.uid
  ) {
    console.error("Erro ao registrar usuário no site:", erro);
  }
}

if (
  versao !== versaoPerfil ||
  auth.currentUser?.uid !== usuario.uid
) {
  return;
}

try {
  const permissoes = await carregarPermissoes(usuario);

    if (
      versao !== versaoPerfil ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    if (!permissoes) {
      console.log("Esta conta não possui um perfil ativo.");
      return;
    }

    console.log("Perfil carregado:", permissoes.perfil);
    console.log("Nome cadastrado:", permissoes.nome);

    const podeExibirPainel =
      permissoes.administrador ||
      (
        permissoes.podeCadastrarCelulas &&
        Boolean(permissoes.redeId)
      );

    painelAdmin.classList.toggle("hidden", !podeExibirPainel);
  } catch (erro) {
    if (
      versao !== versaoPerfil ||
      auth.currentUser?.uid !== usuario.uid
    ) {
      return;
    }

    console.error("Erro ao consultar o perfil:", erro);
    alert("Não foi possível consultar seu perfil de acesso.");
  }
});