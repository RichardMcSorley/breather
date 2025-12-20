import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/config";

export default async function Home() {
  const session = await getServerSession(authOptions);
  
  if (session) {
    redirect("/history");
  }
  
  redirect("/login");
}


