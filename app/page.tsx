import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link href="/tasks/01">
          <button className={styles.button}>Przejdź do Zadania 1</button>
        </Link>
      </main>

    </div>
  );
}
