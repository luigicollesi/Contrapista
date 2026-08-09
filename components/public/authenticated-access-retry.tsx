"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type AuthenticatedAccessRetryProps = {
  callbackUrl: string;
};

export function AuthenticatedAccessRetry({
  callbackUrl,
}: AuthenticatedAccessRetryProps) {
  const { status } = useSession();
  const router = useRouter();
  const hasRetriedAccess = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || hasRetriedAccess.current) {
      return;
    }

    hasRetriedAccess.current = true;
    router.replace(callbackUrl);
  }, [callbackUrl, router, status]);

  return null;
}
