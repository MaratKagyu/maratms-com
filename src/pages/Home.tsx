import PixiBackground from "../PixiBackground";
import styles from "./Home.module.css";

export default function Home() {
  return (
    <>
      <PixiBackground />
      <p className={styles.caption}>
        This is my test site. It works on my Raspberry PI 5! At home!
      </p>
    </>
  );
}
