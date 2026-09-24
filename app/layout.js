import "./globals.css";

export const metadata = {
  title: "Shipclock — Project timeline estimator",
  description: "Estimate when your project can ship with deterministic logic and an AI planning review."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
