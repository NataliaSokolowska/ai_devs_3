import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link href="/tasks/01">
          <button type="button" className={styles.button}>
            Przejdź do Zadania 1
          </button>
        </Link>
        <Link href="/tasks/02">
          <button type="button" className={styles.button}>
            Przejdź do Zadania 2
          </button>
        </Link>
        <Link href="/tasks/03">
          <button type="button" className={styles.button}>
            Przejdź do Zadania 3
          </button>
        </Link>
      </main>
    </div>
  );
}
