"use server";

import { revalidatePath } from "next/cache";
import { clearAiModelStandoff } from "@/lib/ai";
import { getAdminSession } from "@/lib/admin";

export async function resumeAiModel(apiKeySlot: string, modelSlot: string) {
  const session = await getAdminSession();

  if (!session) {
    return;
  }

  if (!/^\d+$/.test(apiKeySlot) || !/^\d+$/.test(modelSlot)) {
    return;
  }

  await clearAiModelStandoff(apiKeySlot, modelSlot);
  revalidatePath("/adm");
}
