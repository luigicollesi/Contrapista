"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import { createStandaloneCase } from "@/lib/cases";
import { getMinimumCluesPerPlayer, getTrueCluePercentageStates } from "@/lib/room-config";

export type CaseGenerationState = { error?: string };

function readInteger(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

export async function createAdminCase(
  _previousState: CaseGenerationState,
  formData: FormData,
): Promise<CaseGenerationState> {
  const session = await getAdminSession();

  if (!session) {
    redirect("/auth/entrar?callbackUrl=/adm");
  }

  const clueCount = readInteger(formData, "clueCount");
  const playerCount = readInteger(formData, "playerCount");
  const trueCluePercentage = readInteger(formData, "trueCluePercentage");

  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 10) {
    return { error: "Escolha entre 1 e 10 usuários." };
  }

  const minimumCluesPerPlayer = getMinimumCluesPerPlayer(playerCount);

  if (
    !Number.isInteger(clueCount) ||
    clueCount < minimumCluesPerPlayer ||
    clueCount > 10
  ) {
    return {
      error: `Escolha entre ${minimumCluesPerPlayer} e 10 dicas por jogador.`,
    };
  }

  if (
    !Number.isInteger(trueCluePercentage) ||
    !getTrueCluePercentageStates(playerCount, clueCount).includes(
      trueCluePercentage,
    )
  ) {
    return { error: "Escolha uma quantidade válida de dicas verdadeiras (mínimo de 3)." };
  }

  let gameCase;

  try {
    gameCase = await createStandaloneCase({
      clueCount,
      playerCount,
      trueCluePercentage,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível criar o caso agora.",
    };
  }

  redirect(`/adm/cases/${gameCase.id}`);
}
