import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const seletorRede = document.getElementById("filtro-rede");
const seletorCelula = document.getElementById("filtro-celula");

let celulas = [];

function atualizarCelulas() {
  const redeId = seletorRede.value;

  // Ao trocar de Rede, volta para a visão geral.
  seletorCelula.replaceChildren(
    new Option("Todas as células", "")
  );

  seletorCelula.disabled = !redeId;

  if (!redeId) return;

  const celulasDaRede = celulas.filter(
    (celula) => celula.redeId === redeId
  );

  for (const celula of celulasDaRede) {
    seletorCelula.add(new Option(celula.nome, celula.id));
  }
}

seletorRede.addEventListener("change", atualizarCelulas);

// Prepara as opções ao abrir a página.
atualizarCelulas();
const contextoSelecionado = document.getElementById(
  "contexto-selecionado"
);

function atualizarContexto() {
  const redeId = seletorRede.value;
  const celulaId = seletorCelula.value;

  if (!redeId) {
    contextoSelecionado.textContent = "Visualização: todas as redes";
    return;
  }

  const nomeRede = seletorRede.selectedOptions[0].textContent;

  if (!celulaId) {
    contextoSelecionado.textContent =
      `Visualização: ${nomeRede} — todas as células`;
    return;
  }

  const nomeCelula = seletorCelula.selectedOptions[0].textContent;

  contextoSelecionado.textContent =
    `Visualização: ${nomeRede} — ${nomeCelula}`;
}

seletorRede.addEventListener("change", atualizarContexto);
seletorCelula.addEventListener("change", atualizarContexto);

atualizarContexto();

const seletorRedeCadastro =
  document.getElementById("cadastro-celulas-rede");

onAuthStateChanged(auth, async (usuario) => {
  celulas = [];

  seletorRede.replaceChildren(new Option("Todas as redes", ""));
  seletorRedeCadastro.replaceChildren(
    new Option("Selecione a Rede", "")
  );

  atualizarCelulas();
  atualizarContexto();

    if (!usuario) {
    return;
  }

  try {
    const [resultado, resultadoCelulas] = await Promise.all([
  getDocs(collection(db, "redes")),
  getDocs(collection(db, "celulas"))
]);

    // Evita preencher os seletores se a conta mudou durante a leitura.
    if (auth.currentUser?.uid !== usuario.uid) return;
    
    celulas = resultadoCelulas.docs
  .map((documento) => ({
    ...documento.data(),
    id: documento.id
  }))
  .filter((celula) => celula.ativa === true)
  .sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })
  );

    const redes = resultado.docs
      .map((documento) => ({
        ...documento.data(),
        id: documento.id
      }))
      .filter((rede) => rede.ativa === true)
      .sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })
      );

    for (const rede of redes) {
      seletorRede.add(new Option(rede.nome, rede.id));
      seletorRedeCadastro.add(new Option(rede.nome, rede.id));
    }

    atualizarCelulas();
    atualizarContexto();
  } catch (erro) {
    console.error("Erro ao carregar Redes:", erro);
    contextoSelecionado.textContent =
      "Não foi possível carregar as Redes. Recarregue a página.";
  }
});