"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function RouteHeader() {
  const pathname = usePathname();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const session = localStorage.getItem("specloop-session");
    if (session) setUserName(JSON.parse(session).name);
  }, []);

  function onLogout() {
    localStorage.removeItem("specloop-session");
    setUserName("");
  }

  return (
    <header className="topbar route-topbar">
      <Link className="brand" href="/">
        <span className="brand-mark">∞</span> SpecResearch Loop
      </Link>
      <nav aria-label="Điều hướng chính">
        <Link className={pathname === "/" ? "active" : ""} href="/">
          ⌂ Trang chủ
        </Link>
        <Link
          className={pathname.startsWith("/step") ? "active" : ""}
          href="/step/2"
        >
          ▣ Dự án
        </Link>
        <Link className={pathname === "/final" ? "active" : ""} href="/final">
          ◴ Lịch sử phiên bản
        </Link>
        <Link href="/step/4">? Trợ giúp</Link>
      </nav>
      {userName ? (
        <button className="profile-button" onClick={onLogout} title="Đăng xuất">
          {userName.slice(0, 2).toUpperCase()} <span>{userName}</span>
        </button>
      ) : (
        <Link className="login-button" href="/">
          Đăng nhập
        </Link>
      )}
    </header>
  );
}
