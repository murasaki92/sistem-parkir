import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../helpers/useAuth";
import { AuthLoadingState } from "../components/AuthLoadingState";

export default function HomePage() {
  const router = useRouter();
  const { authState } = useAuth();

  useEffect(() => {
    if (authState.type === "authenticated") {
      router.replace("/cashier");
    } else if (authState.type === "unauthenticated") {
      router.replace("/login");
    }
  }, [authState.type, router]);

  return <AuthLoadingState title="Menyiapkan Parkline..." />;
}
