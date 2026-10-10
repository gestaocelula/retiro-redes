import { db } from "./firebase-config.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const ADMIN_UID = "kVdR1Q1tsOVm5cYDN8tHrshCsIJ3";

export async function carregarPermissoes(usuario) {
  if (!usuario) return null;

  const resultado = await getDoc(
    doc(db, "usuarios", usuario.uid)
  );

  if (!resultado.exists()) return null;

  const dados = resultado.data();

  if (dados.ativo !== true) return null;

  // O perfil admin é reservado à sua conta.
  if (dados.perfil === "admin" && usuario.uid !== ADMIN_UID) {
    return null;
  }

  return {
    uid: usuario.uid,
    nome: dados.nome || "",
    perfil: dados.perfil || "",
    administrador:
      usuario.uid === ADMIN_UID && dados.perfil === "admin",

    redeId: dados.redeId || "",
    celulaId: dados.celulaId || "",

    visualizacao:
      dados.visualizacao === "rede" ? "rede" : "celula",

    celulasEditaveis: Array.isArray(dados.celulasEditaveis)
      ? dados.celulasEditaveis.filter(
          (id) => typeof id === "string" && id !== ""
        )
      : [],

    podeCadastrarCelulas: dados.podeCadastrarCelulas === true
  };
}

export function podeCadastrarNaRede(permissoes, redeId) {
  if (!permissoes || !redeId) return false;

  if (permissoes.administrador) return true;

  return permissoes.podeCadastrarCelulas
    && permissoes.redeId === redeId;
}

export function podeEditarCelula(permissoes, celulaId) {
  if (!permissoes || !celulaId) return false;

  if (permissoes.administrador) return true;

  return Array.isArray(permissoes.celulasEditaveis) &&
    permissoes.celulasEditaveis.includes(celulaId);
}