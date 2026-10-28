import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../helpers/useAuth";
import { homePathForRole } from "../helpers/home";
import { AuthLoadingState } from "../components/AuthLoadingState";

export default function HomePage() {
  const router = useRouter();
  const { authState } = useAuth();

  useEffect(() => {
    if (authState.type === "authenticated") {
      router.replace(homePathForRole(authState.user.role));
    } else if (authState.type === "unauthenticated") {
      router.replace("/login");
    }
  }, [authState.type, router]);

  return <AuthLoadingState title="Menyiapkan Parkline..." />;
}
