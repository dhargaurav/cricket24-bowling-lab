import React from "react";
import "./../styles/globals.css";

/**
 * App Shell
 * ------------------------------------------------------------
 * Minimal Next.js root layout. Keep it lightweight and universal.
 */
export const metadata = {
  title: "Cricket 24 • Bowling Strategy Lab",
  description: "JSON-only roster • wicket-taking delivery planner with traps.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
