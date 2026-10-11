import { useEffect } from 'react';

interface DocPageOptions {
  title: string;
  background: string;
  /** Identifica o documento para ajustes de estilo em `index.css`. */
  id: string;
}

/** As páginas de documentação rolam normalmente, ao contrário do protótipo, que ocupa a janela inteira. */
export function useDocPage({ title, background, id }: DocPageOptions) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      title: document.title,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      background: body.style.background,
    };
    document.title = title;
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    body.style.height = 'auto';
    body.style.background = background;
    body.dataset.doc = id;
    return () => {
      document.title = previous.title;
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.height = previous.bodyHeight;
      body.style.background = previous.background;
      delete body.dataset.doc;
    };
  }, [title, background, id]);
}
