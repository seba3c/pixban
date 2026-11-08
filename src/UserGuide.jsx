import { useEffect, useRef } from "react";
import { CircleHelp } from "lucide-react";
import Markdown from "react-markdown";
import english from "../docs/README.md?raw";
import spanish from "../docs/README.es.md?raw";

const icons = import.meta.glob("../docs/assets/icons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
const guideElements = ["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "code", "img"];
const components = {
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  img: ({ src, alt }) => {
    const url = icons[`../docs/${src}`];
    return url ? <img src={url} alt={alt} width="16" height="16" /> : null;
  },
};

export default function UserGuide({ lang, title, onClose, closeButton }) {
  const dialog = useRef();
  const content = useRef();
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        // The close button and the scrollable content are the two tab stops.
        event.preventDefault();
        const next = document.activeElement === content.current
          ? dialog.current.querySelector("button")
          : content.current;
        next.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <section ref={dialog} className="user-guide" role="dialog" aria-modal="true" aria-labelledby="user-guide-title">
      <div className="user-guide-heading">
        <CircleHelp size={16} aria-hidden="true" />
        <h2 id="user-guide-title">{title}</h2>
        {closeButton}
      </div>
      <div className="user-guide-scroll" ref={content} tabIndex={0}>
        <article className="user-guide-content">
          <Markdown skipHtml allowedElements={guideElements} components={components}>
            {lang === "es" ? spanish : english}
          </Markdown>
        </article>
      </div>
    </section>
  );
}
