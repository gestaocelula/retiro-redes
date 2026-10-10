import { auth, db } from "./firebase-config.js";

import {
  collection,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
  deleteField
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const ADMIN_UID = "kVdR1Q1tsOVm5cYDN8tHrshCsIJ3";
let executando = false;

export async function migrarContatos() {
  if (executando) return;

  if (auth.currentUser?.uid !== ADMIN_UID) {
    throw new Error("Entre com sua conta de administrador.");
  }

  executando = true;

  try {
    const resultado = await getDocs(
      collection(db, "pagamentos_retiro")
    );

    const antigos = resultado.docs.filter((documento) =>
      Object.prototype.hasOwnProperty.call(
        documento.data(),
        "whatsapp"
      )
    );

    if (antigos.length === 0) {
      console.log("Nenhum pagamento precisa de transferência.");
      return;
    }

    if (!confirm(
      `Transferir o campo WhatsApp de ${antigos.length} pagamento(s)?\n\n` +
      "Valores, datas e históricos financeiros serão preservados."
    )) return;

    let processados = 0;

    for (const documento of antigos) {
      if (auth.currentUser?.uid !== ADMIN_UID) {
        throw new Error("A sessão de administrador foi encerrada.");
      }

      await runTransaction(db, async (transacao) => {
        const pagamento = await transacao.get(documento.ref);

        if (!pagamento.exists()) return;

        const dados = pagamento.data();

        if (!Object.prototype.hasOwnProperty.call(dados, "whatsapp")) {
          return;
        }

        if (typeof dados.whatsapp !== "string") {
          throw new Error(
            `Confira o telefone no pagamento ${documento.id}: tipo inesperado.`
          );
        }

        if (dados.whatsapp !== "") {
          const campos = ["retiroId", "membroId", "redeId", "celulaId"];

          if (campos.some((campo) =>
            typeof dados[campo] !== "string" || !dados[campo]
          )) {
            throw new Error(
              `Confira os vínculos do pagamento ${documento.id}.`
            );
          }

          const referenciaContato = doc(
            db,
            "contatos_pagamentos",
            documento.id
          );

          const contato = await transacao.get(referenciaContato);

          if (contato.exists()) {
            const existente = contato.data();

            if (
              existente.whatsapp !== dados.whatsapp ||
              existente.pagamentoId !== documento.id ||
              campos.some((campo) => existente[campo] !== dados[campo])
            ) {
              throw new Error(
                `Contato divergente no pagamento ${documento.id}. Nada foi alterado nele.`
              );
            }
          } else {
            transacao.set(referenciaContato, {
              pagamentoId: documento.id,
              retiroId: dados.retiroId,
              membroId: dados.membroId,
              redeId: dados.redeId,
              celulaId: dados.celulaId,
              whatsapp: dados.whatsapp,
              criadoEm: dados.criadoEm || serverTimestamp(),
              criadoPor: dados.criadoPor || ADMIN_UID,
              migradoEm: serverTimestamp(),
              migradoPor: ADMIN_UID
            });
          }
        }

        transacao.update(documento.ref, {
          whatsapp: deleteField()
        });
      });

      processados++;
      console.log(`Transferência: ${processados}/${antigos.length}`);
    }

    const verificacao = await getDocs(
      collection(db, "pagamentos_retiro")
    );

    const restantes = verificacao.docs.filter((documento) =>
      Object.prototype.hasOwnProperty.call(documento.data(), "whatsapp")
    ).length;

    console.log(
      `Verificação final: ${restantes} pagamento(s) ainda possuem o campo WhatsApp.`
    );
  } finally {
    executando = false;
  }
}