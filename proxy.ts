import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/history/:path*", "/bills/:path*", "/mileage/:path*", "/configuration/:path*", "/ocr-data/:path*", "/delivery-orders/:path*"],
};

