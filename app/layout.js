import "./globals.css";

export const metadata = {
  title: "Shipclock — Will it ship?",
  description: "Forecast when (and whether) your side project ships: an LLM ensemble plans the work, a Monte Carlo simulation does the odds."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
