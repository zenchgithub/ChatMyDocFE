import { motion, AnimatePresence } from "motion/react";
import LogoMark from "../LogoMark";
import "./style.scss";

interface Props {
  visible: boolean;
}

export default function SplashScreen({ visible }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          className="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          <motion.div
            className="splash__inner"
            initial={{ scale: 0.82, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <LogoMark size={64} variant="lg" />
            <div style={{ textAlign: "center" }}>
              <h1 className="splash__title">
                ChatMyDocs<span className="splash__dot">.ai</span>
              </h1>
              <p className="splash__tagline">
                Chat with your documents. Get smart,
                <br />
                summarized answers with citations.
              </p>
            </div>
            <div className="splash__dots">
              <span className="splash__dot-pulse" />
              <span className="splash__dot-pulse" />
              <span className="splash__dot-pulse" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
