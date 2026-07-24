import { NavLink, Outlet } from "react-router-dom";
import styles from "./Layout.module.css";

export default function Layout() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <NavLink to="/" className={({ isActive }) => (isActive ? styles.active : "")}>
          Home
        </NavLink>
        <NavLink to="/about" className={({ isActive }) => (isActive ? styles.active : "")}>
          About
        </NavLink>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
