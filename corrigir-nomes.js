import { auth, db } from "./firebase-config.js";

import {
  collection,
  getDocs,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export async function corrigirNomes() {
  const usuario = auth.currentUser;

  if (usuario?.uid !== "kVdR1Q1tsOVm5cYDN8tHrshCsIJ3") {
    alert("Entre com sua conta de administrador.");
    return;
  }

  const resultado = await getDocs(collection(db, "celulas"));

  const ajustes = resultado.docs
    .map((documento) => ({
      referencia: documento.ref,
      ...documento.data()
    }))
    .filter((celula) =>
      /^R\d+$/.test(celula.codigo || "") &&
      celula.nome === `Refúgio ${celula.codigo}`
    )
    .map((celula) => ({
      ...celula,
      novoNome: `Refúgio ${celula.codigo.slice(1)}`
    }));

  if (ajustes.length === 0) {
    alert("Nenhum nome precisa de correção.");
    return;
  }

  if (ajustes.length > 100) {
    throw new Error("Há mais de 100 correções. Precisamos dividir em grupos.");
  }

  const lista = ajustes.map((celula) =>
    `${celula.redeId}: ${celula.nome} → ${celula.novoNome}`
  ).join("\n");

  if (!confirm(
    `Corrigir ${ajustes.length} nome(s)?\n\n${lista}\n\n` +
    "Os códigos e os vínculos com membros e pagamentos serão mantidos."
  )) return;

  const quantidade = await runTransaction(db, async (transacao) => {
    const atuais = await Promise.all(
      ajustes.map((celula) => transacao.get(celula.referencia))
    );

    let corrigidas = 0;

    ajustes.forEach((celula, indice) => {
      const atual = atuais[indice];

      if (
        !atual.exists() ||
        atual.data().codigo !== celula.codigo ||
        atual.data().nome !== celula.nome ||
        atual.data().redeId !== celula.redeId
      ) {
        throw new Error("Uma célula mudou. Execute novamente para conferir.");
      }
    });

    for (const celula of ajustes) {
      transacao.update(celula.referencia, {
        nome: celula.novoNome,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: usuario.uid
      });

      corrigidas++;
    }

    return corrigidas;
  });

  alert(`${quantidade} nome(s) corrigido(s). Recarregue a página.`);
}