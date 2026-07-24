import ShoreScene from "../ShoreScene";
import styles from "./Home.module.css";

export default function Home() {
  return (
    <>
      <ShoreScene />
      <p className={styles.caption}>
        This is my test site. It works on my Raspberry PI 5! At home!
      </p>
    </>
  );
}
